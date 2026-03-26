package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/cfapi"
	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/sets"
)

// synergyRow represents one direction of a pairwise synergy relationship.
type synergyRow struct {
	CardA         string
	CardB         string
	SynergyDelta  float64
	GamesTogether int
}

// curveRow represents one CMC bucket in an archetype's average deck curve.
type curveRow struct {
	Archetype  string
	CMC        int
	AvgCount   float64
	TotalDecks int
}

// roleTargetRow represents the average count of a role in winning decks
// for an archetype. Used by the scoring engine's role fulfillment axis.
type roleTargetRow struct {
	Archetype  string
	Role       string
	AvgCount   float64
	TotalDecks int
}

// deckStatsRow represents aggregate deck composition statistics for an archetype.
// Computed from winning decks to provide empirical deckbuilding targets.
type deckStatsRow struct {
	Archetype        string
	AvgLands         float64
	AvgCreatures     float64
	AvgNoncreatures  float64
	AvgFixing        float64
	SplashRate       float64
	SplashAvgSources float64
	SplashWinrate    float64
	NonsplashWinrate float64
	TotalDecks       int
}

// synergyDataResult holds all synergy, curve, role target, deck stats, and calibration rows for a single set.
type synergyDataResult struct {
	Set         string
	Synergies   []synergyRow
	Curves      []curveRow
	RoleTargets []roleTargetRow
	DeckStats   []deckStatsRow
	Calibration []calibrationRow
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

// roleTargetAccum tracks role counts for winning decks of an archetype.
type roleTargetAccum struct {
	totalDecks int
	roleCounts map[string]int // role name → total cards with this role across all winning decks
}

// deckStatsAccum tracks aggregate deck composition for an archetype.
// Composition stats (lands, creatures, etc.) are accumulated from winning decks.
// Win rate stats (splash vs non-splash) use ALL games for accurate rates.
type deckStatsAccum struct {
	// Composition stats (winning decks only).
	winDecks       int
	totalLands     int
	totalCreatures int
	totalNoncreat  int
	totalFixing    int
	// Splash composition (winning splash decks only).
	splashWinDecks    int
	splashFixingTotal int
	// Win rate tracking (ALL games, not just wins).
	splashGames    int
	splashWins     int
	nonsplashGames int
	nonsplashWins  int
}

// cmcBucket maps a CMC value to its bucket index (0-7, where 7 = 7+).
func cmcBucket(cmc float64) int {
	b := int(cmc)
	b = min(b, 7)
	b = max(b, 0)
	return b
}

// colorComboSet contains all 31 valid color combinations for fast lookup.
var colorComboSet = func() map[string]bool {
	m := make(map[string]bool, len(colorCombos))
	for _, cc := range colorCombos {
		m[cc] = true
	}
	return m
}()

// processGameAndSynergyData downloads (or reads from cache) the game_data CSV
// for a set and performs a single streaming pass to accumulate both per-card
// statistics (for draft ratings) and pairwise synergy/curve/role-target/deck-stats data.
//
// cardCMC maps card names to their converted mana cost. If nil, curve
// computation is skipped. cardRoles maps card names to their set of roles
// (e.g., "creature", "removal"). If nil, role target computation is skipped.
// cardLands identifies land cards. cardFixing identifies non-basic lands that
// produce colored mana (fixing lands). If both nil, deck stats are skipped.
func processGameAndSynergyData(set string, cacheDir string, cardCMC map[string]float64, cardRoles map[string]map[string]bool, cardLands map[string]bool, cardFixing map[string]bool) (map[string]map[string]*cardAccum, synergyDataResult, error) {
	url := fmt.Sprintf(sets.GameDataURL, set)
	filename := fmt.Sprintf("game_data_public.%s.PremierDraft.csv.gz", set)
	reader, err := cachedDownloadGzip(url, cacheDir, filename)
	if err != nil {
		return nil, synergyDataResult{}, err
	}
	defer reader.Close()

	accums, syn, err := processGameAndSynergyCSV(reader, set, cardCMC, cardRoles, cardLands, cardFixing)
	if err != nil {
		return nil, synergyDataResult{}, err
	}
	return accums, syn, nil
}

// processGameAndSynergyCSV performs a single streaming pass over a game_data
// CSV, accumulating both per-card statistics (for draft ratings) and pairwise
// synergy/curve/role-target/deck-stats data.
//
// It parses the superset of columns needed by both card stats and synergy
// computation: deck_*, opening_hand_*, drawn_*, won, main_colors, splash_colors.
//
// cardCMC maps card names to their converted mana cost. If nil, curve
// computation is skipped. cardRoles maps card names to their set of roles
// (e.g., "creature", "removal"). If nil, role target computation is skipped.
// cardLands identifies land cards. cardFixing identifies non-basic fixing lands.
// If both nil, deck stats computation is skipped.
func processGameAndSynergyCSV(r io.Reader, set string, cardCMC map[string]float64, cardRoles map[string]map[string]bool, cardLands map[string]bool, cardFixing map[string]bool) (map[string]map[string]*cardAccum, synergyDataResult, error) {
	csvReader := csv.NewReader(r)
	header, err := csvReader.Read()
	if err != nil {
		return nil, synergyDataResult{}, fmt.Errorf("reading header: %w", err)
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
	splashCol := indexOf(header, "splash_colors")

	if wonCol < 0 {
		return nil, synergyDataResult{}, fmt.Errorf("'won' column not found")
	}

	// ── Card accumulators (for draft ratings) ──────────────────
	// accums[colorKey][cardName] = *cardAccum
	// "_overall" is the aggregate across all colors.
	accums := make(map[string]map[string]*cardAccum)
	accums["_overall"] = make(map[string]*cardAccum)
	for _, cc := range colorCombos {
		accums[cc] = make(map[string]*cardAccum)
	}

	// ── Synergy accumulators ───────────────────────────────────
	// Pre-allocate sorted card name slice for deterministic pair ordering.
	cardNames := make([]string, 0, len(cards))
	for name := range cards {
		cardNames = append(cardNames, name)
	}
	sort.Strings(cardNames)

	pairsByColor := make(map[string]map[cardPair]*pairAccum)   // archetype → pair → accum
	cardsByColor := make(map[string]map[string]*cardDeckAccum) // archetype → cardName → accum
	curves := make(map[string]*curveAccum)                     // archetype → curve accumulator
	roleTargets := make(map[string]*roleTargetAccum)           // archetype → role target accumulator
	deckStats := make(map[string]*deckStatsAccum)              // archetype → deck stats accumulator

	// Buffer for cards in deck per row (reused to avoid allocation).
	inDeck := make([]string, 0, 50)

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

		// ── Card-level stats (draft ratings) + inDeck collection ──
		inDeck = inDeck[:0]
		for _, cardName := range cardNames {
			cols := cards[cardName]
			isDeckCard := cols.deck > 0 && cols.deck < len(row) && row[cols.deck] != "0" && row[cols.deck] != ""
			if !isDeckCard {
				continue
			}

			inDeck = append(inDeck, cardName)

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

		// ── Synergy accumulation ───────────────────────────────
		// Accumulate synergy data for all valid color combinations (1-5 colors).
		if colorComboSet[mainColors] {
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

		// ── Deck stats accumulation ──────────────────────────────
		// Win rate tracking uses ALL games; composition uses winning only.
		if cardLands != nil && colorComboSet[mainColors] {
			hasSplash := splashCol >= 0 && splashCol < len(row) && row[splashCol] != ""

			ds, ok := deckStats[mainColors]
			if !ok {
				ds = &deckStatsAccum{}
				deckStats[mainColors] = ds
			}

			// Win rate tracking (all games).
			if hasSplash {
				ds.splashGames++
				if won {
					ds.splashWins++
				}
			} else {
				ds.nonsplashGames++
				if won {
					ds.nonsplashWins++
				}
			}

			// Composition stats (winning decks only).
			if won {
				ds.winDecks++
				var landCount, creatureCount, noncreatureCount, fixingCount int
				for _, name := range inDeck {
					cols := cards[name]
					count := 0
					if cols.deck > 0 && cols.deck < len(row) {
						fmt.Sscanf(row[cols.deck], "%d", &count)
					}
					if cardLands[name] {
						landCount += count
						if cardFixing[name] {
							fixingCount += count
						}
					} else if cardRoles != nil {
						if roles, ok := cardRoles[name]; ok && roles["creature"] {
							creatureCount += count
						} else {
							noncreatureCount += count
						}
					} else {
						// Without role data, classify by type_line-derived land status only.
						noncreatureCount += count
					}
				}
				ds.totalLands += landCount
				ds.totalCreatures += creatureCount
				ds.totalNoncreat += noncreatureCount
				ds.totalFixing += fixingCount

				if hasSplash {
					ds.splashWinDecks++
					ds.splashFixingTotal += fixingCount
				}
			}
		}

		// Accumulate CMC curves and role targets for winning decks.
		if won && colorComboSet[mainColors] {
			if cardCMC != nil {
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

			if cardRoles != nil {
				ra, ok := roleTargets[mainColors]
				if !ok {
					ra = &roleTargetAccum{roleCounts: make(map[string]int)}
					roleTargets[mainColors] = ra
				}
				ra.totalDecks++
				for _, name := range inDeck {
					if roles, ok := cardRoles[name]; ok {
						for role := range roles {
							ra.roleCounts[role]++
						}
					}
				}
			}
		}
	}

	fmt.Printf("  Processed %d games\n", rowCount)

	// ── Post-processing: compute synergy deltas ────────────────

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
		for cmc := range 8 {
			if ca.cmcCounts[cmc] == 0 {
				continue
			}
			curveRows = append(curveRows, curveRow{
				Archetype:  cp,
				CMC:        cmc,
				AvgCount:   round4(float64(ca.cmcCounts[cmc]) / float64(ca.totalDecks)),
				TotalDecks: ca.totalDecks,
			})
		}
	}

	// Compute role target averages.
	var roleTargetRows []roleTargetRow
	for cp, ra := range roleTargets {
		if ra.totalDecks == 0 {
			continue
		}
		for role, count := range ra.roleCounts {
			roleTargetRows = append(roleTargetRows, roleTargetRow{
				Archetype:  cp,
				Role:       role,
				AvgCount:   round4(float64(count) / float64(ra.totalDecks)),
				TotalDecks: ra.totalDecks,
			})
		}
	}

	// Compute deck stats averages.
	var deckStatsRows []deckStatsRow
	for cp, ds := range deckStats {
		if ds.winDecks == 0 {
			continue
		}
		row := deckStatsRow{
			Archetype:       cp,
			AvgLands:        round4(float64(ds.totalLands) / float64(ds.winDecks)),
			AvgCreatures:    round4(float64(ds.totalCreatures) / float64(ds.winDecks)),
			AvgNoncreatures: round4(float64(ds.totalNoncreat) / float64(ds.winDecks)),
			AvgFixing:       round4(float64(ds.totalFixing) / float64(ds.winDecks)),
			TotalDecks:      ds.winDecks,
		}
		totalSplashDecks := ds.splashGames
		totalNonsplashDecks := ds.nonsplashGames
		if totalSplashDecks > 0 {
			row.SplashRate = round4(float64(totalSplashDecks) / float64(totalSplashDecks+totalNonsplashDecks))
			row.SplashWinrate = round4(float64(ds.splashWins) / float64(totalSplashDecks))
		}
		if totalNonsplashDecks > 0 {
			row.NonsplashWinrate = round4(float64(ds.nonsplashWins) / float64(totalNonsplashDecks))
		}
		if ds.splashWinDecks > 0 {
			row.SplashAvgSources = round4(float64(ds.splashFixingTotal) / float64(ds.splashWinDecks))
		}
		deckStatsRows = append(deckStatsRows, row)
	}

	syn := synergyDataResult{Set: set, Synergies: synergies, Curves: curveRows, RoleTargets: roleTargetRows, DeckStats: deckStatsRows}
	return accums, syn, nil
}

// buildSetSynergySQL generates per-set SQL with per-set DELETEs (WHERE set_code = X)
// instead of global DELETEs. Each set can be imported independently.
func buildSetSynergySQL(r synergyDataResult) string {
	var b strings.Builder
	q := cfapi.SQLQuote
	sc := q(r.Set)

	// Per-set DELETEs — only remove this set's data, not all sets.
	fmt.Fprintf(&b, "DELETE FROM mtga_draft_synergies WHERE set_code = %s;\n", sc)
	fmt.Fprintf(&b, "DELETE FROM mtga_draft_archetype_curves WHERE set_code = %s;\n", sc)
	fmt.Fprintf(&b, "DELETE FROM mtga_draft_role_targets WHERE set_code = %s;\n", sc)
	fmt.Fprintf(&b, "DELETE FROM mtga_draft_deck_stats WHERE set_code = %s;\n", sc)
	fmt.Fprintf(&b, "DELETE FROM mtga_draft_calibration WHERE set_code = %s;\n", sc)

	for _, s := range r.Synergies {
		fmt.Fprintf(&b, "INSERT INTO mtga_draft_synergies (set_code, card_a, card_b, synergy_delta, games_together) VALUES (%s, %s, %s, %g, %d);\n",
			sc, q(s.CardA), q(s.CardB), s.SynergyDelta, s.GamesTogether)
	}
	for _, c := range r.Curves {
		fmt.Fprintf(&b, "INSERT INTO mtga_draft_archetype_curves (set_code, archetype, cmc, avg_count, total_decks) VALUES (%s, %s, %d, %g, %d);\n",
			sc, q(c.Archetype), c.CMC, c.AvgCount, c.TotalDecks)
	}
	for _, rt := range r.RoleTargets {
		fmt.Fprintf(&b, "INSERT INTO mtga_draft_role_targets (set_code, archetype, role, avg_count, total_decks) VALUES (%s, %s, %s, %g, %d);\n",
			sc, q(rt.Archetype), q(rt.Role), rt.AvgCount, rt.TotalDecks)
	}
	for _, ds := range r.DeckStats {
		fmt.Fprintf(&b, "INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks) VALUES (%s, %s, %g, %g, %g, %g, %g, %g, %g, %g, %d);\n",
			sc, q(ds.Archetype), ds.AvgLands, ds.AvgCreatures, ds.AvgNoncreatures, ds.AvgFixing, ds.SplashRate, ds.SplashAvgSources, ds.SplashWinrate, ds.NonsplashWinrate, ds.TotalDecks)
	}
	for _, cal := range r.Calibration {
		fmt.Fprintf(&b, "INSERT INTO mtga_draft_calibration (set_code, axis, center, steepness) VALUES (%s, %s, %g, %g);\n",
			sc, q(cal.Axis), cal.Center, cal.Steepness)
	}

	return b.String()
}

// buildSetRatingsSQL generates per-set SQL for draft ratings with per-set DELETEs.
func buildSetRatingsSQL(sr setResult) string {
	var b strings.Builder
	q := cfapi.SQLQuote
	sc := q(sr.Set)

	// Per-set DELETEs.
	fmt.Fprintf(&b, "DELETE FROM mtga_draft_ratings_fts WHERE set_code = %s;\n", sc)
	fmt.Fprintf(&b, "DELETE FROM mtga_draft_archetype_stats WHERE set_code = %s;\n", sc)
	fmt.Fprintf(&b, "DELETE FROM mtga_draft_ratings WHERE set_code = %s;\n", sc)
	fmt.Fprintf(&b, "DELETE FROM mtga_draft_set_stats WHERE set_code = %s;\n", sc)

	fmt.Fprintf(&b, "INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (%s, 'PremierDraft', %d, %d, %g);\n",
		sc, sr.TotalGames, sr.CardCount, round4(sr.AvgGIHWR))

	for _, c := range sr.Cards {
		o := c.Overall
		fmt.Fprintf(&b, "INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (%s, %s, %d, %d, %d, %g, %g, %g, %g, %g, %g, %g, %g);\n",
			sc, q(c.Name),
			o.GamesInHand, o.GamesPlayed, o.GamesNotSeen,
			round4(o.GIHWR), round4(o.OHWR), round4(o.GDWR), round4(o.GNSWR),
			round4(o.IWD), round4(o.ALSA), round4(o.ATA), round4(o.ATAStddev))
		fmt.Fprintf(&b, "INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (%s, %s);\n",
			sc, q(c.Name))
		for cp, s := range c.ByColor {
			fmt.Fprintf(&b, "INSERT INTO mtga_draft_archetype_stats (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (%s, %s, %s, %d, %d, %d, %g, %g, %g, %g, %g, %g, %g, %g);\n",
				sc, q(c.Name), q(cp),
				s.GamesInHand, s.GamesPlayed, s.GamesNotSeen,
				round4(s.GIHWR), round4(s.OHWR), round4(s.GDWR), round4(s.GNSWR),
				round4(s.IWD), round4(s.ALSA), round4(s.ATA), round4(s.ATAStddev))
		}
	}

	return b.String()
}
