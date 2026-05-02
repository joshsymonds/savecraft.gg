// tagger-fetch scrapes Scryfall Tagger function tags and derives card roles
// for MTGA sets, populating the magic_card_roles D1 table with four role
// categories: creature, removal, mana_fixing, noncreature_nonremoval.
//
// Scryfall Tagger is a community-driven tagging system. The "function:" search
// syntax queries Oracle Tags that describe card roles. These are NOT included
// in Scryfall bulk data — they must be fetched via the search API.
//
// Creature roles are derived from magic_cards.type_line in D1 (requires
// scryfall-fetch to run first). noncreature_nonremoval is computed as the
// remainder: any card not tagged as creature, removal, or mana_fixing.
//
// Cards can have multiple roles (e.g., a creature with an ETB removal effect
// gets both "creature" and "removal").
//
// Usage: go run ./plugins/magic/tools/tagger-fetch --d1-database-id=UUID [--set=DSK]
//
// Rate limit: 50ms between Scryfall API requests.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/magic/tools/internal/sets"
	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// taggerRoles maps Scryfall function tags → list of D1 roles. A single tag
// can fan out into multiple roles when one is the broader category of the
// other (every board wipe IS removal). Tags here are verified to exist on
// Scryfall (each returns ≥1 card via function:<tag> search). Verified
// 2026-05-01.
//
// NOT included (verified to return 0 cards across all sets):
//   - mana-fixer / mana-fixing: detectFixingLands derives this from
//     produced_mana on lands, which covers the common case (dual lands,
//     triomes). Non-land fixers (Chromatic Lantern, Arcane Signet) still
//     get tagged via mana-rock → ramp below.
//   - fast-mana: no Scryfall tag exists. Not needed for our use case —
//     bracket detection uses the Game Changers list (53 cards) which WotC
//     explicitly designed to capture fast-mana-as-bracket-signal. Every
//     canonical fast-mana card (Mana Crypt, Jeweled Lotus, Mana Vault,
//     Grim Monolith, Lotus Petal, Mox Diamond, Chrome Mox) is on Game
//     Changers AND has function:ramp; Sol Ring is the only exception (WotC
//     deliberately excluded it because of bracket-1 ubiquity).
var taggerRoles = map[string][]string{
	"ramp":          {"ramp"},
	"draw":          {"card_draw"},
	"tutor":         {"tutor"},
	"sweeper":       {"removal", "boardwipe"},
	"mass-removal":  {"removal", "boardwipe"},
	"removal":       {"removal"},
	"counterspell":  {"removal"},
	"extra-turn":    {"extra_turn"},
	"win-condition": {"win_condition"},
	// M1.2 additions — authoritative Scryfall tags discovered via deeper
	// probing. Counts are total cards across all sets (verified
	// 2026-05-01 via api.scryfall.com/cards/search?q=function:<tag>).
	"mass-land-denial": {"land_destruction"}, // 108 — bracket-critical, MLD floors at Bracket 4
	"card-advantage":   {"card_draw"},        // 5991 — broader than `draw`; catches Rhystic Study, Phyrexian Arena, Mystic Remora, Esper Sentinel
	"cantrip":          {"card_draw"},        // 603 — replace-itself effects (Brainstorm, Ponder)
	"wheel":            {"card_draw"},        // 135 — Wheel of Fortune, Windfall, Time Spiral
	"mana-dork":        {"ramp"},             // 414 — creature-based ramp (Llanowar Elves, Birds of Paradise)
	"mana-rock":        {"ramp"},             // 368 — generic mana rocks (Sol Ring, Arcane Signet, Commander's Sphere)
	"moxen":            {"ramp"},             // 13 — the Moxen specifically
}

// taggedCard is the raw shape returned from a Scryfall function-tag search,
// stripped of Scryfall-specific fields. expandTagToRoleEntries fans each
// card out across the role list a tag maps to.
type taggedCard struct {
	OracleID      string
	FrontFaceName string
}

