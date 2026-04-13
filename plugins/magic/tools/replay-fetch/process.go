package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/magic/tools/internal/fetch"
	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// processReplayData downloads (or reads from cache) the replay_data CSV for a
// set and performs a single streaming pass to accumulate gameplay statistics.
func processReplayData(set string, cacheDir string, arenaCards map[int]arenaCardInfo) (*replayResult, error) {
	url := fmt.Sprintf(replayDataURL, set)
	filename := fmt.Sprintf("replay_data_public.%s.PremierDraft.csv.gz", set)
	reader, err := fetch.CachedDownloadGzip(url, cacheDir, filename)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	return processReplayCSV(reader, set, arenaCards)
}

// processReplayCSV performs a single streaming pass over a replay_data CSV,
// accumulating per-turn gameplay statistics into five table accumulators.
func processReplayCSV(r io.Reader, set string, arenaCards map[int]arenaCardInfo) (*replayResult, error) {
	csvReader := csv.NewReader(r)
	csvReader.LazyQuotes = true // replay data has quoted multiline card names
	header, err := csvReader.Read()
	if err != nil {
		return nil, fmt.Errorf("reading header: %w", err)
	}

	// Find metadata column indices.
	wonCol := fetch.IndexOf(header, "won")
	colorsCol := fetch.IndexOf(header, "main_colors")
	onPlayCol := fetch.IndexOf(header, "on_play")
	numTurnsCol := fetch.IndexOf(header, "num_turns")
	numMulligansCol := fetch.IndexOf(header, "num_mulligans")
	openingHandCol := fetch.IndexOf(header, "opening_hand")

	if wonCol < 0 || numTurnsCol < 0 {
		return nil, fmt.Errorf("required columns not found (won, num_turns)")
	}

	// Parse per-turn column indices.
	turnCols := parseTurnColumns(header)

	// ── Accumulators ────────────────────────────────────────
	cardTimingAccums := make(map[cardTimingKey]*cardTimingAccum)
	tempoAccums := make(map[tempoKey]*tempoAccum)
	combatAccums := make(map[combatKey]*combatAccum)
	mulliganAccums := make(map[mulliganKey]*mulliganAccum)
	baselineAccums := make(map[baselineKey]*baselineAccum)

	totalGames := 0
	for {
		row, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue // Skip malformed rows.
		}
		totalGames++

		won := getCol(row, wonCol) == "True"
		mainColors := ""
		if colorsCol >= 0 {
			mainColors = fetch.NormalizeColors(getCol(row, colorsCol))
		}
		onPlay := getCol(row, onPlayCol) == "True"
		numTurns := getColInt(row, numTurnsCol)
		numMulligans := getColInt(row, numMulligansCol)

		// Process mulligan data from opening hand.
		if openingHandCol >= 0 {
			openingHand := getCol(row, openingHandCol)
			processMulligan(openingHand, mainColors, onPlay, numMulligans, won, arenaCards, mulliganAccums)
		}

		// Process per-turn data.
		for turn := 1; turn <= min(numTurns, 30); turn++ {
			clampedTurn := clampTurn(turn)

			// ── Card timing: what cards were deployed this turn? ──
			processCardTiming(row, turnCols, turn, clampedTurn, mainColors, won, arenaCards, cardTimingAccums)

			// ── Tempo: mana spent this turn ──
			processTempo(row, turnCols, turn, clampedTurn, mainColors, onPlay, won, tempoAccums)

			// ── Combat: attack decisions ──
			processCombat(row, turnCols, turn, clampedTurn, won, arenaCards, combatAccums)

			// ── Baselines: aggregate per-turn norms ──
			processBaseline(row, turnCols, turn, clampedTurn, mainColors, onPlay, won, arenaCards, baselineAccums)
		}

		if totalGames%100000 == 0 {
			fmt.Printf("  %s: processed %d games...\n", set, totalGames)
		}
	}

	// Build result from accumulators.
	result := &replayResult{
		set:        set,
		totalGames: totalGames,
	}

	for k, a := range cardTimingAccums {
		if a.totalGames < 20 { // minimum sample size
			continue
		}
		result.cardTiming = append(result.cardTiming, cardTimingRow{
			CardName:      k.cardName,
			Archetype:     k.archetype,
			TurnNumber:    k.turn,
			TimesDeployed: a.timesDeployed,
			GamesWon:      a.gamesWon,
			TotalGames:    a.totalGames,
		})
	}

	for k, a := range tempoAccums {
		if a.totalGames < 20 {
			continue
		}
		result.tempo = append(result.tempo, tempoRow{
			Archetype:       k.archetype,
			TurnNumber:      k.turn,
			OnPlay:          k.onPlay,
			ManaSpentBucket: k.manaSpentBucket,
			GamesWon:        a.gamesWon,
			TotalGames:      a.totalGames,
		})
	}

	for k, a := range combatAccums {
		if a.totalGames < 20 {
			continue
		}
		result.combat = append(result.combat, combatRow{
			AttackerName:       k.attackerName,
			TurnNumber:         k.turn,
			UserCreaturesCount: k.userCreaturesCount,
			OppoCreaturesCount: k.oppoCreaturesCount,
			Attacked:           k.attacked,
			GamesWon:           a.gamesWon,
			TotalGames:         a.totalGames,
		})
	}

	for k, a := range mulliganAccums {
		if a.totalGames < 20 {
			continue
		}
		result.mulligan = append(result.mulligan, mulliganRow{
			Archetype:       k.archetype,
			OnPlay:          k.onPlay,
			LandCount:       k.landCount,
			NonlandCMCBuckt: k.nonlandCMCBuckt,
			NumMulligans:    k.numMulligans,
			GamesWon:        a.gamesWon,
			TotalGames:      a.totalGames,
		})
	}

	for k, a := range baselineAccums {
		if a.totalGames < 20 {
			continue
		}
		result.baselines = append(result.baselines, baselineRow{
			Archetype:              k.archetype,
			TurnNumber:             k.turn,
			OnPlay:                 k.onPlay,
			TotalManaSpent:         a.totalManaSpent,
			TotalCreaturesCast:     a.totalCreaturesCast,
			TotalSpellsCast:        a.totalSpellsCast,
			TotalCreaturesAttacked: a.totalCreaturesAttacked,
			TotalAttacksPossible:   a.totalAttacksPossible,
			GamesWon:               a.gamesWon,
			TotalGames:             a.totalGames,
		})
	}

	return result, nil
}

