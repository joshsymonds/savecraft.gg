// 17lands-fetch downloads 17Lands public datasets and populates D1 with
// per-card draft statistics when --d1-database-id is provided.
//
// Usage: go run ./plugins/mtga/tools/17lands-fetch [--d1-database-id=UUID]
//
// Data source: 17Lands (17lands.com), licensed CC BY 4.0
//
// D1 population (when --d1-database-id set):
//   - mtga_draft_ratings, mtga_draft_archetype_stats, mtga_draft_set_stats,
//     mtga_draft_ratings_fts tables via Cloudflare D1 bulk import API
package main

import (
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/sets"
)

const (
	draftDataURL = "https://17lands-public.s3.amazonaws.com/analysis_data/draft_data/draft_data_public.%s.PremierDraft.csv.gz"
)

// cardAccum accumulates statistics for a single card across all games.
type cardAccum struct {
	// Game data accumulators.
	gamesInDeck      int
	gamesInHand      int // opening_hand OR drawn
	gamesOpeningHand int
	gamesDrawn       int // drawn but not in opening hand
	gamesNotSeen     int // in deck but never drawn
	winsInHand       int
	winsOpeningHand  int
	winsDrawn        int
	winsNotSeen      int

	// Draft data accumulators.
	totalLastSeen float64
	lastSeenCount int
	totalTakenAt  float64
	takenAtSumSq  float64 // sum of squared pick positions for stddev
	takenCount    int
}

func (a *cardAccum) stats() setCardStats {
	s := setCardStats{
		GamesInHand:  a.gamesInHand,
		GamesPlayed:  a.gamesInDeck,
		GamesNotSeen: a.gamesNotSeen,
	}
	if a.gamesInHand > 0 {
		s.GIHWR = float64(a.winsInHand) / float64(a.gamesInHand)
	}
	if a.gamesOpeningHand > 0 {
		s.OHWR = float64(a.winsOpeningHand) / float64(a.gamesOpeningHand)
	}
	if a.gamesDrawn > 0 {
		s.GDWR = float64(a.winsDrawn) / float64(a.gamesDrawn)
	}
	if a.gamesNotSeen > 0 {
		s.GNSWR = float64(a.winsNotSeen) / float64(a.gamesNotSeen)
	}
	s.IWD = s.GDWR - s.GNSWR
	if a.lastSeenCount > 0 {
		s.ALSA = a.totalLastSeen / float64(a.lastSeenCount)
	}
	if a.takenCount > 0 {
		s.ATA = a.totalTakenAt / float64(a.takenCount)
		if a.takenCount > 1 {
			// Population stddev: σ = sqrt(E[X²] - (E[X])²)
			meanSq := a.takenAtSumSq / float64(a.takenCount)
			s.ATAStddev = math.Sqrt(max(0, meanSq-s.ATA*s.ATA))
		}
	}
	return s
}

type setCardStats struct {
	GamesInHand  int
	GamesPlayed  int
	GamesNotSeen int
	GIHWR        float64
	OHWR         float64
	GDWR         float64
	GNSWR        float64
	IWD          float64
	ALSA         float64
	ATA          float64
	ATAStddev    float64
}

type setResult struct {
	Set        string
	TotalGames int
	CardCount  int
	AvgGIHWR   float64
	Cards      []cardResult
}

type cardResult struct {
	Name    string
	Overall setCardStats
	ByColor map[string]setCardStats
}

// colorCombos holds all 31 non-empty subsets of WUBRG, ordered by size then
// WUBRG position. Used as archetype keys for stratified card stats, curves,
// role targets, and deck stats.
var colorCombos = allColorCombos()

