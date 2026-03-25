package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/cfapi"
)

// Minimum games together for a pair to be included in synergy output.
const minGamesTogether = 200

// synergyRow represents one direction of a pairwise synergy relationship.
type synergyRow struct {
	CardA         string
	CardB         string
	SynergyDelta  float64
	GamesTogether int
}

// curveRow represents one CMC bucket in an archetype's average deck curve.
type curveRow struct {
	ColorPair  string
	CMC        int
	AvgCount   float64
	TotalDecks int
}

// synergyDataResult holds all synergy and curve rows for a single set.
type synergyDataResult struct {
	Set       string
	Synergies []synergyRow
	Curves    []curveRow
}

// cardPair is the canonical key for a card pair (a < b lexicographically).
type cardPair struct {
	a, b string
}

// pairAccum tracks co-occurrence stats for a card pair.
type pairAccum struct {
	gamesTogether int
	winsTogether  int
}

// cardDeckAccum tracks per-card deck appearance stats.
type cardDeckAccum struct {
	gamesInDeck int
	winsInDeck  int
}

// curveAccum tracks CMC distribution for winning decks of an archetype.
type curveAccum struct {
	totalDecks int
	cmcCounts  [8]int // CMC 0, 1, 2, 3, 4, 5, 6, 7+
}

// cmcBucket maps a CMC value to its bucket index (0-7, where 7 = 7+).
func cmcBucket(cmc float64) int {
	b := int(cmc)
	if b > 7 {
		b = 7
	}
	if b < 0 {
		b = 0
	}
	return b
}

// validColorPair returns true if the normalized color string is one of the
// 10 canonical two-color pairs. Mono-color and 3+ color games are excluded
// from stratified synergy computation.
var colorPairSet = func() map[string]bool {
	m := make(map[string]bool, len(colorPairs))
	for _, cp := range colorPairs {
		m[cp] = true
	}
	return m
}()