// processCardTiming accumulates card deployment timing from a single turn.
// Records both specific cards deployed and their associated win rates.
func processCardTiming(row []string, turnCols map[turnColKey]int, turn, clampedTurn int, archetype string, won bool, arenaCards map[int]arenaCardInfo, accums map[cardTimingKey]*cardTimingAccum) {
	// Cards deployed = creatures_cast + non_creatures_cast + lands_played
	for _, field := range []string{"creatures_cast", "non_creatures_cast", "lands_played"} {
		idx, ok := turnCols[turnColKey{side: "user", turn: turn, field: field}]
		if !ok {
			continue
		}
		names := resolveCardIDs(getCol(row, idx), arenaCards)
		for _, name := range names {
			// Skip basic lands — not interesting for timing analysis.
			if isBasicLand(name) {
				continue
			}

			// Record for specific archetype.
			if archetype != "" {
				k := cardTimingKey{cardName: name, archetype: archetype, turn: clampedTurn}
				a := accums[k]
				if a == nil {
					a = &cardTimingAccum{}
					accums[k] = a
				}
				a.timesDeployed++
				a.totalGames++
				if won {
					a.gamesWon++
				}
			}

			// Record for "ALL" archetype.
			k := cardTimingKey{cardName: name, archetype: "ALL", turn: clampedTurn}
			a := accums[k]
			if a == nil {
				a = &cardTimingAccum{}
				accums[k] = a
			}
			a.timesDeployed++
			a.totalGames++
			if won {
				a.gamesWon++
			}
		}
	}
}

