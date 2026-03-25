// tagger-fetch scrapes Scryfall Tagger function tags and derives card roles
// for MTGA sets, populating the mtga_card_roles D1 table with four role
// categories: creature, removal, mana_fixing, noncreature_nonremoval.
//
// Scryfall Tagger is a community-driven tagging system. The "function:" search
// syntax queries Oracle Tags that describe card roles. These are NOT included
// in Scryfall bulk data — they must be fetched via the search API.
//
// Creature roles are derived from mtga_cards.type_line in D1 (requires
// scryfall-fetch to run first). noncreature_nonremoval is computed as the
// remainder: any card not tagged as creature, removal, or mana_fixing.
//
// Cards can have multiple roles (e.g., a creature with an ETB removal effect
// gets both "creature" and "removal").
//
// Usage: go run ./plugins/mtga/tools/tagger-fetch --d1-database-id=UUID [--set=DSK]
//
// Rate limit: 50ms between Scryfall API requests.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/cfapi"
	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/sets"
)

// taggerRoles maps Scryfall Tagger function tags to D1 role names.
// Multiple function tags can map to the same role (e.g., sweeper → removal).
var taggerRoles = map[string]string{
	"removal":      "removal",
	"sweeper":      "removal",
	"counterspell": "removal",
	"mana-fixer":   "mana_fixing",
}

type scryfallList struct {
	Data     []scryfallCard `json:"data"`
	HasMore  bool           `json:"has_more"`
	NextPage string         `json:"next_page"`
}

type scryfallCard struct {
	OracleID string `json:"oracle_id"`
	Name     string `json:"name"`
	Set      string `json:"set"`
}

// roleEntry is one (card, role) pair for a set.
type roleEntry struct {
	OracleID      string
	FrontFaceName string
	Role          string
	SetCode       string
}

// roleKey uniquely identifies a card+role in a set for deduplication.
type roleKey struct {
	OracleID string
	Role     string
	SetCode  string
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfAccountID := flag.String("cf-account-id", os.Getenv("CLOUDFLARE_ACCOUNT_ID"), "Cloudflare account ID")
	cfAPIToken := flag.String("cf-api-token", os.Getenv("CLOUDFLARE_API_TOKEN"), "Cloudflare API token")
	d1DatabaseID := flag.String("d1-database-id", "", "D1 database ID (required)")
	setFilter := flag.String("set", "", "Process a single set (e.g., 'DSK'). If empty, processes all sets.")
	flag.Parse()

	targetSets := sets.MTGA
	if *setFilter != "" {
		upper := strings.ToUpper(*setFilter)
		if !slices.Contains(sets.MTGA, upper) {
			return fmt.Errorf("unknown set %q; available: %v", *setFilter, sets.MTGA)
		}
		targetSets = []string{upper}
	}

	// Phase 1: Fetch Scryfall Tagger function tags.
	seen := make(map[roleKey]struct{})
	var allEntries []roleEntry

	for _, setCode := range targetSets {
		for tag, role := range taggerRoles {
			entries, err := fetchTaggedCards(setCode, tag, role)
			if err != nil {
				fmt.Printf("  WARN: %s/%s failed: %v\n", setCode, tag, err)
				continue
			}
			fmt.Printf("  %s function:%s → %d cards (role: %s)\n", setCode, tag, len(entries), role)
			for _, e := range entries {
				key := roleKey{e.OracleID, e.Role, e.SetCode}
				if _, ok := seen[key]; ok {
					continue // Deduplicate: same card+role already seen from another tag.
				}
				seen[key] = struct{}{}
				allEntries = append(allEntries, e)
			}
		}
	}

	fmt.Printf("Phase 1 (tagger): %d role entries across %d sets\n", len(allEntries), len(targetSets))

	if *d1DatabaseID == "" || *cfAccountID == "" || *cfAPIToken == "" {
		fmt.Println("No --d1-database-id specified; skipping creature derivation and D1 population.")
		return nil
	}

	// Phase 2: Derive creature roles from mtga_cards type_line in D1.
	// Also collect all oracle_ids per set for remainder computation.
	for _, setCode := range targetSets {
		creatures, allCards, err := fetchCreaturesAndAllCards(*cfAccountID, *d1DatabaseID, *cfAPIToken, setCode)
		if err != nil {
			fmt.Printf("  WARN: %s creature derivation failed: %v (continuing)\n", setCode, err)
			continue
		}

		for _, e := range creatures {
			key := roleKey{e.OracleID, e.Role, e.SetCode}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			allEntries = append(allEntries, e)
		}
		fmt.Printf("  %s creatures: %d cards\n", setCode, len(creatures))

		// Phase 3: Compute noncreature_nonremoval as remainder.
		var remainder int
		for _, card := range allCards {
			hasRole := false
			for _, role := range []string{"creature", "removal", "mana_fixing"} {
				key := roleKey{card.OracleID, role, setCode}
				if _, ok := seen[key]; ok {
					hasRole = true
					break
				}
			}
			if !hasRole {
				entry := roleEntry{
					OracleID:      card.OracleID,
					FrontFaceName: card.FrontFaceName,
					Role:          "noncreature_nonremoval",
					SetCode:       setCode,
				}
				key := roleKey{card.OracleID, entry.Role, setCode}
				if _, ok := seen[key]; !ok {
					seen[key] = struct{}{}
					allEntries = append(allEntries, entry)
					remainder++
				}
			}
		}
		fmt.Printf("  %s noncreature_nonremoval: %d cards\n", setCode, remainder)
	}

	fmt.Printf("Total: %d role entries across %d sets\n", len(allEntries), len(targetSets))

	sql := buildRolesImportSQL(allEntries)
	fmt.Printf("Generated %.1f KB of SQL\n", float64(len(sql))/1024)
	if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
		return fmt.Errorf("D1 import: %w", err)
	}
	fmt.Println("D1 population complete")

	return nil
}