// expandTagToRoleEntries produces one roleEntry per (card, role) pair. Used
// to turn "sweeper" search results into both "removal" AND "boardwipe"
// entries without making two Scryfall API calls.
func expandTagToRoleEntries(cards []taggedCard, roles []string, setCode string) []roleEntry {
	sc := strings.ToUpper(setCode)
	entries := make([]roleEntry, 0, len(cards)*len(roles))
	for _, card := range cards {
		for _, role := range roles {
			entries = append(entries, roleEntry{
				OracleID:      card.OracleID,
				FrontFaceName: card.FrontFaceName,
				Role:          role,
				SetCode:       sc,
			})
		}
	}
	return entries
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
	allCards := flag.Bool("all-cards", false, "Scope to every distinct set in magic_cards (not just MTGA-legal sets). Mutually exclusive with --set; requires --d1-database-id.")
	retry := flag.Bool("retry", false, "Retry mode: import cached SQL files without reprocessing")
	flag.Parse()

	// ── Retry mode ──
	if *retry {
		if *d1DatabaseID == "" {
			return fmt.Errorf("--retry requires --d1-database-id")
		}
		sqlDir := filepath.Join(cfapi.DefaultCacheDir(), "sql")
		return cfapi.RetryFromDisk(*cfAccountID, *d1DatabaseID, *cfAPIToken, sqlDir, "_roles.sql")
	}

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

	if *allCards && *setFilter != "" {
		return fmt.Errorf("--all-cards is mutually exclusive with --set")
	}
	if *allCards && *d1DatabaseID == "" {
		return fmt.Errorf("--all-cards requires --d1-database-id (set list comes from D1)")
	}

	var targetSets []string
	if *allCards {
		var err error
		targetSets, err = fetchAllSetCodes(*cfAccountID, *d1DatabaseID, *cfAPIToken)
		if err != nil {
			return fmt.Errorf("fetching set list from D1: %w", err)
		}
		fmt.Printf("--all-cards: %d sets in magic_cards\n", len(targetSets))
	} else {
		var err error
		targetSets, err = sets.Resolve(context.Background(), *setFilter)
		if err != nil {
			return err
		}
	}

	// Phase 1: Fetch Scryfall Tagger function tags. Concurrency=1 enforces
	// a strict global rate ceiling — Scryfall caps API usage at 10 req/s
	// and warns of network blocks on violations. With per-request 150ms
	// sleeps below, that's ~6.7 req/s effective, comfortably under cap.
	sem := make(chan struct{}, 1)
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

		// Summary line listing every role count, alphabetised so output is
		// stable across runs and easy to diff.
		roleNames := make([]string, 0, len(res.TagCounts))
		for r := range res.TagCounts {
			roleNames = append(roleNames, r)
		}
		sort.Strings(roleNames)
		var parts []string
		for _, r := range roleNames {
			parts = append(parts, fmt.Sprintf("%d %s", res.TagCounts[r], r))
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

	// Phase 2: Derive creature roles from magic_cards type_line in D1 (4 sets concurrently).
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

	// Group entries by set for per-set import.
	entriesBySet := make(map[string][]roleEntry)
	for _, e := range allEntries {
		entriesBySet[e.SetCode] = append(entriesBySet[e.SetCode], e)
	}

	// Determine SQL cache directory.
	sqlDir := filepath.Join(cfapi.DefaultCacheDir(), "sql")
	if err := os.MkdirAll(sqlDir, 0755); err != nil {
		return fmt.Errorf("creating SQL cache dir: %w", err)
	}

	// Batch-fetch all existing pipeline hashes in one query.
	existingHashes, _ := cfapi.GetAllPipelineHashes(*cfAccountID, *d1DatabaseID, *cfAPIToken, "tagger")
	if existingHashes == nil {
		existingHashes = make(map[string]string)
	}

	// Per-set import with hash checking.
	var importErrors []string
	for _, setCode := range targetSets {
		entries := entriesBySet[strings.ToUpper(setCode)]

		// Compute content hash from the card list for this set.
		contentHash := hashRoleEntries(entries)

		// Check pipeline state — skip if unchanged.
		if existingHashes[setCode] == contentHash {
			fmt.Printf("  %s: unchanged (hash match), skipping\n", setCode)
			continue
		}

		// Generate per-set SQL.
		sql := buildSetRolesSQL(strings.ToUpper(setCode), entries)
		sqlPath := filepath.Join(sqlDir, setCode+"_roles.sql")
		if err := os.WriteFile(sqlPath, []byte(sql), 0644); err != nil {
			return fmt.Errorf("writing roles SQL for %s: %w", setCode, err)
		}

		// Import.
		fmt.Printf("  %s: importing roles (%d entries, %.1f KB)...\n", setCode, len(entries), float64(len(sql))/1024)
		if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
			fmt.Printf("  FAIL: %s roles import: %v\n", setCode, err)
			importErrors = append(importErrors, setCode)
			continue
		}
		os.Remove(sqlPath)

		// Update pipeline state.
		if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "tagger", setCode, contentHash, len(entries)); err != nil {
			fmt.Printf("  WARN: %s pipeline state update failed: %v\n", setCode, err)
		}
	}

	if len(importErrors) > 0 {
		return fmt.Errorf("D1 import failed for %d sets: %s (SQL cached in %s)", len(importErrors), strings.Join(importErrors, ", "), sqlDir)
	}

	fmt.Println("D1 population complete")

	// Coverage report — surfaces the gap between magic_cards and the role
	// data downstream modules depend on. Bracket detection / composition
	// assessment only work on cards with ≥1 role tag.
	if covered, total, err := computeCoverage(*cfAccountID, *d1DatabaseID, *cfAPIToken); err != nil {
		fmt.Printf("WARN: coverage report failed: %v\n", err)
	} else if total > 0 {
		fmt.Printf("coverage: %d / %d default-printing oracle_ids have ≥1 role (%.1f%%)\n",
			covered, total, 100*float64(covered)/float64(total))
	}

	return nil
}