// processTempo accumulates mana efficiency data from a single turn.
func processTempo(row []string, turnCols map[turnColKey]int, turn, clampedTurn int, archetype string, onPlay, won bool, accums map[tempoKey]*tempoAccum) {
	idx, ok := turnCols[turnColKey{side: "user", turn: turn, field: "user_mana_spent"}]
	if !ok {
		return
	}
	manaSpent := getColFloat(row, idx)
	bucket := manaSpentBucket(manaSpent)

	for _, arch := range []string{archetype, "ALL"} {
		if arch == "" {
			continue
		}
		k := tempoKey{archetype: arch, turn: clampedTurn, onPlay: onPlay, manaSpentBucket: bucket}
		a := accums[k]
		if a == nil {
			a = &tempoAccum{}
			accums[k] = a
		}
		a.totalGames++
		if won {
			a.gamesWon++
		}
	}
}

// processCombat accumulates attack decision data from a single turn.
func processCombat(row []string, turnCols map[turnColKey]int, turn, clampedTurn int, won bool, arenaCards map[int]arenaCardInfo, accums map[combatKey]*combatAccum) {
	// Get creatures in play at end of previous turn (or start of game).
	// Use user's turn EOT creatures as proxy for what was available to attack.
	creaturesIdx, ok := turnCols[turnColKey{side: "user", turn: turn, field: "eot_user_creatures_in_play"}]
	if !ok {
		return
	}
	creaturesStr := getCol(row, creaturesIdx)
	userCreatures := countCreatures(creaturesStr)
	if userCreatures == 0 {
		return // No creatures to attack with.
	}

	oppoCreaturesIdx, ok := turnCols[turnColKey{side: "user", turn: turn, field: "eot_oppo_creatures_in_play"}]
	oppoCreatures := 0
	if ok {
		oppoCreatures = countCreatures(getCol(row, oppoCreaturesIdx))
	}

	// Get creatures that attacked.
	attackedIdx, ok := turnCols[turnColKey{side: "user", turn: turn, field: "creatures_attacked"}]
	if !ok {
		return
	}
	attackedStr := getCol(row, attackedIdx)
	attackedNames := resolveCardIDs(attackedStr, arenaCards)
	attackedSet := make(map[string]bool, len(attackedNames))
	for _, n := range attackedNames {
		attackedSet[n] = true
	}

	// Get all creatures available (from EOT creatures in play).
	// Each creature either attacked or held back.
	availableNames := resolveCardIDs(creaturesStr, arenaCards)
	clampedUser := clampCreatures(userCreatures)
	clampedOppo := clampCreatures(oppoCreatures)

	for _, name := range availableNames {
		attacked := attackedSet[name]
		k := combatKey{
			attackerName:       name,
			turn:               clampedTurn,
			userCreaturesCount: clampedUser,
			oppoCreaturesCount: clampedOppo,
			attacked:           attacked,
		}
		a := accums[k]
		if a == nil {
			a = &combatAccum{}
			accums[k] = a
		}
		a.totalGames++
		if won {
			a.gamesWon++
		}
	}
}