// processSynergyData reads the cached game_data CSV for a set and computes
// pairwise card synergies (stratified by color pair to remove archetype
// confounding) and (optionally) archetype CMC curves.
//
// Stratification: synergy is computed within each 2-color archetype separately,
// then the final delta is a weighted average across archetypes (weighted by
// games_together per archetype). This removes the "coattail effect" where cards
// in strong archetypes falsely show positive synergy.
//
// cardCMC maps card names to their converted mana cost. If nil, curve
// computation is skipped. It returns both-direction synergy rows filtered
// to pairs with at least minGamesTogether total games across all archetypes.
func processSynergyData(set string, cacheDir string, cardCMC map[string]float64) (synergyDataResult, error) {
	filename := fmt.Sprintf("game_data_public.%s.PremierDraft.csv.gz", set)
	reader, err := openCachedGzip(fmt.Sprintf("%s/%s", cacheDir, filename))
	if err != nil {
		return synergyDataResult{}, fmt.Errorf("opening cached game data: %w", err)
	}
	defer reader.Close()

	csvReader := csv.NewReader(reader)
	header, err := csvReader.Read()
	if err != nil {
		return synergyDataResult{}, fmt.Errorf("reading header: %w", err)
	}

	// Parse header for deck_* columns.
	deckCols := make(map[string]int) // cardName → column index
	for i, h := range header {
		if name, ok := strings.CutPrefix(h, "deck_"); ok {
			deckCols[name] = i
		}
	}

	wonCol := indexOf(header, "won")
	if wonCol < 0 {
		return synergyDataResult{}, fmt.Errorf("'won' column not found")
	}

	colorsCol := indexOf(header, "main_colors")

	// Pre-allocate card name slice for reuse across rows.
	cardNames := make([]string, 0, len(deckCols))
	for name := range deckCols {
		cardNames = append(cardNames, name)
	}
	sort.Strings(cardNames)

	// Stratified accumulators: one set of pair + card maps per color pair.
	pairsByColor := make(map[string]map[cardPair]*pairAccum)  // colorPair → pair → accum
	cardsByColor := make(map[string]map[string]*cardDeckAccum) // colorPair → cardName → accum
	curves := make(map[string]*curveAccum)                     // color pair → curve accumulator

	// Buffer for cards in deck per row (reused to avoid allocation).
	inDeck := make([]string, 0, 50)

	for {
		row, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue // Skip malformed rows.
		}

		won := row[wonCol] == "True"

		// Determine color pair for stratification.
		var mainColors string
		if colorsCol >= 0 {
			mainColors = normalizeColors(row[colorsCol])
		}

		// Collect cards in this game's deck.
		inDeck = inDeck[:0]
		for _, name := range cardNames {
			colIdx := deckCols[name]
			if colIdx < len(row) && row[colIdx] != "0" && row[colIdx] != "" {
				inDeck = append(inDeck, name)
			}
		}

		// Only accumulate synergy data for recognized 2-color pairs.
		// Mono-color and 3+ color games are noise for stratified analysis.
		if colorPairSet[mainColors] {
			// Get or create per-color accumulators.
			pairMap, ok := pairsByColor[mainColors]
			if !ok {
				pairMap = make(map[cardPair]*pairAccum)
				pairsByColor[mainColors] = pairMap
			}
			cardMap, ok := cardsByColor[mainColors]
			if !ok {
				cardMap = make(map[string]*cardDeckAccum)
				cardsByColor[mainColors] = cardMap
			}

			// Update per-card accumulators within this color pair.
			for _, name := range inDeck {
				a, ok := cardMap[name]
				if !ok {
					a = &cardDeckAccum{}
					cardMap[name] = a
				}
				a.gamesInDeck++
				if won {
					a.winsInDeck++
				}
			}

			// Update per-pair accumulators within this color pair.
			for i := 0; i < len(inDeck); i++ {
				for j := i + 1; j < len(inDeck); j++ {
					key := cardPair{inDeck[i], inDeck[j]}
					p, ok := pairMap[key]
					if !ok {
						p = &pairAccum{}
						pairMap[key] = p
					}
					p.gamesTogether++
					if won {
						p.winsTogether++
					}
				}
			}
		}

		// Accumulate CMC curves for winning decks (only if CMC data available).
		if won && cardCMC != nil && colorPairSet[mainColors] {
			ca, ok := curves[mainColors]
			if !ok {
				ca = &curveAccum{}
				curves[mainColors] = ca
			}
			ca.totalDecks++
			for _, name := range inDeck {
				if cmc, ok := cardCMC[name]; ok {
					ca.cmcCounts[cmcBucket(cmc)]++
				}
			}
		}
	}

	// Collect all unique pairs across all color pairs and sum total games.
	type pairTotal struct {
		totalGames int
	}
	allPairs := make(map[cardPair]*pairTotal)
	for _, pairMap := range pairsByColor {
		for pair, pa := range pairMap {
			pt, ok := allPairs[pair]
			if !ok {
				pt = &pairTotal{}
				allPairs[pair] = pt
			}
			pt.totalGames += pa.gamesTogether
		}
	}

	// Compute stratified synergy deltas: weighted average across color pairs.
	var synergies []synergyRow
	for pair, pt := range allPairs {
		if pt.totalGames < minGamesTogether {
			continue
		}

		// Compute delta within each color pair, then weighted-average.
		var weightedDelta float64
		var totalWeight int
		for cp, pairMap := range pairsByColor {
			pa, ok := pairMap[pair]
			if !ok || pa.gamesTogether == 0 {
				continue
			}

			cardMap := cardsByColor[cp]
			cardA := cardMap[pair.a]
			cardB := cardMap[pair.b]

			wrBoth := float64(pa.winsTogether) / float64(pa.gamesTogether)

			gamesAOnly := cardA.gamesInDeck - pa.gamesTogether
			winsAOnly := cardA.winsInDeck - pa.winsTogether
			var wrAOnly float64
			if gamesAOnly > 0 {
				wrAOnly = float64(winsAOnly) / float64(gamesAOnly)
			}

			gamesBOnly := cardB.gamesInDeck - pa.gamesTogether
			winsBOnly := cardB.winsInDeck - pa.winsTogether
			var wrBOnly float64
			if gamesBOnly > 0 {
				wrBOnly = float64(winsBOnly) / float64(gamesBOnly)
			}

			cpDelta := wrBoth - (wrAOnly+wrBOnly)/2
			weightedDelta += cpDelta * float64(pa.gamesTogether)
			totalWeight += pa.gamesTogether
		}

		var delta float64
		if totalWeight > 0 {
			delta = round4(weightedDelta / float64(totalWeight))
		}

		synergies = append(synergies, synergyRow{
			CardA:         pair.a,
			CardB:         pair.b,
			SynergyDelta:  delta,
			GamesTogether: pt.totalGames,
		})
		synergies = append(synergies, synergyRow{
			CardA:         pair.b,
			CardB:         pair.a,
			SynergyDelta:  delta,
			GamesTogether: pt.totalGames,
		})
	}

	// Compute curve averages.
	var curveRows []curveRow
	for cp, ca := range curves {
		if ca.totalDecks == 0 {
			continue
		}
		for cmc := 0; cmc < 8; cmc++ {
			if ca.cmcCounts[cmc] == 0 {
				continue
			}
			curveRows = append(curveRows, curveRow{
				ColorPair:  cp,
				CMC:        cmc,
				AvgCount:   round4(float64(ca.cmcCounts[cmc]) / float64(ca.totalDecks)),
				TotalDecks: ca.totalDecks,
			})
		}
	}

	return synergyDataResult{Set: set, Synergies: synergies, Curves: curveRows}, nil
}

// buildSynergyImportSQL generates SQL for D1 bulk import of synergy and curve data.
func buildSynergyImportSQL(results []synergyDataResult) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	b.WriteString("DELETE FROM mtga_draft_synergies;\n")
	b.WriteString("DELETE FROM mtga_draft_archetype_curves;\n")

	for _, r := range results {
		for _, s := range r.Synergies {
			fmt.Fprintf(&b, "INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (%s, %s, %s, %g, %d);\n",
				q(r.Set), q(s.CardA), q(s.CardB), s.SynergyDelta, s.GamesTogether)
		}
		for _, c := range r.Curves {
			fmt.Fprintf(&b, "INSERT INTO mtga_draft_archetype_curves (set_code, color_pair, cmc, avg_count, total_decks) VALUES (%s, %s, %d, %g, %d);\n",
				q(r.Set), q(c.ColorPair), c.CMC, c.AvgCount, c.TotalDecks)
		}
	}

	return b.String()
}
