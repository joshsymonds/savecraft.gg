package manabase

import (
	"strings"
	"testing"
)

func TestParsePips(t *testing.T) {
	tests := []struct {
		manaCost string
		want     map[string]int
	}{
		{"{2}{B}{B}", map[string]int{"B": 2}},
		{"{W}{U}", map[string]int{"W": 1, "U": 1}},
		{"{3}{R}", map[string]int{"R": 1}},
		{"{G}{G}{G}", map[string]int{"G": 3}},
		{"{1}{W}{U}{B}", map[string]int{"W": 1, "U": 1, "B": 1}},
		{"{X}{R}", map[string]int{"R": 1}},
		{"{0}", map[string]int{}},
	}
	for _, tt := range tests {
		pips := parsePips(tt.manaCost)
		for color, expected := range tt.want {
			if pips[color] != expected {
				t.Errorf("parsePips(%q)[%s] = %d, want %d", tt.manaCost, color, pips[color], expected)
			}
		}
		// Check no extra colors.
		for color, count := range pips {
			if tt.want[color] == 0 && count > 0 {
				t.Errorf("parsePips(%q) has unexpected color %s=%d", tt.manaCost, color, count)
			}
		}
	}
}

func TestParseGeneric(t *testing.T) {
	tests := []struct {
		manaCost string
		want     int
	}{
		{"{2}{B}{B}", 2},
		{"{W}{U}", 0},
		{"{3}{R}", 3},
		{"{X}{R}", 0}, // X is not generic
		{"{0}", 0},
		{"{10}{G}", 10},
	}
	for _, tt := range tests {
		got := parseGeneric(tt.manaCost)
		if got != tt.want {
			t.Errorf("parseGeneric(%q) = %d, want %d", tt.manaCost, got, tt.want)
		}
	}
}

func TestSourceRequirementKarstenValues(t *testing.T) {
	// Verify against Karsten's published 60-card table.
	tests := []struct {
		pattern  CostPattern
		deckSize int
		want     int
	}{
		{CostPattern{0, 1}, 60, 14}, // C = 14
		{CostPattern{1, 1}, 60, 13}, // 1C = 13
		{CostPattern{2, 1}, 60, 12}, // 2C = 12
		{CostPattern{0, 2}, 60, 21}, // CC = 21
		{CostPattern{1, 2}, 60, 18}, // 1CC = 18
		{CostPattern{2, 2}, 60, 16}, // 2CC = 16
		{CostPattern{0, 3}, 60, 23}, // CCC = 23
		{CostPattern{1, 3}, 60, 21}, // 1CCC = 21
		{CostPattern{0, 4}, 60, 24}, // CCCC = 24
		// 40-card deck.
		{CostPattern{0, 1}, 40, 9},  // C = 9
		{CostPattern{0, 2}, 40, 14}, // CC = 14
		{CostPattern{1, 2}, 40, 12}, // 1CC = 12
		// 99-card deck.
		{CostPattern{0, 2}, 99, 30}, // CC = 30
		{CostPattern{1, 2}, 99, 28}, // 1CC = 28
	}
	for _, tt := range tests {
		got := SourceRequirement(tt.pattern, tt.deckSize)
		if got != tt.want {
			t.Errorf("SourceRequirement(%v, %d) = %d, want %d", tt.pattern, tt.deckSize, got, tt.want)
		}
	}
}

func TestAnalyzeSingleColor(t *testing.T) {
	// Mono-black deck with Sheoldred (2BB = 2CC pattern).
	result := Analyze(Query{
		Deck:     []DeckEntry{{Name: "Sheoldred, the Apocalypse", Count: 4}},
		DeckSize: 60,
	})
	if result == nil {
		t.Fatal("expected result")
	}
	// 2CC in 60-card = 16 sources. Not gold (mono-black), no +1.
	if !strings.Contains(result.Formatted, " 16  2CC") {
		t.Errorf("expected '16  2CC' for Sheoldred, got:\n%s", result.Formatted)
	}
	if !strings.Contains(result.Formatted, "Sheoldred") {
		t.Error("expected Sheoldred cited as most demanding spell")
	}
	if !strings.Contains(result.Formatted, "Black") {
		t.Error("expected 'Black' in output")
	}
}

