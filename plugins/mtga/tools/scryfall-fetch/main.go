// scryfall-fetch enriches existing MTGA-sourced card data in D1 with Scryfall
// metadata (oracle_id, legalities, keywords, oracle_text, produced_mana) and
// inserts non-Arena cards from Scryfall bulk data.
//
// Prerequisite: mtga-carddb must run first to populate D1 with base card data
// from the MTGA client database. This tool only enriches — it never deletes
// the mtga_cards table.
//
// Usage: go run ./plugins/mtga/tools/scryfall-fetch --d1-database-id=UUID [--vectorize-index=NAME]
//
// D1 enrichment:
//   - UPSERTs into mtga_cards (enriches existing rows, inserts non-Arena cards)
//   - Rebuilds mtga_cards_fts from enriched default printings
//   - Vectorize card embeddings (when --vectorize-index also set)
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/parser/data"
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
	ProducedMana  []string          `json:"produced_mana"`
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

	// Validate Cloudflare credentials early — don't download data we can't store.
	if *d1DatabaseID != "" || *vectorizeIndex != "" {
		var missing []string
		if *cfAccountID == "" {
			missing = append(missing, "--cf-account-id / CLOUDFLARE_ACCOUNT_ID")
		}
		if *cfAPIToken == "" {
			missing = append(missing, "--cf-api-token / CLOUDFLARE_API_TOKEN")
		}
		if len(missing) > 0 {
			return fmt.Errorf("Cloudflare output requested but missing: %s", strings.Join(missing, ", "))
		}
	}

	fmt.Println("Fetching Scryfall bulk data index...")
	downloadURL, err := getDefaultCardsURL()
	if err != nil {
		return fmt.Errorf("fetching bulk data index: %w", err)
	}

	fmt.Printf("Downloading Default Cards from %s...\n", downloadURL)
	result, err := downloadAndFilter(downloadURL)
	if err != nil {
		return fmt.Errorf("downloading cards: %w", err)
	}
	cards := result.cards
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

	// Backfill: MTGA client cards not matched by arena_id can still get
	// legalities via exact name match against the full Scryfall bulk data.
	backfilled := backfillFromNameIndex(cards, result.nameIndex)
	if len(backfilled) > 0 {
		cards = append(cards, backfilled...)
		fmt.Printf("Backfilled %d MTGA-only cards with Scryfall data via exact name match\n", len(backfilled))
	}

	// Mark the most recent Arena printing (highest arena_id) per oracle_id as default.
	computeDefaults(cards)

	// Sort by arena_id for deterministic output.
	sort.Slice(cards, func(i, j int) bool {
		return cards[i].ArenaID < cards[j].ArenaID
	})

	// ── Cloudflare population (D1 + Vectorize) ──────────────
	// D1 and Vectorize are independent — run them concurrently when both are requested.
	var wg sync.WaitGroup
	errs := make(chan error, 2)

	if *d1DatabaseID != "" {
		wg.Go(func() {
			fmt.Println("\nPopulating D1 tables...")
			sql := buildCardEnrichmentSQL(cards)

			// Content hash for change detection.
			h := sha256.Sum256([]byte(sql))
			contentHash := hex.EncodeToString(h[:])

			existing, err := cfapi.GetPipelineHash(*cfAccountID, *d1DatabaseID, *cfAPIToken, "scryfall", cfapi.PipelineGlobalSet)
			if err == nil && existing == contentHash {
				fmt.Println("D1 cards unchanged (hash match), skipping import")
				return
			}

			// Write SQL to disk before import.
			sqlDir := filepath.Join(os.TempDir(), "savecraft", "sql")
			os.MkdirAll(sqlDir, 0700)
			sqlPath := filepath.Join(sqlDir, "scryfall_cards.sql")
			os.WriteFile(sqlPath, []byte(sql), 0600)

			fmt.Printf("Generated %.1f MB of SQL (%d cards)\n", float64(len(sql))/1048576, len(cards))
			if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
				errs <- fmt.Errorf("D1 import: %w (SQL cached at %s)", err, sqlPath)
				return
			}
			os.Remove(sqlPath)

			if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "scryfall", cfapi.PipelineGlobalSet, contentHash, len(cards)); err != nil {
				fmt.Printf("WARN: pipeline state update failed: %v\n", err)
			}
			fmt.Println("D1 population complete")
		})
	}

	if *vectorizeIndex != "" {
		wg.Go(func() {
			// Only embed default printings — one vector per card name.
			var defaults []ScryfallCard
			for _, c := range cards {
				if c.IsDefault {
					defaults = append(defaults, c)
				}
			}
			fmt.Printf("\nPopulating Vectorize index (%d default cards)...\n", len(defaults))
			if err := populateCardVectorize(*cfAccountID, *vectorizeIndex, *cfAPIToken, defaults); err != nil {
				errs <- fmt.Errorf("populating vectorize: %w", err)
				return
			}
			fmt.Println("Vectorize population complete")
		})
	}

	wg.Wait()
	close(errs)

	// Collect all errors.
	var errMsgs []string
	for err := range errs {
		errMsgs = append(errMsgs, err.Error())
	}
	if len(errMsgs) > 0 {
		return fmt.Errorf("cloudflare population failed:\n  %s", strings.Join(errMsgs, "\n  "))
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

// downloadResult holds Arena-matched cards and a name-based index of all
// Scryfall cards for backfilling MTGA-only cards that weren't matched.
type downloadResult struct {
	cards     []ScryfallCard
	nameIndex map[string]ScryfallCard // lowercase front_face_name → best card (most legalities)
}

func downloadAndFilter(url string) (downloadResult, error) {
	resp, err := httpGet(url)
	if err != nil {
		return downloadResult{}, err
	}
	defer resp.Body.Close()

	dec := json.NewDecoder(resp.Body)

	// Expect opening '['.
	tok, err := dec.Token()
	if err != nil {
		return downloadResult{}, fmt.Errorf("reading opening token: %w", err)
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '[' {
		return downloadResult{}, fmt.Errorf("expected '[', got %v", tok)
	}

	// Build reverse lookup from MTGA client data: (name, set) → arena_id.
	// Scryfall bulk data often lacks arena_id for newer Universes Beyond sets
	// even when the cards are on Arena. The MTGA client database has 100% coverage.
	arenaLookup := buildArenaLookup()

	// Name-based index: for every card in the bulk data (not just Arena),
	// keep the entry with the most populated legalities. Used to backfill
	// MTGA client cards that Scryfall doesn't have an arena_id for.
	nameIndex := make(map[string]ScryfallCard)

	var cards []ScryfallCard
	var resolved int
	var unresolved []string
	for dec.More() {
		var card ScryfallCard
		if err := dec.Decode(&card); err != nil {
			return downloadResult{}, fmt.Errorf("decoding card: %w", err)
		}
		// Split/adventure/DFC cards: extract front face name.
		if before, _, ok := strings.Cut(card.Name, " // "); ok {
			card.FrontFaceName = before
		} else {
			card.FrontFaceName = card.Name
		}

		// Index every card by front face name for backfill lookups.
		// Prefer the entry with more legality data.
		nameKey := strings.ToLower(card.FrontFaceName)
		if existing, ok := nameIndex[nameKey]; !ok || len(card.Legalities) > len(existing.Legalities) {
			nameIndex[nameKey] = card
		}

		// Only collect Arena cards for the main enrichment pass.
		if !slices.Contains(card.Games, "arena") {
			continue
		}
		// Fall back to MTGA client data for arena_id when Scryfall doesn't have it.
		if card.ArenaID == 0 {
			key := arenaKey{strings.ToLower(card.FrontFaceName), strings.ToLower(card.Set)}
			if id, ok := arenaLookup[key]; ok {
				card.ArenaID = id
				resolved++
			} else {
				unresolved = append(unresolved, fmt.Sprintf("%s [%s]", card.Name, card.Set))
				continue
			}
		}
		cards = append(cards, card)
	}

	if resolved > 0 {
		fmt.Printf("Resolved %d arena_ids from MTGA client data (Scryfall bulk data was missing them)\n", resolved)
	}
	if len(unresolved) > 0 {
		fmt.Fprintf(os.Stderr, "WARN: %d Arena cards skipped (no arena_id in Scryfall or MTGA client data):\n", len(unresolved))
		for _, name := range unresolved {
			fmt.Fprintf(os.Stderr, "  %s\n", name)
		}
	}
	return downloadResult{cards: cards, nameIndex: nameIndex}, nil
}

// backfillFromNameIndex finds MTGA client cards that weren't matched to
// Scryfall by arena_id and enriches them via exact front_face_name match
// against the full Scryfall bulk data. Only exact matches are used —
// ambiguous or missing names are skipped.
func backfillFromNameIndex(matched []ScryfallCard, nameIndex map[string]ScryfallCard) []ScryfallCard {
	// Build set of arena_ids already matched.
	matchedIDs := make(map[int]struct{}, len(matched))
	for _, c := range matched {
		matchedIDs[c.ArenaID] = struct{}{}
	}

	var backfilled []ScryfallCard
	for arenaID, card := range data.ArenaCards {
		if _, ok := matchedIDs[arenaID]; ok {
			continue // already matched
		}
		name := strings.ToLower(card.Name)
		if before, _, ok := strings.Cut(name, " // "); ok {
			name = before
		}
		scryfall, ok := nameIndex[name]
		if !ok || len(scryfall.Legalities) == 0 {
			continue // no match or no legality data
		}
		backfilled = append(backfilled, ScryfallCard{
			ArenaID:       arenaID,
			OracleID:      scryfall.OracleID,
			Name:          scryfall.Name,
			FrontFaceName: scryfall.FrontFaceName,
			ManaCost:      scryfall.ManaCost,
			CMC:           scryfall.CMC,
			TypeLine:      scryfall.TypeLine,
			OracleText:    scryfall.OracleText,
			Colors:        scryfall.Colors,
			ColorIdentity: scryfall.ColorIdentity,
			Legalities:    scryfall.Legalities,
			Rarity:        scryfall.Rarity,
			Set:           scryfall.Set,
			Keywords:      scryfall.Keywords,
			ProducedMana:  scryfall.ProducedMana,
		})
	}
	return backfilled
}

type arenaKey struct {
	name string
	set  string
}

// buildArenaLookup creates a (front_face_name, set) → arena_id index from the
// generated ArenaCards map. MTGA stores full names for split/DFC cards (e.g.,
// "Fire // Ice") so we extract the front face to match Scryfall's FrontFaceName.
func buildArenaLookup() map[arenaKey]int {
	lookup := make(map[arenaKey]int, len(data.ArenaCards))
	for id, card := range data.ArenaCards {
		name := strings.ToLower(card.Name)
		// Extract front face name for split/adventure/DFC cards.
		if before, _, ok := strings.Cut(name, " // "); ok {
			name = before
		}
		key := arenaKey{name, card.Set} // card.Set already lowercase
		// Keep highest arena_id per (name, set) to match computeDefaults behavior.
		if existing, ok := lookup[key]; !ok || id > existing {
			lookup[key] = id
		}
	}
	return lookup
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
