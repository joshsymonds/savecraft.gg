// scryfall-fetch populates magic_cards in D1 with all Magic cards from
// Scryfall's default_cards bulk data (~113k cards). It is the sole writer
// to magic_cards — mtga-carddb only generates arena_cards_gen.go for the parser.
//
// Usage: go run ./plugins/mtga/tools/scryfall-fetch --d1-database-id=UUID [--vectorize-index=NAME]
//
// D1 population:
//   - Wipes and repopulates magic_cards with all Scryfall cards
//   - Arena cards get arena_id from Scryfall + MTGA client fallback
//   - DFC back-face arena_ids stored in arena_id_back on the front face's row
//   - Rebuilds magic_cards_fts from default printings
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
	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// ScryfallCard represents the fields we extract from each Scryfall card object.
type ScryfallCard struct {
	ScryfallID    string            `json:"id"`           // Scryfall's unique card ID (per printing)
	ArenaID       int               `json:"arena_id"`     // MTGA arena_id (0 if not on Arena)
	ArenaIDBack   int               `json:"-"`            // DFC back-face arena_id (merged from MTGA client data)
	OracleID      string            `json:"oracle_id"`
	Name          string            `json:"name"`
	PrintedName   string            `json:"printed_name"` // Arena alternate name for UB cards (e.g., "Kavaero, Mind-Bitten")
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
	Power         string            `json:"power"`
	Toughness     string            `json:"toughness"`
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
	fmt.Printf("Found %d cards (%d unique oracle_ids)\n", len(cards), countUniqueOracleIDs(cards))

	// Merge DFC back-face arena_ids from MTGA client data onto front-face rows.
	mergeBackFaceArenaIDs(cards)

	// Backfill: MTGA client cards not in Scryfall at all (emblems, Arena-only
	// game objects) get synthetic scryfall_ids and are appended.
	backfilled := backfillArenaOnly(cards, result.nameIndex)
	if len(backfilled) > 0 {
		cards = append(cards, backfilled...)
		fmt.Printf("Backfilled %d Arena-only cards not in Scryfall (emblems, tokens)\n", len(backfilled))
	}

	// Mark one default printing per oracle_id. Prefer Arena printings.
	computeDefaults(cards)

	// Sort by scryfall_id for deterministic output.
	sort.Slice(cards, func(i, j int) bool {
		return cards[i].ScryfallID < cards[j].ScryfallID
	})

	// ── Cloudflare population (D1 + Vectorize) ──────────────
	// D1 and Vectorize are independent — run them concurrently when both are requested.
	var wg sync.WaitGroup
	errs := make(chan error, 2)

	if *d1DatabaseID != "" {
		wg.Go(func() {
			fmt.Println("\nPopulating D1 tables...")
			sql := buildCardSQL(cards)

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

// downloadResult holds all Scryfall cards and a name-based index for
// backfilling Arena-only cards not in Scryfall.
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
	// Used to resolve arena_id for Arena cards where Scryfall lacks it.
	arenaLookup := buildArenaLookup()

	// Name-based index for backfilling Arena-only cards not in Scryfall.
	nameIndex := make(map[string]ScryfallCard)

	// Deduplicate by scryfall_id.
	seen := make(map[string]struct{})

	var cards []ScryfallCard
	var resolved int
	for dec.More() {
		var card ScryfallCard
		if err := dec.Decode(&card); err != nil {
			return downloadResult{}, fmt.Errorf("decoding card: %w", err)
		}

		// Deduplicate by scryfall_id.
		if _, ok := seen[card.ScryfallID]; ok {
			continue
		}
		seen[card.ScryfallID] = struct{}{}

		// Split/adventure/DFC cards: extract front face name.
		if before, _, ok := strings.Cut(card.Name, " // "); ok {
			card.FrontFaceName = before
		} else {
			card.FrontFaceName = card.Name
		}

		// Index every card by front face name for backfill lookups.
		nameKey := strings.ToLower(card.FrontFaceName)
		if existing, ok := nameIndex[nameKey]; !ok || len(card.Legalities) > len(existing.Legalities) {
			nameIndex[nameKey] = card
		}
		// Also index by printed_name (Arena alternate name for UB cards).
		if card.PrintedName != "" {
			printedKey := strings.ToLower(card.PrintedName)
			if before, _, ok := strings.Cut(printedKey, " // "); ok {
				printedKey = before
			}
			if existing, ok := nameIndex[printedKey]; !ok || len(card.Legalities) > len(existing.Legalities) {
				nameIndex[printedKey] = card
			}
		}

		// For Arena cards, resolve arena_id from Scryfall or MTGA client fallback.
		if slices.Contains(card.Games, "arena") && card.ArenaID == 0 {
			key := arenaKey{strings.ToLower(card.FrontFaceName), strings.ToLower(card.Set)}
			if id, ok := arenaLookup[key]; ok {
				card.ArenaID = id
				resolved++
			}
		}

		cards = append(cards, card)
	}

	if resolved > 0 {
		fmt.Printf("Resolved %d arena_ids from MTGA client data (Scryfall bulk data was missing them)\n", resolved)
	}
	return downloadResult{cards: cards, nameIndex: nameIndex}, nil
}

// mergeBackFaceArenaIDs finds MTGA client cards that are DFC back faces
// (not matched by front_face_name to any Scryfall card) and stores their
// arena_id as ArenaIDBack on the matching front-face Scryfall card.
func mergeBackFaceArenaIDs(cards []ScryfallCard) {
	// Build set of arena_ids already on front-face cards.
	frontIDs := make(map[int]struct{}, len(cards))
	for _, c := range cards {
		if c.ArenaID > 0 {
			frontIDs[c.ArenaID] = struct{}{}
		}
	}

	// Build (lowercase_name, lowercase_set) → card index for merging.
	type nameSetKey struct{ name, set string }
	frontIndex := make(map[nameSetKey]int, len(cards))
	for i, c := range cards {
		key := nameSetKey{strings.ToLower(c.FrontFaceName), strings.ToLower(c.Set)}
		frontIndex[key] = i
	}

	var merged int
	for arenaID, card := range data.ArenaCards {
		if _, ok := frontIDs[arenaID]; ok {
			continue // already a front-face match
		}
		// This MTGA card wasn't matched — it's likely a DFC back face.
		// Try to find its front face in our Scryfall cards by (name, set).
		// Back faces in MTGA have their own name; look for any Scryfall card
		// in the same set whose full Name contains " // back_face_name".
		name := strings.ToLower(card.Name)
		if before, _, ok := strings.Cut(name, " // "); ok {
			name = before
		}
		// First try direct (name, set) match — handles cases where the back
		// face name IS the front face name of another card (rare).
		key := nameSetKey{name, card.Set}
		if idx, ok := frontIndex[key]; ok {
			if cards[idx].ArenaIDBack == 0 {
				cards[idx].ArenaIDBack = arenaID
				merged++
			}
			continue
		}
		// Search all cards in same set for one whose Name includes this as back face.
		for i, c := range cards {
			if strings.ToLower(c.Set) != card.Set {
				continue
			}
			_, backPart, ok := strings.Cut(c.Name, " // ")
			if !ok {
				continue
			}
			if strings.ToLower(backPart) == name && cards[i].ArenaIDBack == 0 {
				cards[i].ArenaIDBack = arenaID
				merged++
				break
			}
		}
	}
	if merged > 0 {
		fmt.Printf("Merged %d DFC back-face arena_ids onto front-face cards\n", merged)
	}
}

// backfillArenaOnly finds MTGA client cards that don't exist in Scryfall at
// all (Arena-only emblems, tokens, event cards). These get synthetic
// scryfall_ids of the form "arena-{arena_id}".
func backfillArenaOnly(cards []ScryfallCard, nameIndex map[string]ScryfallCard) []ScryfallCard {
	// Build set of all arena_ids already in cards (front + back).
	matchedIDs := make(map[int]struct{}, len(cards)*2)
	for _, c := range cards {
		if c.ArenaID > 0 {
			matchedIDs[c.ArenaID] = struct{}{}
		}
		if c.ArenaIDBack > 0 {
			matchedIDs[c.ArenaIDBack] = struct{}{}
		}
	}

	var backfilled []ScryfallCard
	for arenaID, card := range data.ArenaCards {
		if _, ok := matchedIDs[arenaID]; ok {
			continue
		}
		name := strings.ToLower(card.Name)
		if before, _, ok := strings.Cut(name, " // "); ok {
			name = before
		}
		// If Scryfall has this card by name, it was already collected —
		// this arena_id just wasn't linked. Skip it to avoid duplicates.
		if sc, ok := nameIndex[name]; ok && sc.ScryfallID != "" {
			continue
		}
		frontFace := card.Name
		if before, _, ok := strings.Cut(frontFace, " // "); ok {
			frontFace = before
		}
		backfilled = append(backfilled, ScryfallCard{
			ScryfallID:    fmt.Sprintf("arena-%d", arenaID),
			ArenaID:       arenaID,
			OracleID:      fmt.Sprintf("arena-%d", arenaID),
			Name:          card.Name,
			FrontFaceName: frontFace,
			Rarity:        card.Rarity,
			Set:           card.Set,
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

// computeDefaults marks one printing per oracle_id as IsDefault = true.
// Prefers Arena printings (highest arena_id) over non-Arena printings.
// Among non-Arena printings, picks the first one encountered (stable by scryfall_id sort).
func computeDefaults(cards []ScryfallCard) {
	best := make(map[string]int) // oracle_id → index in cards slice
	for i, c := range cards {
		prev, exists := best[c.OracleID]
		if !exists {
			best[c.OracleID] = i
			continue
		}
		prevCard := cards[prev]
		// Prefer Arena printings over non-Arena.
		if c.ArenaID > 0 && prevCard.ArenaID == 0 {
			best[c.OracleID] = i
		} else if c.ArenaID > 0 && prevCard.ArenaID > 0 && c.ArenaID > prevCard.ArenaID {
			// Among Arena printings, prefer highest arena_id.
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