func TestAnalyzeGoldCardAdjustment(t *testing.T) {
	// Rona, Sheoldred's Faithful is {1}{U}{B}{B} — gold card (U+B).
	// For black: 2 pips, total CMC 4, generic=2, pattern "2CC" = 16 + 1 gold = 17
	// For blue: 1 pip, total CMC 4, generic=3, pattern "3C" = 10 + 1 gold = 11
	result := Analyze(Query{
		Deck:     []DeckEntry{{Name: "Rona, Sheoldred's Faithful", Count: 4}},
		DeckSize: 60,
	})
	if result == nil {
		t.Fatal("expected result")
	}
	// Black should be 17 (2CC + 1 gold).
	if !strings.Contains(result.Formatted, "17") {
		t.Errorf("expected 17 black sources (2CC=16 + 1 gold), got:\n%s", result.Formatted)
	}
	if !strings.Contains(result.Formatted, "+1 gold") {
		t.Error("expected gold adjustment noted in output")
	}
}

func TestAnalyzeMostDemandingWins(t *testing.T) {
	// Two black spells: Sheoldred (2BB = needs 16) and Sheoldred's Edict (1B = needs 13).
	// Should pick Sheoldred as most demanding.
	result := Analyze(Query{
		Deck: []DeckEntry{
			{Name: "Sheoldred, the Apocalypse", Count: 4},
			{Name: "Sheoldred's Edict", Count: 3},
		},
		DeckSize: 60,
	})
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "Sheoldred, the Apocalypse") {
		t.Errorf("expected Sheoldred as most demanding, got:\n%s", result.Formatted)
	}
}

func TestAnalyze40CardDeck(t *testing.T) {
	result := Analyze(Query{
		Deck:     []DeckEntry{{Name: "Sheoldred, the Apocalypse", Count: 1}},
		DeckSize: 40,
	})
	if result == nil {
		t.Fatal("expected result")
	}
	// 2CC in 40-card = 11 sources.
	if !strings.Contains(result.Formatted, " 11  2CC") {
		t.Errorf("expected '11  2CC' for Sheoldred in 40-card, got:\n%s", result.Formatted)
	}
	if !strings.Contains(result.Formatted, "40-card") {
		t.Error("expected '40-card' in output")
	}
}

func TestAnalyzeEmptyDeck(t *testing.T) {
	result := Analyze(Query{Deck: nil, DeckSize: 60})
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "No spells") {
		t.Error("expected 'No spells' message for empty deck")
	}
}

func TestAnalyzeUnknownCard(t *testing.T) {
	result := Analyze(Query{
		Deck:     []DeckEntry{{Name: "Totally Fake Card", Count: 4}},
		DeckSize: 60,
	})
	if result == nil {
		t.Fatal("expected result")
	}
	// Unknown card should be skipped, resulting in no requirements.
	if !strings.Contains(result.Formatted, "No spells") {
		t.Errorf("expected 'No spells' for unknown card, got:\n%s", result.Formatted)
	}
}

func TestClosestDeckSize(t *testing.T) {
	tests := []struct {
		input int
		want  int
	}{
		{40, 40}, {60, 60}, {80, 80}, {99, 99},
		{50, 40}, {51, 60}, {70, 60}, {71, 80},
		{90, 99}, {100, 99}, {30, 40},
	}
	for _, tt := range tests {
		got := closestDeckSize(tt.input)
		if got != tt.want {
			t.Errorf("closestDeckSize(%d) = %d, want %d", tt.input, got, tt.want)
		}
	}
}

func TestPatternKey(t *testing.T) {
	tests := []struct {
		pattern CostPattern
		want    string
	}{
		{CostPattern{0, 1}, "C"},
		{CostPattern{0, 2}, "CC"},
		{CostPattern{0, 3}, "CCC"},
		{CostPattern{1, 1}, "1C"},
		{CostPattern{2, 2}, "2CC"},
		{CostPattern{3, 3}, "3CCC"},
	}
	for _, tt := range tests {
		got := patternKey(tt.pattern)
		if got != tt.want {
			t.Errorf("patternKey(%v) = %q, want %q", tt.pattern, got, tt.want)
		}
	}
}
