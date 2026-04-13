package main

import (
	"strings"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/magic/tools/internal/fetch"
)

// testArenaCards provides a minimal arena ID → card mapping for tests.
var testArenaCards = map[int]arenaCardInfo{
	95194: {name: "Island", cmc: 0},
	95196: {name: "Swamp", cmc: 0},
	93965: {name: "Gleaming Barrier", cmc: 2},
	93757: {name: "Kaito, Cunning Infiltrator", cmc: 3},
	93782: {name: "Seeker's Folly", cmc: 3},
	93743: {name: "Archmage of Runes", cmc: 5},
	93831: {name: "Dreadwing Scavenger", cmc: 3},
	93885: {name: "Eaten Alive", cmc: 1},
	93863: {name: "Aegis Turtle", cmc: 1},
	93848: {name: "Ajani's Pridemate", cmc: 2},
	93963: {name: "Burnished Hart", cmc: 3},
}

func TestResolveCardIDs(t *testing.T) {
	names := resolveCardIDs("93965|95194|93757", testArenaCards)
	if len(names) != 3 {
		t.Fatalf("expected 3 names, got %d", len(names))
	}
	if names[0] != "Gleaming Barrier" {
		t.Errorf("expected Gleaming Barrier, got %s", names[0])
	}
	if names[1] != "Island" {
		t.Errorf("expected Island, got %s", names[1])
	}
}

func TestResolveCardIDs_SkipsTokens(t *testing.T) {
	// 99999 is not in the arena cards map (token).
	names := resolveCardIDs("93965|99999|93757", testArenaCards)
	if len(names) != 2 {
		t.Fatalf("expected 2 names (token skipped), got %d: %v", len(names), names)
	}
}

func TestResolveCardIDs_Empty(t *testing.T) {
	names := resolveCardIDs("", testArenaCards)
	if len(names) != 0 {
		t.Fatalf("expected 0 names, got %d", len(names))
	}
}

func TestIsBasicLand(t *testing.T) {
	for _, name := range []string{"Plains", "Island", "Swamp", "Mountain", "Forest"} {
		if !isBasicLand(name) {
			t.Errorf("%s should be a basic land", name)
		}
	}
	if isBasicLand("Kaito, Cunning Infiltrator") {
		t.Error("Kaito should not be a basic land")
	}
}

func TestManaSpentBucket(t *testing.T) {
	tests := []struct {
		mana     float64
		expected int
	}{
		{0, 0},
		{1.5, 2},
		{3.0, 3},
		{5.0, 5},
		{8.0, 5}, // capped at 5
		{-1, 0},  // negative clamped to 0
	}
	for _, tt := range tests {
		got := manaSpentBucket(tt.mana)
		if got != tt.expected {
			t.Errorf("manaSpentBucket(%g) = %d, want %d", tt.mana, got, tt.expected)
		}
	}
}

func TestNonlandCMCBucket(t *testing.T) {
	if nonlandCMCBucket(1.5) != "low" {
		t.Error("1.5 should be low")
	}
	if nonlandCMCBucket(2.5) != "mid" {
		t.Error("2.5 should be mid")
	}
	if nonlandCMCBucket(3.5) != "high" {
		t.Error("3.5 should be high")
	}
}

func TestClampTurn(t *testing.T) {
	if clampTurn(0) != 1 {
		t.Error("0 should clamp to 1")
	}
	if clampTurn(5) != 5 {
		t.Error("5 should stay 5")
	}
	if clampTurn(25) != maxTurn {
		t.Errorf("25 should clamp to %d", maxTurn)
	}
}

