// tagger-fetch scrapes Scryfall Tagger function tags (removal, sweeper,
// counterspell) for MTGA sets and populates the mtga_card_roles D1 table.
//
// Scryfall Tagger is a community-driven tagging system. The "function:" search
// syntax queries Oracle Tags that describe card roles. These are NOT included
// in Scryfall bulk data — they must be fetched via the search API.
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

// Tagger function tags to scrape. Each becomes a "role" in mtga_card_roles.
var roleTags = []string{
	"removal",
	"sweeper",
	"counterspell",
}

type scryfallList struct {
	Data    []scryfallCard `json:"data"`
	HasMore bool           `json:"has_more"`
	NextPage string        `json:"next_page"`
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

	var allEntries []roleEntry

	for _, setCode := range targetSets {
		for _, tag := range roleTags {
			entries, err := fetchTaggedCards(setCode, tag)
			if err != nil {
				fmt.Printf("  WARN: %s/%s failed: %v\n", setCode, tag, err)
				continue
			}
			fmt.Printf("  %s function:%s → %d cards\n", setCode, tag, len(entries))
			allEntries = append(allEntries, entries...)
		}
	}

	fmt.Printf("Total: %d role entries across %d sets\n", len(allEntries), len(targetSets))

	if *d1DatabaseID == "" || *cfAccountID == "" || *cfAPIToken == "" {
		fmt.Println("No --d1-database-id specified; skipping D1 population.")
		return nil
	}

	sql := buildRolesImportSQL(allEntries)
	fmt.Printf("Generated %.1f KB of SQL\n", float64(len(sql))/1024)
	if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
		return fmt.Errorf("D1 import: %w", err)
	}
	fmt.Println("D1 population complete")

	return nil
}

// fetchTaggedCards queries Scryfall for cards matching a function tag in a set.
// Handles pagination and respects rate limits.
func fetchTaggedCards(setCode string, tag string) ([]roleEntry, error) {
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
				Role:          tag,
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