// d1Card is a minimal card record from D1 for role derivation.
type d1Card struct {
	OracleID      string
	FrontFaceName string
	TypeLine      string
}

// fetchCreaturesAndAllCards queries D1 for all default cards in a set.
// Returns creature role entries and the full card list (for remainder computation).
func fetchCreaturesAndAllCards(accountID, databaseID, apiToken, setCode string) ([]roleEntry, []d1Card, error) {
	sql := fmt.Sprintf(
		"SELECT oracle_id, front_face_name, type_line FROM mtga_cards WHERE set_code = %s AND is_default = 1",
		cfapi.SQLQuote(strings.ToLower(setCode)),
	)
	rows, err := cfapi.QueryD1(accountID, databaseID, apiToken, sql)
	if err != nil {
		return nil, nil, err
	}

	var creatures []roleEntry
	var allCards []d1Card

	for _, row := range rows {
		oracleID, _ := row["oracle_id"].(string)
		frontFace, _ := row["front_face_name"].(string)
		typeLine, _ := row["type_line"].(string)
		if oracleID == "" || frontFace == "" {
			continue
		}

		allCards = append(allCards, d1Card{
			OracleID:      oracleID,
			FrontFaceName: frontFace,
			TypeLine:      typeLine,
		})

		if strings.Contains(typeLine, "Creature") {
			creatures = append(creatures, roleEntry{
				OracleID:      oracleID,
				FrontFaceName: frontFace,
				Role:          "creature",
				SetCode:       strings.ToUpper(setCode),
			})
		}
	}

	return creatures, allCards, nil
}

// fetchTaggedCards queries Scryfall for cards matching a function tag in a set.
// Handles pagination and respects rate limits.
func fetchTaggedCards(setCode string, tag string, role string) ([]roleEntry, error) {
	query := fmt.Sprintf("function:%s set:%s", tag, strings.ToLower(setCode))
	searchURL := "https://api.scryfall.com/cards/search?q=" + url.QueryEscape(query)

	var entries []roleEntry
	client := &http.Client{Timeout: 30 * time.Second}

	for pageURL := searchURL; pageURL != ""; {
		time.Sleep(50 * time.Millisecond) // Scryfall rate limit.

		req, err := http.NewRequest("GET", pageURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "Savecraft/1.0 (savecraft.gg)")
		req.Header.Set("Accept", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		// 404 = no results for this query (valid — not all sets have sweepers).
		if resp.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
		}

		var list scryfallList
		if err := json.Unmarshal(body, &list); err != nil {
			return nil, fmt.Errorf("decode: %w", err)
		}

		for _, card := range list.Data {
			frontFace := card.Name
			if before, _, ok := strings.Cut(card.Name, " // "); ok {
				frontFace = before
			}
			entries = append(entries, roleEntry{
				OracleID:      card.OracleID,
				FrontFaceName: frontFace,
				Role:          role,
				SetCode:       strings.ToUpper(setCode),
			})
		}

		if list.HasMore && list.NextPage != "" {
			pageURL = list.NextPage
		} else {
			pageURL = ""
		}
	}

	return entries, nil
}

// buildRolesImportSQL generates SQL for D1 bulk import of card role data.
func buildRolesImportSQL(entries []roleEntry) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	b.WriteString("DELETE FROM mtga_card_roles;\n")

	for _, e := range entries {
		fmt.Fprintf(&b, "INSERT INTO mtga_card_roles (oracle_id, front_face_name, role, set_code) VALUES (%s, %s, %s, %s);\n",
			q(e.OracleID), q(e.FrontFaceName), q(e.Role), q(e.SetCode))
	}

	return b.String()
}