func TestProcessReplayCSV_MinimalGame(t *testing.T) {
	// Build a minimal replay CSV with one game, 2 turns.
	// This tests the full streaming pipeline end-to-end.
	header := []string{
		"expansion", "event_type", "draft_id", "draft_time",
		"build_index", "match_number", "game_number", "game_time",
		"rank", "opp_rank", "main_colors", "splash_colors",
		"on_play", "num_mulligans", "opp_num_mulligans", "opp_colors",
		"num_turns", "won",
		"opening_hand",
		// Turn 1 user columns
		"user_turn_1_lands_played",
		"user_turn_1_creatures_cast",
		"user_turn_1_non_creatures_cast",
		"user_turn_1_user_mana_spent",
		"user_turn_1_creatures_attacked",
		"user_turn_1_eot_user_creatures_in_play",
		"user_turn_1_eot_oppo_creatures_in_play",
		// Turn 2 user columns
		"user_turn_2_lands_played",
		"user_turn_2_creatures_cast",
		"user_turn_2_non_creatures_cast",
		"user_turn_2_user_mana_spent",
		"user_turn_2_creatures_attacked",
		"user_turn_2_eot_user_creatures_in_play",
		"user_turn_2_eot_oppo_creatures_in_play",
	}

	row := []string{
		"FDN", "PremierDraft", "abc123", "2024-11-12 19:09:18",
		"0", "1", "1", "2024-11-12 19:39:12",
		"platinum", "None", "UB", "",
		"True", "0", "0", "WU",
		"2", "True",
		"95194|93965|93757|93782|93743|93831|95194", // opening hand: 2 Island, Gleaming Barrier, Kaito, Seeker's Folly, Archmage, Dreadwing
		// Turn 1
		"95194", // lands_played: Island
		"93965", // creatures_cast: Gleaming Barrier
		"",      // non_creatures_cast
		"2.0",   // mana_spent
		"",      // creatures_attacked (none)
		"93965", // eot_user_creatures: Gleaming Barrier
		"",      // eot_oppo_creatures
		// Turn 2
		"95194", // lands_played: Island
		"",      // creatures_cast
		"93757", // non_creatures_cast: Kaito
		"3.0",   // mana_spent
		"93965", // creatures_attacked: Gleaming Barrier
		"93965", // eot_user_creatures
		"93848", // eot_oppo_creatures: Ajani's Pridemate
	}

	csvData := strings.Join(header, ",") + "\n" + strings.Join(row, ",") + "\n"

	result, err := processReplayCSV(strings.NewReader(csvData), "FDN", testArenaCards)
	if err != nil {
		t.Fatalf("processReplayCSV failed: %v", err)
	}

	if result.totalGames != 1 {
		t.Errorf("expected 1 game, got %d", result.totalGames)
	}
	if result.set != "FDN" {
		t.Errorf("expected set FDN, got %s", result.set)
	}

	// Check that we got some card timing data.
	// Note: minimum sample size is 20, so with 1 game nothing will pass the filter.
	// That's fine — this test validates parsing without crashing.
	// For data output tests we'd need 20+ rows.
	t.Logf("Card timing accums: %d (pre-filter)", len(result.cardTiming))
	t.Logf("Tempo accums: %d (pre-filter)", len(result.tempo))
	t.Logf("Combat accums: %d (pre-filter)", len(result.combat))
	t.Logf("Mulligan accums: %d (pre-filter)", len(result.mulligan))
	t.Logf("Baseline accums: %d (pre-filter)", len(result.baselines))
}

