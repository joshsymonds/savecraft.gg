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
	"compress/gzip"
	"encoding/csv"
	"flag"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"slices"
	"sort"
	"strings"

	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/cfapi"
)

// Available sets with 17Lands Premier Draft data.
var sets = []string{
	"FDN", "DSK", "BLB", "OTJ", "MKM", "LCI", "WOE", "MOM",
	"ONE", "BRO", "DMU", "SNC", "NEO", "VOW", "MID", "AFR",
	"STX", "KHM",
}

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

func run() error {
	cfAccountID := flag.String("cf-account-id", os.Getenv("CLOUDFLARE_ACCOUNT_ID"), "Cloudflare account ID")
	cfAPIToken := flag.String("cf-api-token", os.Getenv("CLOUDFLARE_API_TOKEN"), "Cloudflare API token")
	d1DatabaseID := flag.String("d1-database-id", "", "D1 database ID (enables D1 population)")
	setFilter := flag.String("set", "", "Process a single set (e.g., 'DSK'). If empty, processes all sets.")
	flag.Parse()

	// Filter to a single set if --set is provided.
	targetSets := sets
	if *setFilter != "" {
		upper := strings.ToUpper(*setFilter)
		if !slices.Contains(sets, upper) {
			return fmt.Errorf("unknown set %q; available: %v", *setFilter, sets)
		}
		targetSets = []string{upper}
	}

	var allSets []setResult

	for _, set := range targetSets {
		fmt.Printf("Processing %s...\n", set)

		// Process game data.
		accums, err := processGameData(set)
		if err != nil {
			fmt.Printf("  WARN: game data for %s failed: %v (skipping)\n", set, err)
			continue
		}
		fmt.Printf("  Game data: %d cards\n", len(accums["_overall"]))

		// Process draft data (ALSA/ATA).
		if err := processDraftData(set, accums); err != nil {
			fmt.Printf("  WARN: draft data for %s failed: %v (continuing without ALSA/ATA)\n", set, err)
		} else {
			fmt.Printf("  Draft data: merged\n")
		}

		// Convert accumulators to results.
		sr := buildSetResult(set, accums)
		allSets = append(allSets, sr)
		fmt.Printf("  %s complete: %d cards with stats\n", set, len(sr.Cards))
	}

	fmt.Printf("Done processing %d sets.\n", len(allSets))

	// ── Cloudflare D1 population ─────────────────────────────
	if *d1DatabaseID != "" && *cfAccountID != "" && *cfAPIToken != "" {
		fmt.Println("\nPopulating D1 tables...")
		sql := buildDraftRatingsImportSQL(allSets)
		fmt.Printf("Generated %.1f MB of SQL (%d sets)\n", float64(len(sql))/1048576, len(allSets))
		if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
			return fmt.Errorf("D1 import: %w", err)
		}
		fmt.Println("D1 population complete")
	} else {
		fmt.Println("No --d1-database-id specified; skipping D1 population.")
	}

	return nil
}

func processGameData(set string) (map[string]map[string]*cardAccum, error) {
	url := fmt.Sprintf(gameDataURL, set)
	reader, err := downloadGzip(url)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	csvReader := csv.NewReader(reader)
	header, err := csvReader.Read()
	if err != nil {
		return nil, fmt.Errorf("reading header: %w", err)
	}

	// Parse header to find card columns.
	// Format: opening_hand_{name}, drawn_{name}, tutored_{name}, deck_{name}, sideboard_{name}
	type cardCols struct {
		openingHand int
		drawn       int
		deck        int
	}
	cards := make(map[string]cardCols)
	for i, h := range header {
		if name, ok := strings.CutPrefix(h, "opening_hand_"); ok {
			cc := cards[name]
			cc.openingHand = i
			cards[name] = cc
		} else if name, ok := strings.CutPrefix(h, "drawn_"); ok {
			cc := cards[name]
			cc.drawn = i
			cards[name] = cc
		} else if name, ok := strings.CutPrefix(h, "deck_"); ok {
			cc := cards[name]
			cc.deck = i
			cards[name] = cc
		}
	}

	// Find column indices for metadata.
	wonCol := indexOf(header, "won")
	colorsCol := indexOf(header, "main_colors")

	if wonCol < 0 {
		return nil, fmt.Errorf("'won' column not found")
	}

	// accums[colorKey][cardName] = *cardAccum
	// "_overall" is the aggregate across all colors.
	accums := make(map[string]map[string]*cardAccum)
	accums["_overall"] = make(map[string]*cardAccum)
	for _, cp := range colorPairs {
		accums[cp] = make(map[string]*cardAccum)
	}

	rowCount := 0
	for {
		row, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue // Skip malformed rows.
		}
		rowCount++

		won := row[wonCol] == "True"
		mainColors := ""
		if colorsCol >= 0 {
			mainColors = normalizeColors(row[colorsCol])
		}

		for cardName, cols := range cards {
			inDeck := cols.deck > 0 && cols.deck < len(row) && row[cols.deck] != "0" && row[cols.deck] != ""
			if !inDeck {
				continue
			}

			inOpeningHand := cols.openingHand > 0 && cols.openingHand < len(row) && row[cols.openingHand] != "0" && row[cols.openingHand] != ""
			wasDrawn := cols.drawn > 0 && cols.drawn < len(row) && row[cols.drawn] != "0" && row[cols.drawn] != ""
			inHand := inOpeningHand || wasDrawn

			// Update accumulators for overall and matching color pair.
			for _, key := range []string{"_overall", mainColors} {
				m, ok := accums[key]
				if !ok {
					continue
				}
				a, ok := m[cardName]
				if !ok {
					a = &cardAccum{}
					m[cardName] = a
				}

				a.gamesInDeck++
				if inHand {
					a.gamesInHand++
					if won {
						a.winsInHand++
					}
				}
				if inOpeningHand {
					a.gamesOpeningHand++
					if won {
						a.winsOpeningHand++
					}
				}
				if wasDrawn {
					a.gamesDrawn++
					if won {
						a.winsDrawn++
					}
				}
				if !inHand {
					a.gamesNotSeen++
					if won {
						a.winsNotSeen++
					}
				}
			}
		}
	}

	fmt.Printf("  Processed %d games\n", rowCount)
	return accums, nil
}

func processDraftData(set string, accums map[string]map[string]*cardAccum) error {
	url := fmt.Sprintf(draftDataURL, set)
	reader, err := downloadGzip(url)
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
	type packCol struct {
		idx int
	}
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
				a.totalTakenAt += float64(pickNumber + 1)
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

func downloadGzip(url string) (io.ReadCloser, error) {
	client := &http.Client{Timeout: 10 * time.Minute}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Savecraft/1.0 (savecraft.gg)")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("HTTP %d for %s", resp.StatusCode, url)
	}

	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		resp.Body.Close()
		return nil, fmt.Errorf("gzip: %w", err)
	}

	return &gzipReadCloser{gz: gz, body: resp.Body}, nil
}

type gzipReadCloser struct {
	gz   *gzip.Reader
	body io.ReadCloser
}

func (g *gzipReadCloser) Read(p []byte) (int, error) { return g.gz.Read(p) }
func (g *gzipReadCloser) Close() error {
	g.gz.Close()
	return g.body.Close()
}

func indexOf(slice []string, val string) int {
	for i, s := range slice {
		if s == val {
			return i
		}
	}
	return -1
}

// normalizeColors converts "WU", "UW", etc. to a canonical form.
func normalizeColors(s string) string {
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