// processMulligan accumulates mulligan decision data from opening hand.
func processMulligan(openingHand string, archetype string, onPlay bool, numMulligansFromMeta int, won bool, arenaCards map[int]arenaCardInfo, accums map[mulliganKey]*mulliganAccum) {
	if openingHand == "" {
		return
	}

	// Classify hand by CMC: lands have CMC 0, nonlands have CMC > 0.
	// We don't have type_line in arenaCardInfo, so CMC 0 is our land proxy
	// (free spells like Ornithopter are rare enough to ignore).
	landCount := 0
	var nonlandCMCs []float64
	for _, idStr := range strings.Split(openingHand, "|") {
		idStr = strings.TrimSpace(idStr)
		if idStr == "" {
			continue
		}
		id := 0
		fmt.Sscanf(idStr, "%d", &id)
		card, ok := arenaCards[id]
		if !ok {
			continue
		}
		if card.cmc == 0 {
			landCount++
		} else {
			nonlandCMCs = append(nonlandCMCs, card.cmc)
		}
	}

	if landCount == 0 && len(nonlandCMCs) == 0 {
		return
	}

	avgNonlandCMC := 0.0
	if len(nonlandCMCs) > 0 {
		sum := 0.0
		for _, c := range nonlandCMCs {
			sum += c
		}
		avgNonlandCMC = sum / float64(len(nonlandCMCs))
	}
	cmcBucket := nonlandCMCBucket(avgNonlandCMC)

	// Use the metadata-provided mulligan count (more reliable than hand size inference).
	numMulls := numMulligansFromMeta

	for _, arch := range []string{archetype, "ALL"} {
		if arch == "" {
			continue
		}
		k := mulliganKey{
			archetype:       arch,
			onPlay:          onPlay,
			landCount:       min(landCount, 7),
			nonlandCMCBuckt: cmcBucket,
			numMulligans:    numMulls,
		}
		a := accums[k]
		if a == nil {
			a = &mulliganAccum{}
			accums[k] = a
		}
		a.totalGames++
		if won {
			a.gamesWon++
		}
	}
}

// processBaseline accumulates per-turn aggregate norms.
func processBaseline(row []string, turnCols map[turnColKey]int, turn, clampedTurn int, archetype string, onPlay, won bool, arenaCards map[int]arenaCardInfo, accums map[baselineKey]*baselineAccum) {
	// Mana spent.
	manaSpent := 0.0
	if idx, ok := turnCols[turnColKey{side: "user", turn: turn, field: "user_mana_spent"}]; ok {
		manaSpent = getColFloat(row, idx)
	}

	// Creatures cast.
	creaturesCast := 0
	if idx, ok := turnCols[turnColKey{side: "user", turn: turn, field: "creatures_cast"}]; ok {
		creaturesCast = len(resolveCardIDs(getCol(row, idx), arenaCards))
	}

	// Spells cast (creatures + non-creatures).
	spellsCast := creaturesCast
	if idx, ok := turnCols[turnColKey{side: "user", turn: turn, field: "non_creatures_cast"}]; ok {
		spellsCast += len(resolveCardIDs(getCol(row, idx), arenaCards))
	}

	// Creatures attacked.
	creaturesAttacked := 0
	if idx, ok := turnCols[turnColKey{side: "user", turn: turn, field: "creatures_attacked"}]; ok {
		creaturesAttacked = len(resolveCardIDs(getCol(row, idx), arenaCards))
	}

	// Attacks possible (creatures in play at EOT — proxy for available attackers).
	attacksPossible := 0
	if idx, ok := turnCols[turnColKey{side: "user", turn: turn, field: "eot_user_creatures_in_play"}]; ok {
		attacksPossible = countCreatures(getCol(row, idx))
	}

	for _, arch := range []string{archetype, "ALL"} {
		if arch == "" {
			continue
		}
		k := baselineKey{archetype: arch, turn: clampedTurn, onPlay: onPlay}
		a := accums[k]
		if a == nil {
			a = &baselineAccum{}
			accums[k] = a
		}
		a.totalManaSpent += manaSpent
		a.totalCreaturesCast += creaturesCast
		a.totalSpellsCast += spellsCast
		a.totalCreaturesAttacked += creaturesAttacked
		a.totalAttacksPossible += attacksPossible
		a.totalGames++
		if won {
			a.gamesWon++
		}
	}
}

