// scryfall-fetch downloads Scryfall Oracle Cards bulk data, generates the parser
// Go data file, and populates D1 + Vectorize when --d1-database-id is provided.
//
// Usage: go run ./plugins/mtga/tools/scryfall-fetch [--d1-database-id=UUID] [--vectorize-index=NAME]
//
// Generated files:
//   - plugins/mtga/parser/data/arena_cards_gen.go  (minimal: arena_id → name/set/rarity)
//
// D1 population (when --d1-database-id set):
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
	"path/filepath"
	"runtime"
	"slices"
	"sort"
	"strings"
	"text/template"
	"time"
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

	// Find project root (where go.mod lives).
	_, thisFile, _, _ := runtime.Caller(0)
	pluginDir := filepath.Join(filepath.Dir(thisFile), "..", "..")

	fmt.Println("Fetching Scryfall bulk data index...")
	downloadURL, err := getOracleCardsURL()
	if err != nil {
		return fmt.Errorf("fetching bulk data index: %w", err)
	}

	fmt.Printf("Downloading Oracle Cards from %s...\n", downloadURL)
	cards, err := downloadAndFilter(downloadURL)
	if err != nil {
		return fmt.Errorf("downloading cards: %w", err)
	}
	fmt.Printf("Found %d Arena cards\n", len(cards))

	// Deduplicate by arena_id. Scryfall has both original and Alchemy-rebalanced
	// ("A-" prefixed) cards sharing the same arena_id. Prefer the non-Alchemy
	// version since the original card is canonical.
	byID := make(map[int]ScryfallCard, len(cards))
	for _, c := range cards {
		if existing, ok := byID[c.ArenaID]; ok {
			// Prefer the non-Alchemy version (no "A-" prefix).
			if strings.HasPrefix(existing.Name, "A-") && !strings.HasPrefix(c.Name, "A-") {
				byID[c.ArenaID] = c
			}
			continue
		}
		byID[c.ArenaID] = c
	}
	cards = make([]ScryfallCard, 0, len(byID))
	for _, c := range byID {
		cards = append(cards, c)
	}
	fmt.Printf("After dedup: %d unique arena_ids\n", len(cards))

	// Sort by arena_id for deterministic output.
	sort.Slice(cards, func(i, j int) bool {
		return cards[i].ArenaID < cards[j].ArenaID
	})

	parserPath := filepath.Join(pluginDir, "parser", "data", "arena_cards_gen.go")
	if err := generateParserData(parserPath, cards); err != nil {
		return fmt.Errorf("generating parser data: %w", err)
	}
	fmt.Printf("Generated %s (%d cards)\n", parserPath, len(cards))

	// ── Cloudflare population (D1 + Vectorize) ──────────────
	needsD1 := *d1DatabaseID != "" && *cfAccountID != "" && *cfAPIToken != ""
	needsVectorize := *vectorizeIndex != "" && *cfAccountID != "" && *cfAPIToken != ""

	if needsD1 {
		fmt.Println("\nPopulating D1 tables...")
		sql := buildCardImportSQL(cards)
		fmt.Printf("Generated %.1f MB of SQL (%d cards)\n", float64(len(sql))/1048576, len(cards))
		if err := importD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
			return fmt.Errorf("D1 import: %w", err)
		}
		fmt.Println("D1 population complete")
	}

	if needsVectorize {
		fmt.Println("\nPopulating Vectorize index...")
		if err := populateCardVectorize(*cfAccountID, *vectorizeIndex, *cfAPIToken, cards); err != nil {
			return fmt.Errorf("populating vectorize: %w", err)
		}
		fmt.Println("Vectorize population complete")
	}

	return nil
}

func getOracleCardsURL() (string, error) {
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
		if entry.Type == "oracle_cards" {
			return entry.DownloadURI, nil
		}
	}
	return "", fmt.Errorf("oracle_cards not found in bulk data response")
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
		cards = append(cards, card)
	}

	return cards, nil
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

// generateParserData writes the minimal arena_id → card name mapping for the parser.
func generateParserData(path string, cards []ScryfallCard) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	var buf strings.Builder
	if err := parserTmpl.Execute(&buf, templateData{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Cards:     cards,
	}); err != nil {
		return err
	}

	return os.WriteFile(path, []byte(buf.String()), 0o644)
}

type templateData struct {
	Timestamp string
	Cards     []ScryfallCard
}

func goStr(s string) string {
	return fmt.Sprintf("%q", s)
}

var funcMap = template.FuncMap{
	"goStr": goStr,
}

var parserTmpl = template.Must(template.New("parser").Funcs(funcMap).Parse(`// Code generated by plugins/mtga/tools/scryfall-fetch. DO NOT EDIT.
// Source: Scryfall Oracle Cards (scryfall.com)
// Card data copyright Wizards of the Coast, LLC.
// Generated: {{ .Timestamp }}

package data

// ArenaCard is the minimal card info needed by the parser for name resolution.
type ArenaCard struct {
	Name   string
	Set    string
	Rarity string
}

// ArenaCards maps MTGA arena_id to card info.
// {{ len .Cards }} cards from Scryfall bulk data.
var ArenaCards = map[int]ArenaCard{
{{- range .Cards }}
	{{ .ArenaID }}: {Name: {{ goStr .Name }}, Set: {{ goStr .Set }}, Rarity: {{ goStr .Rarity }}},
{{- end }}
}
`))
