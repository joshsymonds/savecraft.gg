// scryfall-fetch downloads Scryfall Oracle Cards bulk data and generates Go source
// files for the MTGA parser and reference plugins.
//
// Usage: go run ./plugins/mtga/tools/scryfall-fetch
//
// Generated files:
//   - plugins/mtga/parser/data/arena_cards_gen.go  (minimal: arena_id → name/set/rarity)
//   - plugins/mtga/reference/data/cards_gen.go     (full card data for search/queries)
package main

import (
	"encoding/json"
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

	refPath := filepath.Join(pluginDir, "reference", "data", "cards_gen.go")
	if err := generateReferenceData(refPath, cards); err != nil {
		return fmt.Errorf("generating reference data: %w", err)
	}
	fmt.Printf("Generated %s (%d cards)\n", refPath, len(cards))

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

// generateReferenceData writes the full card data for the reference module.
// Uses JSON embed + runtime decode to avoid WASM "function too big" on large map literals.
func generateReferenceData(path string, cards []ScryfallCard) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	// Write JSON data file.
	type jsonCard struct {
		ArenaID       int               `json:"arenaId"`
		Name          string            `json:"name"`
		ManaCost      string            `json:"manaCost"`
		CMC           float64           `json:"cmc"`
		TypeLine      string            `json:"typeLine"`
		OracleText    string            `json:"oracleText"`
		Colors        []string          `json:"colors"`
		ColorIdentity []string          `json:"colorIdentity"`
		Legalities    map[string]string `json:"legalities"`
		Rarity        string            `json:"rarity"`
		Set           string            `json:"set"`
		Keywords      []string          `json:"keywords"`
	}
	jsonCards := make(map[string]jsonCard, len(cards))
	for _, c := range cards {
		jsonCards[fmt.Sprintf("%d", c.ArenaID)] = jsonCard{
			ArenaID: c.ArenaID, Name: c.Name, ManaCost: c.ManaCost,
			CMC: c.CMC, TypeLine: c.TypeLine, OracleText: c.OracleText,
			Colors: c.Colors, ColorIdentity: c.ColorIdentity,
			Legalities: c.Legalities, Rarity: c.Rarity, Set: c.Set,
			Keywords: c.Keywords,
		}
	}
	jsonBytes, err := json.Marshal(jsonCards)
	if err != nil {
		return fmt.Errorf("marshaling cards JSON: %w", err)
	}
	jsonPath := filepath.Join(dir, "cards.json")
	if err := os.WriteFile(jsonPath, jsonBytes, 0o644); err != nil {
		return err
	}

	// Write Go wrapper.
	var buf strings.Builder
	if err := referenceTmpl.Execute(&buf, templateData{
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

func goStrSlice(ss []string) string {
	if len(ss) == 0 {
		return "nil"
	}
	parts := make([]string, len(ss))
	for i, s := range ss {
		parts[i] = fmt.Sprintf("%q", s)
	}
	return "[]string{" + strings.Join(parts, ", ") + "}"
}

func goLegalities(m map[string]string) string {
	if len(m) == 0 {
		return "nil"
	}
	// Sort keys for deterministic output.
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var parts []string
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%q: %q", k, m[k]))
	}
	return "map[string]string{" + strings.Join(parts, ", ") + "}"
}

var funcMap = template.FuncMap{
	"goStr":        goStr,
	"goStrSlice":   goStrSlice,
	"goLegalities": goLegalities,
	"printf":       fmt.Sprintf,
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

var referenceTmpl = template.Must(template.New("reference").Funcs(funcMap).Parse(`// Code generated by plugins/mtga/tools/scryfall-fetch. DO NOT EDIT.
// Source: Scryfall Oracle Cards (scryfall.com)
// Card data copyright Wizards of the Coast, LLC.
// Generated: {{ .Timestamp }}

package data

import (
	_ "embed"
	"encoding/json"
	"strconv"
)

// Card contains full Scryfall card data for reference module queries.
type Card struct {
	ArenaID       int               ` + "`" + `json:"arenaId"` + "`" + `
	Name          string            ` + "`" + `json:"name"` + "`" + `
	ManaCost      string            ` + "`" + `json:"manaCost"` + "`" + `
	CMC           float64           ` + "`" + `json:"cmc"` + "`" + `
	TypeLine      string            ` + "`" + `json:"typeLine"` + "`" + `
	OracleText    string            ` + "`" + `json:"oracleText"` + "`" + `
	Colors        []string          ` + "`" + `json:"colors"` + "`" + `
	ColorIdentity []string          ` + "`" + `json:"colorIdentity"` + "`" + `
	Legalities    map[string]string ` + "`" + `json:"legalities"` + "`" + `
	Rarity        string            ` + "`" + `json:"rarity"` + "`" + `
	Set           string            ` + "`" + `json:"set"` + "`" + `
	Keywords      []string          ` + "`" + `json:"keywords"` + "`" + `
}

//go:embed cards.json
var cardsJSON []byte

// Cards contains all Arena cards indexed by arena_id.
// Decoded from embedded JSON at init time to avoid WASM "function too big" on map literals.
var Cards map[int]Card

func init() {
	var raw map[string]Card
	if err := json.Unmarshal(cardsJSON, &raw); err != nil {
		panic("failed to decode Scryfall cards: " + err.Error())
	}
	Cards = make(map[int]Card, len(raw))
	for k, v := range raw {
		id, _ := strconv.Atoi(k)
		Cards[id] = v
	}
}
`))