// hashRoleEntries computes a SHA-256 hash of role entries for content change detection.
func hashRoleEntries(entries []roleEntry) string {
	h := sha256.New()
	// Sort for deterministic hash.
	sorted := make([]string, len(entries))
	for i, e := range entries {
		sorted[i] = e.OracleID + "|" + e.Role + "|" + e.SetCode
	}
	sort.Strings(sorted)
	for _, s := range sorted {
		io.WriteString(h, s)
		io.WriteString(h, "\n")
	}
	return hex.EncodeToString(h.Sum(nil))
}

// fetchSetTags fetches all tagger function tags for a single set.
// Each tag query respects Scryfall's 50ms rate limit independently.
// Multi-role tags (sweeper → removal+boardwipe) make one Scryfall call
// then fan out in memory via expandTagToRoleEntries.
func fetchSetTags(setCode string) setResult {
	res := setResult{
		SetCode:   setCode,
		TagCounts: make(map[string]int),
	}

	for tag, roles := range taggerRoles {
		cards, err := fetchTaggedCards(setCode, tag)
		if err != nil {
			res.Err = fmt.Errorf("%s/%s: %w", setCode, tag, err)
			return res
		}
		entries := expandTagToRoleEntries(cards, roles, setCode)
		for _, role := range roles {
			res.TagCounts[role] += len(cards)
		}
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

// fetchAllSetCodes returns every distinct set_code in magic_cards (default
// printings only). Used by --all-cards mode to extend ingestion beyond the
// MTGA-legal subset that sets.Resolve returns. Capitalised to match the
// rest of the pipeline's set-code casing.
func fetchAllSetCodes(accountID, databaseID, apiToken string) ([]string, error) {
	sql := "SELECT DISTINCT set_code FROM magic_cards WHERE is_default = 1 ORDER BY set_code"
	rows, err := cfapi.QueryD1(accountID, databaseID, apiToken, sql)
	if err != nil {
		return nil, err
	}
	codes := make([]string, 0, len(rows))
	for _, row := range rows {
		code, _ := row["set_code"].(string)
		if code != "" {
			codes = append(codes, strings.ToUpper(code))
		}
	}
	return codes, nil
}

// computeCoverage returns the percentage of distinct default-printing
// oracle_ids that have ≥1 row in magic_card_roles. Surfaces the gap that
// blocks bracket detection / composition assessment on uncovered cards.
func computeCoverage(accountID, databaseID, apiToken string) (covered, total int, err error) {
	totalRows, err := cfapi.QueryD1(accountID, databaseID, apiToken,
		"SELECT COUNT(DISTINCT oracle_id) AS n FROM magic_cards WHERE is_default = 1")
	if err != nil {
		return 0, 0, fmt.Errorf("total: %w", err)
	}
	if len(totalRows) == 0 {
		return 0, 0, fmt.Errorf("total: no rows returned")
	}
	total = int(asFloat(totalRows[0]["n"]))

	coveredRows, err := cfapi.QueryD1(accountID, databaseID, apiToken,
		"SELECT COUNT(DISTINCT oracle_id) AS n FROM magic_card_roles")
	if err != nil {
		return 0, 0, fmt.Errorf("covered: %w", err)
	}
	if len(coveredRows) == 0 {
		return 0, 0, fmt.Errorf("covered: no rows returned")
	}
	covered = int(asFloat(coveredRows[0]["n"]))
	return covered, total, nil
}

// asFloat unboxes a JSON number from cfapi.QueryD1 results. D1 returns
// COUNT(*) as a JSON number which decodes to float64.
func asFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int:
		return float64(x)
	case int64:
		return float64(x)
	}
	return 0
}