// isBasicLand returns true for the 5 basic land names.
func isBasicLand(name string) bool {
	switch name {
	case "Plains", "Island", "Swamp", "Mountain", "Forest":
		return true
	}
	return false
}

// ── SQL generation ───────────────────────────────────────────

func buildReplaySQL(r *replayResult) string {
	var b strings.Builder
	q := cfapi.SQLQuote
	sc := q(r.set)

	// Per-set DELETEs.
	fmt.Fprintf(&b, "DELETE FROM magic_play_card_timing WHERE set_code = %s;\n", sc)
	fmt.Fprintf(&b, "DELETE FROM magic_play_tempo WHERE set_code = %s;\n", sc)
	fmt.Fprintf(&b, "DELETE FROM magic_play_combat WHERE set_code = %s;\n", sc)
	fmt.Fprintf(&b, "DELETE FROM magic_play_mulligan WHERE set_code = %s;\n", sc)
	fmt.Fprintf(&b, "DELETE FROM magic_play_turn_baselines WHERE set_code = %s;\n", sc)

	for _, ct := range r.cardTiming {
		fmt.Fprintf(&b, "INSERT INTO magic_play_card_timing (set_code, card_name, archetype, turn_number, times_deployed, games_won, total_games) VALUES (%s, %s, %s, %d, %d, %d, %d);\n",
			sc, q(ct.CardName), q(ct.Archetype), ct.TurnNumber, ct.TimesDeployed, ct.GamesWon, ct.TotalGames)
	}

	for _, t := range r.tempo {
		onPlay := 0
		if t.OnPlay {
			onPlay = 1
		}
		fmt.Fprintf(&b, "INSERT INTO magic_play_tempo (set_code, archetype, turn_number, on_play, mana_spent_bucket, games_won, total_games) VALUES (%s, %s, %d, %d, %d, %d, %d);\n",
			sc, q(t.Archetype), t.TurnNumber, onPlay, t.ManaSpentBucket, t.GamesWon, t.TotalGames)
	}

	for _, c := range r.combat {
		attacked := 0
		if c.Attacked {
			attacked = 1
		}
		fmt.Fprintf(&b, "INSERT INTO magic_play_combat (set_code, attacker_name, turn_number, user_creatures_count, oppo_creatures_count, attacked, games_won, total_games) VALUES (%s, %s, %d, %d, %d, %d, %d, %d);\n",
			sc, q(c.AttackerName), c.TurnNumber, c.UserCreaturesCount, c.OppoCreaturesCount, attacked, c.GamesWon, c.TotalGames)
	}

	for _, m := range r.mulligan {
		onPlay := 0
		if m.OnPlay {
			onPlay = 1
		}
		fmt.Fprintf(&b, "INSERT INTO magic_play_mulligan (set_code, archetype, on_play, land_count, nonland_cmc_bucket, num_mulligans, games_won, total_games) VALUES (%s, %s, %d, %d, %s, %d, %d, %d);\n",
			sc, q(m.Archetype), onPlay, m.LandCount, q(m.NonlandCMCBuckt), m.NumMulligans, m.GamesWon, m.TotalGames)
	}

	for _, bl := range r.baselines {
		onPlay := 0
		if bl.OnPlay {
			onPlay = 1
		}
		fmt.Fprintf(&b, "INSERT INTO magic_play_turn_baselines (set_code, archetype, turn_number, on_play, total_mana_spent, total_creatures_cast, total_spells_cast, total_creatures_attacked, total_attacks_possible, games_won, total_games) VALUES (%s, %s, %d, %d, %g, %d, %d, %d, %d, %d, %d);\n",
			sc, q(bl.Archetype), bl.TurnNumber, onPlay, fetch.Round4(bl.TotalManaSpent), bl.TotalCreaturesCast, bl.TotalSpellsCast, bl.TotalCreaturesAttacked, bl.TotalAttacksPossible, bl.GamesWon, bl.TotalGames)
	}

	return b.String()
}
