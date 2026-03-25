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
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
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

// setResult holds all role entries and per-tag counts for a single set from Phase 1.
type setResult struct {
	SetCode   string
	Entries   []roleEntry
	TagCounts map[string]int // tag → count of cards found
	Err       error          // first error encountered, if any
}

// phase2Result holds creature derivation results for a single set.
type phase2Result struct {
	SetCode    string
	Creatures  []roleEntry
	AllCards   []d1Card
	CreatureN  int
	RemainderN int
	Err        error
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

	// Validate Cloudflare credentials early — don't download data we can't store.
	if *d1DatabaseID != "" {
		var missing []string
		if *cfAccountID == "" {
			missing = append(missing, "--cf-account-id / CLOUDFLARE_ACCOUNT_ID")
		}
		if *cfAPIToken == "" {
			missing = append(missing, "--cf-api-token / CLOUDFLARE_API_TOKEN")
		}
		if len(missing) > 0 {
			return fmt.Errorf("--d1-database-id provided but missing: %s", strings.Join(missing, ", "))
		}
	}

	targetSets, err := sets.Resolve(context.Background(), *setFilter)
	if err != nil {
		return err
	}

	// Phase 1: Fetch Scryfall Tagger function tags (4 sets concurrently).
	sem := make(chan struct{}, 2) // Low concurrency to stay within Scryfall rate limits.
	results := make([]setResult, len(targetSets))
	var wg sync.WaitGroup

	for i, setCode := range targetSets {
		wg.Add(1)
		go func(idx int, sc string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results[idx] = fetchSetTags(sc)
		}(i, setCode)
	}
	wg.Wait()

	// Merge Phase 1 results and deduplicate.
	seen := make(map[roleKey]struct{})
	var allEntries []roleEntry

	for _, res := range results {
		if res.Err != nil {
			return fmt.Errorf("tagger fetch failed for %s: %w", res.SetCode, res.Err)
		}

		// Build summary line: "FDN: 84 removal, 12 mana_fixing"
		var parts []string
		for _, tag := range []string{"removal", "mana_fixing"} {
			parts = append(parts, fmt.Sprintf("%d %s", res.TagCounts[tag], tag))
		}
		fmt.Printf("  %s: %s\n", res.SetCode, strings.Join(parts, ", "))

		for _, e := range res.Entries {
			key := roleKey{e.OracleID, e.Role, e.SetCode}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			allEntries = append(allEntries, e)
		}
	}

	fmt.Printf("Phase 1 (tagger): %d role entries across %d sets\n", len(allEntries), len(targetSets))

	if *d1DatabaseID == "" {
		fmt.Println("No --d1-database-id specified; skipping creature derivation and D1 population.")
		return nil
	}

	// Phase 2: Derive creature roles from mtga_cards type_line in D1 (4 sets concurrently).
	p2Results := make([]phase2Result, len(targetSets))
	var wg2 sync.WaitGroup

	for i, setCode := range targetSets {
		wg2.Add(1)
		go func(idx int, sc string) {
			defer wg2.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			creatures, allCards, err := fetchCreaturesAndAllCards(*cfAccountID, *d1DatabaseID, *cfAPIToken, sc)
			p2Results[idx] = phase2Result{
				SetCode:   sc,
				Creatures: creatures,
				AllCards:  allCards,
				Err:       err,
			}
		}(i, setCode)
	}
	wg2.Wait()

	// Merge Phase 2 results: add creatures and compute remainders.
	for i := range p2Results {
		res := &p2Results[i]
		if res.Err != nil {
			fmt.Printf("  WARN: %s creature derivation failed: %v (continuing)\n", res.SetCode, res.Err)
			continue
		}

		for _, e := range res.Creatures {
			key := roleKey{e.OracleID, e.Role, e.SetCode}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			allEntries = append(allEntries, e)
			res.CreatureN++
		}

		// Auto-detect mana_fixing for multi-color lands (supplements Tagger Phase 1).
		fixingLands := detectFixingLands(res.AllCards, res.SetCode)
		var fixingN int
		for _, e := range fixingLands {
			key := roleKey{e.OracleID, e.Role, e.SetCode}
			if _, ok := seen[key]; ok {
				continue // Already tagged by Tagger in Phase 1.
			}
			seen[key] = struct{}{}
			allEntries = append(allEntries, e)
			fixingN++
		}

		// Derive CABS roles from existing roles + type_line.
		cabsEntries := deriveCABS(res.AllCards, seen, res.SetCode)
		var cabsN int
		for _, e := range cabsEntries {
			key := roleKey{e.OracleID, e.Role, e.SetCode}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			allEntries = append(allEntries, e)
			cabsN++
		}

		// Compute noncreature_nonremoval as remainder.
		for _, card := range res.AllCards {
			hasRole := false
			for _, role := range []string{"creature", "removal", "mana_fixing"} {
				key := roleKey{card.OracleID, role, res.SetCode}
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
					SetCode:       res.SetCode,
				}
				key := roleKey{card.OracleID, entry.Role, res.SetCode}
				if _, ok := seen[key]; !ok {
					seen[key] = struct{}{}
					allEntries = append(allEntries, entry)
					res.RemainderN++
				}
			}
		}

		fmt.Printf("  %s: %d creature, %d mana_fixing (land), %d cabs, %d noncreature_nonremoval\n", res.SetCode, res.CreatureN, fixingN, cabsN, res.RemainderN)
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

// fetchSetTags fetches all tagger function tags for a single set.
// Each tag query respects Scryfall's 50ms rate limit independently.
func fetchSetTags(setCode string) setResult {
	res := setResult{
		SetCode:   setCode,
		TagCounts: make(map[string]int),
	}

	for tag, role := range taggerRoles {
		entries, err := fetchTaggedCards(setCode, tag, role)
		if err != nil {
			res.Err = fmt.Errorf("%s/%s: %w", setCode, tag, err)
			return res
		}
		res.TagCounts[role] += len(entries)
		res.Entries = append(res.Entries, entries...)
	}

	return res
}

// d1Card is a minimal card record from D1 for role derivation.
type d1Card struct {
	OracleID      string
	FrontFaceName string
	TypeLine      string
	ProducedMana  string // JSON array from D1, e.g. '["W","U"]'
}

// fetchCreaturesAndAllCards queries D1 for all default cards in a set.
// Returns creature role entries and the full card list (for remainder computation).
func fetchCreaturesAndAllCards(accountID, databaseID, apiToken, setCode string) ([]roleEntry, []d1Card, error) {
	sql := fmt.Sprintf(
		"SELECT oracle_id, front_face_name, type_line, produced_mana FROM mtga_cards WHERE set_code = %s AND is_default = 1",
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
		producedMana, _ := row["produced_mana"].(string)
		if oracleID == "" || frontFace == "" {
			continue
		}

		allCards = append(allCards, d1Card{
			OracleID:      oracleID,
			FrontFaceName: frontFace,
			TypeLine:      typeLine,
			ProducedMana:  producedMana,
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

// deriveCABS returns "cabs" (Cards that Affect the Board State) role entries.
// A card is CABS if it has a creature or removal role, or if its type_line
// contains Aura, Equipment, Planeswalker, or Vehicle. Lands are excluded.
func deriveCABS(cards []d1Card, existingRoles map[roleKey]struct{}, setCode string) []roleEntry {
	sc := strings.ToUpper(setCode)
	var entries []roleEntry
	for _, card := range cards {
		if strings.Contains(card.TypeLine, "Land") {
			continue
		}
		// Check existing roles: creature or removal → CABS
		_, isCreature := existingRoles[roleKey{card.OracleID, "creature", sc}]
		_, isRemoval := existingRoles[roleKey{card.OracleID, "removal", sc}]
		if isCreature || isRemoval {
			entries = append(entries, roleEntry{
				OracleID:      card.OracleID,
				FrontFaceName: card.FrontFaceName,
				Role:          "cabs",
				SetCode:       sc,
			})
			continue
		}
		// Check type_line for board-affecting permanent types
		tl := card.TypeLine
		if strings.Contains(tl, "Aura") ||
			strings.Contains(tl, "Equipment") ||
			strings.Contains(tl, "Planeswalker") ||
			strings.Contains(tl, "Vehicle") {
			entries = append(entries, roleEntry{
				OracleID:      card.OracleID,
				FrontFaceName: card.FrontFaceName,
				Role:          "cabs",
				SetCode:       sc,
			})
		}
	}
	return entries
}

// detectFixingLands returns mana_fixing role entries for lands that produce 2+ colors.
// This supplements Tagger-based mana-fixer detection for lands that Tagger may miss.
func detectFixingLands(cards []d1Card, setCode string) []roleEntry {
	var entries []roleEntry
	for _, card := range cards {
		if !strings.Contains(card.TypeLine, "Land") {
			continue
		}
		if card.ProducedMana == "" {
			continue
		}
		var produced []string
		if err := json.Unmarshal([]byte(card.ProducedMana), &produced); err != nil {
			continue
		}
		// Count only real colors (WUBRG) — colorless ("C") doesn't count as mana fixing.
		var colorCount int
		for _, c := range produced {
			if c != "C" {
				colorCount++
			}
		}
		if colorCount > 1 {
			entries = append(entries, roleEntry{
				OracleID:      card.OracleID,
				FrontFaceName: card.FrontFaceName,
				Role:          "mana_fixing",
				SetCode:       strings.ToUpper(setCode),
			})
		}
	}
	return entries
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

		body, statusCode, err := scryfallGet(client, pageURL)
		if err != nil {
			return nil, err
		}

		// 404 = no results for this query (valid — not all sets have sweepers).
		if statusCode == http.StatusNotFound {
			return nil, nil
		}
		if statusCode != http.StatusOK {
			return nil, fmt.Errorf("HTTP %d: %s", statusCode, string(body[:min(len(body), 200)]))
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

// scryfallGet performs an HTTP GET with exponential backoff on 429 rate limits.
// Returns the response body, status code, and any error.
func scryfallGet(client *http.Client, url string) ([]byte, int, error) {
	const maxRetries = 5
	backoff := 10 * time.Second

	for attempt := range maxRetries {
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, 0, err
		}
		req.Header.Set("User-Agent", "Savecraft/1.0 (savecraft.gg)")
		req.Header.Set("Accept", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return nil, 0, err
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusTooManyRequests {
			return body, resp.StatusCode, nil
		}

		if attempt == maxRetries-1 {
			return body, resp.StatusCode, nil
		}

		fmt.Printf("    rate limited, retrying in %s (attempt %d/%d)\n", backoff, attempt+1, maxRetries)
		time.Sleep(backoff)
		backoff *= 2
	}

	// Unreachable, but satisfies the compiler.
	return nil, 0, fmt.Errorf("unreachable")
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