// allColorCombos returns all 31 non-empty subsets of WUBRG in canonical order:
// 5 mono, 10 pair, 10 triple, 5 quad, 1 five-color.
func allColorCombos() []string {
	colors := "WUBRG"
	var combos []string
	for mask := 1; mask < (1 << len(colors)); mask++ {
		var buf []byte
		for i := range len(colors) {
			if mask&(1<<i) != 0 {
				buf = append(buf, colors[i])
			}
		}
		combos = append(combos, string(buf))
	}
	// Sort by length (mono first, five-color last), preserving WUBRG
	// order within each group via stable sort.
	sort.SliceStable(combos, func(i, j int) bool {
		return len(combos[i]) < len(combos[j])
	})
	return combos
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func defaultCacheDir() string { return cfapi.DefaultCacheDir() }

func run() error {
	cfAccountID := flag.String("cf-account-id", os.Getenv("CLOUDFLARE_ACCOUNT_ID"), "Cloudflare account ID")
	cfAPIToken := flag.String("cf-api-token", os.Getenv("CLOUDFLARE_API_TOKEN"), "Cloudflare API token")
	d1DatabaseID := flag.String("d1-database-id", "", "D1 database ID (enables D1 population)")
	setFilter := flag.String("set", "", "Process a single set (e.g., 'DSK'). If empty, processes all sets.")
	cacheDir := flag.String("cache-dir", defaultCacheDir(), "Local cache directory for downloaded CSVs")
	retry := flag.Bool("retry", false, "Retry mode: import cached SQL files without reprocessing CSVs")
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

	// ── Retry mode: import cached SQL without reprocessing ──
	if *retry {
		if *d1DatabaseID == "" {
			return fmt.Errorf("--retry requires --d1-database-id")
		}
		sqlDir := filepath.Join(*cacheDir, "sql")
		return cfapi.RetryFromDisk(*cfAccountID, *d1DatabaseID, *cfAPIToken, sqlDir, ".sql")
	}

	targetSets, err := sets.Resolve(context.Background(), *setFilter)
	if err != nil {
		return err
	}

	// Fetch card CMC, roles, and land info from D1 concurrently — independent
	// queries used for curve, role target, and deck stats computation respectively.
	var cardCMC map[string]float64
	var cardRoles map[string]map[string]bool
	var cardLands map[string]bool
	var cardFixing map[string]bool
	if *d1DatabaseID != "" {
		var cmcErr, rolesErr, landErr error
		var d1wg sync.WaitGroup
		d1wg.Add(3)
		go func() {
			defer d1wg.Done()
			cardCMC, cmcErr = fetchCardCMC(*cfAccountID, *d1DatabaseID, *cfAPIToken)
		}()
		go func() {
			defer d1wg.Done()
			cardRoles, rolesErr = fetchCardRoles(*cfAccountID, *d1DatabaseID, *cfAPIToken)
		}()
		go func() {
			defer d1wg.Done()
			cardLands, cardFixing, landErr = fetchCardLandInfo(*cfAccountID, *d1DatabaseID, *cfAPIToken)
		}()
		d1wg.Wait()

		if cmcErr != nil {
			fmt.Printf("WARN: could not fetch card CMC from D1: %v (curves will be skipped)\n", cmcErr)
		} else {
			fmt.Printf("Loaded CMC data for %d cards from D1\n", len(cardCMC))
		}
		if rolesErr != nil {
			fmt.Printf("WARN: could not fetch card roles from D1: %v (role targets will be skipped)\n", rolesErr)
		} else {
			fmt.Printf("Loaded role data for %d cards from D1\n", len(cardRoles))
		}
		if landErr != nil {
			fmt.Printf("WARN: could not fetch land info from D1: %v (deck stats will be skipped)\n", landErr)
		} else {
			fmt.Printf("Loaded land info: %d lands, %d fixing from D1\n", len(cardLands), len(cardFixing))
		}
	}

	// Process sets concurrently — each set downloads ~100-200MB of CSVs from 17Lands.
	type setWork struct {
		result  setResult
		synergy synergyDataResult
		err     error
	}
	results := make([]setWork, len(targetSets))
	var wg sync.WaitGroup
	// Limit concurrency — mostly IO-bound (cached CSV reads + network downloads).
	sem := make(chan struct{}, 12)

	for i, set := range targetSets {
		wg.Add(1)
		go func(idx int, setCode string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			fmt.Printf("Processing %s...\n", setCode)

			// Single-pass: card stats + synergies from one CSV read.
			accums, syn, err := processGameAndSynergyData(setCode, *cacheDir, cardCMC, cardRoles, cardLands, cardFixing)
			if err != nil {
				fmt.Printf("  WARN: game data for %s failed: %v (skipping)\n", setCode, err)
				results[idx] = setWork{err: err}
				return
			}
			fmt.Printf("  %s game data: %d cards, %d synergy pairs, %d curve rows\n", setCode, len(accums["_overall"]), len(syn.Synergies), len(syn.Curves))

			if err := processDraftData(setCode, *cacheDir, accums); err != nil {
				fmt.Printf("  WARN: draft data for %s failed: %v (continuing without ALSA/ATA)\n", setCode, err)
			} else {
				fmt.Printf("  %s draft data: merged\n", setCode)
			}

			sr := buildSetResult(setCode, accums)
			fmt.Printf("  %s complete: %d cards with stats\n", setCode, len(sr.Cards))

			// Compute sigmoid calibration from empirical distributions.
			syn.Calibration = computeCalibration(sr, syn.Synergies)
			fmt.Printf("  %s calibration: %d axes\n", setCode, len(syn.Calibration))

			results[idx] = setWork{result: sr, synergy: syn}
		}(i, set)
	}
	wg.Wait()

	// Collect successful results.
	type processedSet struct {
		result  setResult
		synergy synergyDataResult
	}
	var processed []processedSet
	for _, r := range results {
		if r.err == nil {
			processed = append(processed, processedSet{result: r.result, synergy: r.synergy})
		}
	}

	fmt.Printf("Done processing %d sets.\n", len(processed))

	// ── Write SQL to disk + per-set D1 import ────────────────
	if *d1DatabaseID != "" {
		sqlDir := filepath.Join(*cacheDir, "sql")
		if err := os.MkdirAll(sqlDir, 0755); err != nil {
			return fmt.Errorf("creating SQL cache dir: %w", err)
		}

		fmt.Println("\nWriting SQL and importing per-set...")

		// Batch-fetch all existing pipeline hashes in one query.
		existingHashes, _ := cfapi.GetAllPipelineHashes(*cfAccountID, *d1DatabaseID, *cfAPIToken, "17lands")
		if existingHashes == nil {
			existingHashes = make(map[string]string)
		}

		var importErrors []string
		for _, ps := range processed {
			setCode := ps.result.Set

			// Compute content hash from the cached CSV file.
			csvPath := filepath.Join(*cacheDir, fmt.Sprintf("game_data_public.%s.PremierDraft.csv.gz", setCode))
			csvHash, err := fileHash(csvPath)
			if err != nil {
				fmt.Printf("  WARN: could not hash CSV for %s: %v (importing anyway)\n", setCode, err)
				csvHash = "" // Force import if hash unavailable.
			}

			// Check pipeline state — skip if unchanged.
			if csvHash != "" && existingHashes[setCode] == csvHash {
				fmt.Printf("  %s: unchanged (hash match), skipping\n", setCode)
				continue
			}

			// Generate per-set SQL.
			ratingsSQL := buildSetRatingsSQL(ps.result)
			ratingsPath := filepath.Join(sqlDir, setCode+"_ratings.sql")
			if err := os.WriteFile(ratingsPath, []byte(ratingsSQL), 0644); err != nil {
				return fmt.Errorf("writing ratings SQL for %s: %w", setCode, err)
			}

			hasSynergy := len(ps.synergy.Synergies) > 0 || len(ps.synergy.Curves) > 0 || len(ps.synergy.DeckStats) > 0
			var synergySQL string
			var synergyPath string
			if hasSynergy {
				synergySQL = buildSetSynergySQL(ps.synergy)
				synergyPath = filepath.Join(sqlDir, setCode+"_synergy.sql")
				if err := os.WriteFile(synergyPath, []byte(synergySQL), 0644); err != nil {
					return fmt.Errorf("writing synergy SQL for %s: %w", setCode, err)
				}
			}

			// Import ratings.
			fmt.Printf("  %s: importing ratings (%.1f KB)...\n", setCode, float64(len(ratingsSQL))/1024)
			if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, ratingsSQL); err != nil {
				fmt.Printf("  FAIL: %s ratings import: %v\n", setCode, err)
				importErrors = append(importErrors, setCode+" ratings")
				continue // Leave SQL on disk for retry.
			}
			os.Remove(ratingsPath)

			// Import synergy (reuse in-memory string, don't re-read from disk).
			if hasSynergy {
				fmt.Printf("  %s: importing synergy (%.1f MB)...\n", setCode, float64(len(synergySQL))/1048576)
				if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, synergySQL); err != nil {
					fmt.Printf("  FAIL: %s synergy import: %v\n", setCode, err)
					importErrors = append(importErrors, setCode+" synergy")
					continue // Leave SQL on disk for retry.
				}
				os.Remove(synergyPath)
			}

			// Update pipeline state on success.
			if csvHash != "" {
				rowCount := len(ps.result.Cards) + len(ps.synergy.Synergies) + len(ps.synergy.Curves)
				if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "17lands", setCode, csvHash, rowCount); err != nil {
					fmt.Printf("  WARN: %s pipeline state update failed: %v\n", setCode, err)
				}
			}

			fmt.Printf("  %s: done\n", setCode)
		}

		if len(importErrors) > 0 {
			return fmt.Errorf("D1 import failed for %d sets: %s (SQL cached in %s for retry)", len(importErrors), strings.Join(importErrors, ", "), sqlDir)
		}

		fmt.Println("D1 population complete")
	} else {
		fmt.Println("No --d1-database-id specified; skipping D1 population.")
	}

	return nil
}

