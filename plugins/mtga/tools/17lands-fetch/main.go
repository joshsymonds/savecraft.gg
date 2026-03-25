// 17lands-fetch downloads 17Lands public datasets and populates D1 with
// per-card draft statistics when --d1-database-id is provided.
//
// Usage: go run ./plugins/mtga/tools/17lands-fetch [--d1-database-id=UUID]
//
// Data source: 17Lands (17lands.com), licensed CC BY 4.0
//
// D1 population (when --d1-database-id set):
//   - mtga_draft_ratings, mtga_draft_color_stats, mtga_draft_set_stats,
//     mtga_draft_ratings_fts tables via Cloudflare D1 bulk import API
package main

import (
	"encoding/csv"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/cfapi"
	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/sets"
)

const (
	gameDataURL  = "https://17lands-public.s3.amazonaws.com/analysis_data/game_data/game_data_public.%s.PremierDraft.csv.gz"
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
			s.ATAStddev = math.Sqrt(meanSq - s.ATA*s.ATA)
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

// Color pairs for archetype breakdowns.
var colorPairs = []string{"WU", "WB", "WR", "WG", "UB", "UR", "UG", "BR", "BG", "RG"}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

// defaultCacheDir returns ~/.cache/savecraft/17lands.
func defaultCacheDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "savecraft", "17lands")
	}
	return filepath.Join(home, ".cache", "savecraft", "17lands")
}

func run() error {
	cfAccountID := flag.String("cf-account-id", os.Getenv("CLOUDFLARE_ACCOUNT_ID"), "Cloudflare account ID")
	cfAPIToken := flag.String("cf-api-token", os.Getenv("CLOUDFLARE_API_TOKEN"), "Cloudflare API token")
	d1DatabaseID := flag.String("d1-database-id", "", "D1 database ID (enables D1 population)")
	setFilter := flag.String("set", "", "Process a single set (e.g., 'DSK'). If empty, processes all sets.")
	cacheDir := flag.String("cache-dir", defaultCacheDir(), "Local cache directory for downloaded CSVs")
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

	// Filter to a single set if --set is provided.
	targetSets := sets.MTGA
	if *setFilter != "" {
		upper := strings.ToUpper(*setFilter)
		if !slices.Contains(sets.MTGA, upper) {
			return fmt.Errorf("unknown set %q; available: %v", *setFilter, sets.MTGA)
		}
		targetSets = []string{upper}
	}

	// Fetch card CMC and roles from D1 concurrently — independent queries used
	// for archetype curve and role target computation respectively.
	var cardCMC map[string]float64
	var cardRoles map[string]map[string]bool
	if *d1DatabaseID != "" {
		var cmcErr, rolesErr error
		var d1wg sync.WaitGroup
		d1wg.Add(2)
		go func() {
			defer d1wg.Done()
			cardCMC, cmcErr = fetchCardCMC(*cfAccountID, *d1DatabaseID, *cfAPIToken)
		}()
		go func() {
			defer d1wg.Done()
			cardRoles, rolesErr = fetchCardRoles(*cfAccountID, *d1DatabaseID, *cfAPIToken)
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
			accums, syn, err := processGameAndSynergyData(setCode, *cacheDir, cardCMC, cardRoles)
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

	var allSets []setResult
	var allSynergies []synergyDataResult
	for _, r := range results {
		if r.err == nil {
			allSets = append(allSets, r.result)
			if len(r.synergy.Synergies) > 0 || len(r.synergy.Curves) > 0 {
				allSynergies = append(allSynergies, r.synergy)
			}
		}
	}

	fmt.Printf("Done processing %d sets.\n", len(allSets))

	// ── Cloudflare D1 population ─────────────────────────────
	if *d1DatabaseID != "" {
		fmt.Println("\nPopulating D1 tables...")

		// Import draft ratings.
		ratingsSQL := buildDraftRatingsImportSQL(allSets)
		fmt.Printf("Generated %.1f MB of ratings SQL (%d sets)\n", float64(len(ratingsSQL))/1048576, len(allSets))
		if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, ratingsSQL); err != nil {
			return fmt.Errorf("D1 ratings import: %w", err)
		}
		fmt.Println("D1 ratings population complete")

		// Import synergy data.
		if len(allSynergies) > 0 {
			synergySQL := buildSynergyImportSQL(allSynergies)
			fmt.Printf("Generated %.1f MB of synergy SQL (%d sets)\n", float64(len(synergySQL))/1048576, len(allSynergies))
			if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, synergySQL); err != nil {
				return fmt.Errorf("D1 synergy import: %w", err)
			}
			fmt.Println("D1 synergy population complete")
		}
	} else {
		fmt.Println("No --d1-database-id specified; skipping D1 population.")
	}

	return nil
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

		for _, cp := range colorPairs {
			if ca, ok := accums[cp][name]; ok && ca.gamesInDeck >= 100 {
				cr.ByColor[cp] = ca.stats()
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