// fetchCreaturesAndAllCards queries D1 for all default cards in a set.
// Returns creature role entries and the full card list (for remainder computation).
func fetchCreaturesAndAllCards(accountID, databaseID, apiToken, setCode string) ([]roleEntry, []d1Card, error) {
	sql := fmt.Sprintf(
		"SELECT oracle_id, front_face_name, type_line, produced_mana FROM magic_cards WHERE set_code = %s AND is_default = 1",
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
// Handles pagination and respects rate limits. Returns raw cards without
// roles attached — caller fans them out via expandTagToRoleEntries.
func fetchTaggedCards(setCode string, tag string) ([]taggedCard, error) {
	query := fmt.Sprintf("function:%s set:%s", tag, strings.ToLower(setCode))
	searchURL := "https://api.scryfall.com/cards/search?q=" + url.QueryEscape(query)

	var cards []taggedCard
	client := &http.Client{Timeout: 30 * time.Second}

	for pageURL := searchURL; pageURL != ""; {
		time.Sleep(150 * time.Millisecond) // Scryfall caps at 10 req/s; pacing under that.

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
			cards = append(cards, taggedCard{
				OracleID:      card.OracleID,
				FrontFaceName: frontFace,
			})
		}

		if list.HasMore && list.NextPage != "" {
			pageURL = list.NextPage
		} else {
			pageURL = ""
		}
	}

	return cards, nil
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

// buildSetRolesSQL generates per-set SQL for card role data with per-set DELETEs.
func buildSetRolesSQL(setCode string, entries []roleEntry) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	fmt.Fprintf(&b, "DELETE FROM magic_card_roles WHERE set_code = %s;\n", q(setCode))

	for _, e := range entries {
		fmt.Fprintf(&b, "INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (%s, %s, %s, %s);\n",
			q(e.OracleID), q(e.FrontFaceName), q(e.Role), q(e.SetCode))
	}

	return b.String()
}