// fileHash computes the SHA-256 hash of a file on disk.
func fileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func processDraftData(set string, cacheDir string, accums map[string]map[string]*cardAccum) error {
	url := fmt.Sprintf(draftDataURL, set)
	filename := fmt.Sprintf("draft_data_public.%s.PremierDraft.csv.gz", set)
	reader, err := cachedDownloadGzip(url, cacheDir, filename)
	if err != nil {
		return err
	}
	defer reader.Close()

	csvReader := csv.NewReader(reader)
	header, err := csvReader.Read()
	if err != nil {
		return fmt.Errorf("reading header: %w", err)
	}

	// Find pack_card_* columns for ALSA, and pick/pick_number columns for ATA.
	packCards := make(map[string]int) // cardName → column index
	for i, h := range header {
		if name, ok := strings.CutPrefix(h, "pack_card_"); ok {
			packCards[name] = i
		}
	}

	pickCol := indexOf(header, "pick")
	pickNumberCol := indexOf(header, "pick_number")

	if pickCol < 0 || pickNumberCol < 0 {
		return fmt.Errorf("pick columns not found")
	}

	overall := accums["_overall"]

	rowCount := 0
	for {
		row, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		rowCount++

		pickNumber := 0
		if pickNumberCol >= 0 && pickNumberCol < len(row) {
			fmt.Sscanf(row[pickNumberCol], "%d", &pickNumber)
		}

		// ALSA: for each card in the pack, track the pick number.
		// "Average Last Seen At" = average pick number where the card was last available.
		for cardName, colIdx := range packCards {
			if colIdx < len(row) && row[colIdx] != "0" && row[colIdx] != "" {
				a, ok := overall[cardName]
				if !ok {
					a = &cardAccum{}
					overall[cardName] = a
				}
				// This is one observation of the card being seen at this pick.
				a.totalLastSeen += float64(pickNumber + 1) // 1-indexed
				a.lastSeenCount++
			}
		}

		// ATA: track which card was picked and at what pick number.
		if pickCol < len(row) {
			pickedCard := row[pickCol]
			if pickedCard != "" {
				a, ok := overall[pickedCard]
				if !ok {
					a = &cardAccum{}
					overall[pickedCard] = a
				}
				pn := float64(pickNumber + 1)
				a.totalTakenAt += pn
				a.takenAtSumSq += pn * pn
				a.takenCount++
			}
		}
	}

	fmt.Printf("  Draft data: %d picks processed\n", rowCount)
	return nil
}