func TestProcessReplayCSV_SampleSizeFilter(t *testing.T) {
	// Create 25 identical games to pass the minimum sample size filter (20).
	header := []string{
		"expansion", "event_type", "draft_id", "draft_time",
		"build_index", "match_number", "game_number", "game_time",
		"rank", "opp_rank", "main_colors", "splash_colors",
		"on_play", "num_mulligans", "opp_num_mulligans", "opp_colors",
		"num_turns", "won",
		"opening_hand",
		"user_turn_1_lands_played",
		"user_turn_1_creatures_cast",
		"user_turn_1_non_creatures_cast",
		"user_turn_1_user_mana_spent",
		"user_turn_1_creatures_attacked",
		"user_turn_1_eot_user_creatures_in_play",
		"user_turn_1_eot_oppo_creatures_in_play",
	}

	row := []string{
		"FDN", "PremierDraft", "abc123", "2024-11-12 19:09:18",
		"0", "1", "1", "2024-11-12 19:39:12",
		"platinum", "None", "UB", "",
		"True", "0", "0", "WU",
		"1", "True",
		"95194|93965|93757|93782|93743|93831|95194",
		"95194", // lands played
		"93965", // creatures cast: Gleaming Barrier
		"",      // non creatures
		"2.0",   // mana spent
		"93965", // attacked: Gleaming Barrier
		"93965", // eot user creatures
		"93848", // eot oppo creatures
	}

	var b strings.Builder
	b.WriteString(strings.Join(header, ","))
	b.WriteString("\n")
	rowStr := strings.Join(row, ",")
	for range 25 {
		b.WriteString(rowStr)
		b.WriteString("\n")
	}

	result, err := processReplayCSV(strings.NewReader(b.String()), "FDN", testArenaCards)
	if err != nil {
		t.Fatalf("processReplayCSV failed: %v", err)
	}

	if result.totalGames != 25 {
		t.Errorf("expected 25 games, got %d", result.totalGames)
	}

	// With 25 identical games, card timing for Gleaming Barrier should pass the filter.
	foundGleaming := false
	for _, ct := range result.cardTiming {
		if ct.CardName == "Gleaming Barrier" && ct.TurnNumber == 1 {
			foundGleaming = true
			if ct.TotalGames != 25 {
				t.Errorf("expected 25 games for Gleaming Barrier turn 1, got %d", ct.TotalGames)
			}
			if ct.GamesWon != 25 {
				t.Errorf("expected 25 wins for Gleaming Barrier turn 1, got %d", ct.GamesWon)
			}
			break
		}
	}
	if !foundGleaming {
		t.Error("expected Gleaming Barrier card timing at turn 1 to pass sample size filter")
	}

	// Verify tempo data exists.
	if len(result.tempo) == 0 {
		t.Error("expected tempo data to pass sample size filter")
	}

	// Verify combat data exists (Gleaming Barrier attacked).
	foundCombat := false
	for _, c := range result.combat {
		if c.AttackerName == "Gleaming Barrier" && c.Attacked {
			foundCombat = true
			break
		}
	}
	if !foundCombat {
		t.Error("expected Gleaming Barrier attack combat data")
	}

	// Verify baselines exist.
	if len(result.baselines) == 0 {
		t.Error("expected baseline data to pass sample size filter")
	}

	// Verify SQL generation doesn't crash.
	sql := buildReplaySQL(result)
	if !strings.Contains(sql, "Gleaming Barrier") {
		t.Error("expected SQL to contain Gleaming Barrier")
	}
	if !strings.Contains(sql, "magic_play_card_timing") {
		t.Error("expected SQL to reference magic_play_card_timing table")
	}
}

func TestBuildReplaySQL_DeletesPerSet(t *testing.T) {
	result := &replayResult{set: "FDN"}
	sql := buildReplaySQL(result)

	for _, table := range []string{
		"magic_play_card_timing",
		"magic_play_tempo",
		"magic_play_combat",
		"magic_play_mulligan",
		"magic_play_turn_baselines",
	} {
		expected := "DELETE FROM " + table + " WHERE set_code = 'FDN'"
		if !strings.Contains(sql, expected) {
			t.Errorf("expected SQL to contain %q", expected)
		}
	}
}

func TestNormalizeColors(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"UB", "UB"},
		{"BU", "UB"},
		{"WU", "WU"},
		{"UW", "WU"},
		{"RWG", "WRG"},
		{"W", "W"},
	}
	for _, tt := range tests {
		got := fetch.NormalizeColors(tt.input)
		if got != tt.expected {
			t.Errorf("fetch.NormalizeColors(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}
