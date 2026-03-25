// scryfall-fetch downloads Scryfall Default Cards bulk data and populates
// D1 + Vectorize when --d1-database-id is provided. Stores all Arena printings
// in D1, with is_default=1 for the most recent printing per oracle_id (highest
// arena_id). FTS5 and Vectorize only index defaults.
//
// Note: Parser card name resolution (arena_cards_gen.go) is now handled by
// mtga-carddb, which reads MTGA's own Raw_CardDatabase for 100% coverage.
// This tool only handles D1/Vectorize population for the card_search MCP tool.
//
// Usage: go run ./plugins/mtga/tools/scryfall-fetch --d1-database-id=UUID [--vectorize-index=NAME]
//
// D1 population:
//   - mtga_cards + mtga_cards_fts tables via Cloudflare D1 bulk import API
//   - Vectorize card embeddings (when --vectorize-index also set)
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/cfapi"
)

// ScryfallCard represents the fields we extract from each Scryfall card object.
type ScryfallCard struct {
	ArenaID       int               `json:"arena_id"`
	OracleID      string            `json:"oracle_id"`
	Name          string            `json:"name"`
	ManaCost      string            `json:"mana_cost"`
	CMC           float64           `json:"cmc"`
	TypeLine      string            `json:"type_line"`
	OracleText    string            `json:"oracle_text"`
	Colors        []string          `json:"colors"`
	ColorIdentity []string          `json:"color_identity"`
	Legalities    map[string]string `json:"legalities"`
	Rarity        string            `json:"rarity"`
	Set           string            `json:"set"`
	Keywords      []string          `json:"keywords"`
	Games         []string          `json:"games"`
	IsDefault     bool              `json:"-"` // computed, not from Scryfall
	FrontFaceName string            `json:"-"` // computed: Name split on " // ", first part
}

// BulkDataResponse is the Scryfall /bulk-data API response.
type BulkDataResponse struct {
	Data []BulkDataEntry `json:"data"`
}

// BulkDataEntry is one bulk data download option.
type BulkDataEntry struct {
	Type        string `json:"type"`
	DownloadURI string `json:"download_uri"`
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
	d1DatabaseID := flag.String("d1-database-id", "", "D1 database ID (enables D1 population)")
	vectorizeIndex := flag.String("vectorize-index", "", "Vectorize index name (enables Vectorize population)")
	flag.Parse()

	fmt.Println("Fetching Scryfall bulk data index...")
	downloadURL, err := getDefaultCardsURL()
	if err != nil {
		return fmt.Errorf("fetching bulk data index: %w", err)
	}

	fmt.Printf("Downloading Default Cards from %s...\n", downloadURL)
	cards, err := downloadAndFilter(downloadURL)
	if err != nil {
		return fmt.Errorf("downloading cards: %w", err)
	}
	// Deduplicate by arena_id. default_cards can list multiple printings of the
	// same card sharing one arena_id (e.g., a set printing + a Historic Anthology
	// reprint). Keep only one entry per arena_id.
	seen := make(map[int]struct{}, len(cards))
	deduped := cards[:0]
	for _, c := range cards {
		if _, ok := seen[c.ArenaID]; ok {
			continue
		}
		seen[c.ArenaID] = struct{}{}
		deduped = append(deduped, c)
	}
	cards = deduped
	fmt.Printf("Found %d unique arena_ids (%d unique cards)\n", len(cards), countUniqueOracleIDs(cards))

	// Mark the most recent Arena printing (highest arena_id) per oracle_id as default.
	computeDefaults(cards)

	// Sort by arena_id for deterministic output.
	sort.Slice(cards, func(i, j int) bool {
		return cards[i].ArenaID < cards[j].ArenaID
	})

	// ── Cloudflare population (D1 + Vectorize) ──────────────
	needsD1 := *d1DatabaseID != "" && *cfAccountID != "" && *cfAPIToken != ""
	needsVectorize := *vectorizeIndex != "" && *cfAccountID != "" && *cfAPIToken != ""

	if needsD1 {
		fmt.Println("\nPopulating D1 tables...")
		sql := buildCardImportSQL(cards)
		fmt.Printf("Generated %.1f MB of SQL (%d cards)\n", float64(len(sql))/1048576, len(cards))
		if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
			return fmt.Errorf("D1 import: %w", err)
		}
		fmt.Println("D1 population complete")
	}

	if needsVectorize {
		// Only embed default printings — one vector per card name.
		var defaults []ScryfallCard
		for _, c := range cards {
			if c.IsDefault {
				defaults = append(defaults, c)
			}
		}
		fmt.Printf("\nPopulating Vectorize index (%d default cards)...\n", len(defaults))
		if err := populateCardVectorize(*cfAccountID, *vectorizeIndex, *cfAPIToken, defaults); err != nil {
			return fmt.Errorf("populating vectorize: %w", err)
		}
		fmt.Println("Vectorize population complete")
	}

	return nil
}

func getDefaultCardsURL() (string, error) {
	resp, err := httpGet("https://api.scryfall.com/bulk-data")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var bulk BulkDataResponse
	if err := json.NewDecoder(resp.Body).Decode(&bulk); err != nil {
		return "", fmt.Errorf("decoding bulk data response: %w", err)
	}

	for _, entry := range bulk.Data {
		if entry.Type == "default_cards" {
			return entry.DownloadURI, nil
		}
	}
	return "", fmt.Errorf("default_cards not found in bulk data response")
}

func downloadAndFilter(url string) ([]ScryfallCard, error) {
	resp, err := httpGet(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	dec := json.NewDecoder(resp.Body)

	// Expect opening '['.
	tok, err := dec.Token()
	if err != nil {
		return nil, fmt.Errorf("reading opening token: %w", err)
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '[' {
		return nil, fmt.Errorf("expected '[', got %v", tok)
	}

	var cards []ScryfallCard
	for dec.More() {
		var card ScryfallCard
		if err := dec.Decode(&card); err != nil {
			return nil, fmt.Errorf("decoding card: %w", err)
		}
		if card.ArenaID == 0 {
			continue
		}
		// Double-check: card must be available on Arena.
		if !slices.Contains(card.Games, "arena") {
			continue
		}
		// Split/adventure/DFC cards: extract front face name.
		if before, _, ok := strings.Cut(card.Name, " // "); ok {
			card.FrontFaceName = before
		} else {
			card.FrontFaceName = card.Name
		}
		cards = append(cards, card)
	}

	return cards, nil
}

// computeDefaults marks the highest arena_id per oracle_id as IsDefault = true.
// This makes the most recently added Arena printing the canonical one for
// search (FTS5) and Vectorize, while all printings remain in the structured table.
func computeDefaults(cards []ScryfallCard) {
	// Find highest arena_id per oracle_id.
	best := make(map[string]int) // oracle_id → index in cards slice
	for i, c := range cards {
		if prev, ok := best[c.OracleID]; !ok || c.ArenaID > cards[prev].ArenaID {
			best[c.OracleID] = i
		}
	}
	for _, idx := range best {
		cards[idx].IsDefault = true
	}
}

func countUniqueOracleIDs(cards []ScryfallCard) int {
	seen := make(map[string]struct{}, len(cards))
	for _, c := range cards {
		seen[c.OracleID] = struct{}{}
	}
	return len(seen)
}

func httpGet(url string) (*http.Response, error) {
	client := &http.Client{Timeout: 5 * time.Minute}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Savecraft/1.0 (savecraft.gg)")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
	}
	return resp, nil
}