func buildSetResult(set string, accums map[string]map[string]*cardAccum) setResult {
	overall := accums["_overall"]

	// Get sorted card names.
	names := make([]string, 0, len(overall))
	for name := range overall {
		names = append(names, name)
	}
	sort.Strings(names)

	sr := setResult{Set: set}

	// Compute total games (max gamesInDeck across any card — since every game
	// has every card "in deck" or not, the card with most appearances approximates total).
	maxGames := 0
	for _, a := range overall {
		if a.gamesInDeck > maxGames {
			maxGames = a.gamesInDeck
		}
	}
	sr.TotalGames = maxGames

	for _, name := range names {
		a := overall[name]
		cr := cardResult{
			Name:    name,
			Overall: a.stats(),
			ByColor: make(map[string]setCardStats),
		}

		for _, arch := range colorCombos {
			if ca, ok := accums[arch][name]; ok && ca.gamesInDeck >= 100 {
				cr.ByColor[arch] = ca.stats()
			}
		}

		// Only include cards with meaningful sample size.
		if a.gamesInDeck >= 50 {
			sr.Cards = append(sr.Cards, cr)
		}
	}

	// Compute set average GIH WR across all included cards.
	if len(sr.Cards) > 0 {
		var sumGIHWR float64
		for _, c := range sr.Cards {
			sumGIHWR += c.Overall.GIHWR
		}
		sr.AvgGIHWR = sumGIHWR / float64(len(sr.Cards))
	}
	sr.CardCount = len(sr.Cards)

	return sr
}

func indexOf(slice []string, val string) int {
	for i, s := range slice {
		if s == val {
			return i
		}
	}
	return -1
}

// normalizeColors converts "WU", "UW", etc. to canonical WUBRG order.
// Uses a precomputed lookup for 1-2 char strings (99%+ of cases) to avoid
// per-row allocation in the hot CSV loop (~2M calls per set).
var normalizedColorCache = func() map[string]string {
	order := "WUBRGC"
	m := make(map[string]string)
	for i := 0; i < len(order); i++ {
		m[string(order[i])] = string(order[i])
		for j := 0; j < len(order); j++ {
			a, b := order[i], order[j]
			if strings.Index(order, string(a)) > strings.Index(order, string(b)) {
				a, b = b, a
			}
			m[string(order[i])+string(order[j])] = string(a) + string(b)
		}
	}
	return m
}()

func normalizeColors(s string) string {
	if cached, ok := normalizedColorCache[s]; ok {
		return cached
	}
	// Fallback for 3+ colors (rare).
	order := "WUBRGC"
	colors := strings.Split(s, "")
	sort.Slice(colors, func(i, j int) bool {
		return strings.Index(order, colors[i]) < strings.Index(order, colors[j])
	})
	return strings.Join(colors, "")
}

func round4(f float64) float64 {
	return math.Round(f*10000) / 10000
}
