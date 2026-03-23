package main

import (
	"strings"
	"testing"
)

func TestBuildCardImportSQL(t *testing.T) {
	cards := []ScryfallCard{
		{
			ArenaID:       87521,
			OracleID:      "abc-123",
			Name:          "Sheoldred, the Apocalypse",
			ManaCost:      "{2}{B}{B}",
			CMC:           4,
			TypeLine:      "Legendary Creature — Phyrexian Praetor",
			OracleText:    "Deathtouch\nWhenever you draw a card, you gain 2 life.",
			Colors:        []string{"B"},
			ColorIdentity: []string{"B"},
			Legalities:    map[string]string{"standard": "banned", "historic": "legal"},
			Rarity:        "mythic",
			Set:           "DMU",
			Keywords:      []string{"deathtouch"},
		},
		{
			ArenaID:    1,
			OracleID:   "def-456",
			Name:       "Lightning Bolt",
			ManaCost:   "{R}",
			CMC:        1,
			TypeLine:   "Instant",
			OracleText: "Lightning Bolt deals 3 damage to any target.",
			Colors:     []string{"R"},
			Rarity:     "common",
			Set:        "STA",
		},
	}

	sql := buildCardImportSQL(cards)

	// Should start with DELETE statements to clear old data
	if !strings.HasPrefix(sql, "DELETE FROM mtga_cards_fts;") {
		t.Error("SQL should start with DELETE FROM mtga_cards_fts")
	}
	if !strings.Contains(sql, "DELETE FROM mtga_cards;") {
		t.Error("SQL should contain DELETE FROM mtga_cards")
	}

	// Should contain INSERT into mtga_cards for each card
	if !strings.Contains(sql, "INSERT INTO mtga_cards") {
		t.Error("SQL should contain INSERT INTO mtga_cards")
	}
	if !strings.Contains(sql, "Sheoldred, the Apocalypse") {
		t.Error("SQL should contain card name Sheoldred")
	}
	if !strings.Contains(sql, "Lightning Bolt") {
		t.Error("SQL should contain card name Lightning Bolt")
	}

	// Should contain INSERT into mtga_cards_fts for each card
	if !strings.Contains(sql, "INSERT INTO mtga_cards_fts") {
		t.Error("SQL should contain INSERT INTO mtga_cards_fts")
	}

	// Count INSERT statements: 2 cards × 2 tables = 4 INSERTs
	insertCount := strings.Count(sql, "INSERT INTO")
	if insertCount != 4 {
		t.Errorf("expected 4 INSERT statements, got %d", insertCount)
	}

	// Should handle single quotes in card names (SQL injection safety)
	if strings.Contains(sql, "Sheoldred, the Apocalypse") {
		// Good — it's there but let's also test escaping
	}

	// JSON arrays should be present for colors/legalities
	if !strings.Contains(sql, `["B"]`) {
		t.Error("SQL should contain JSON array for colors")
	}
}

func TestBuildCardImportSQL_EscapesSingleQuotes(t *testing.T) {
	cards := []ScryfallCard{
		{
			ArenaID:    1,
			OracleID:   "a",
			Name:       "Frodo's Ring",
			OracleText: "It's dangerous to go alone.",
			Rarity:     "rare",
			Set:        "LTR",
		},
	}

	sql := buildCardImportSQL(cards)

	// Single quotes must be doubled for SQL safety
	if !strings.Contains(sql, "Frodo''s Ring") {
		t.Error("SQL should escape single quotes in card names")
	}
	if !strings.Contains(sql, "It''s dangerous") {
		t.Error("SQL should escape single quotes in oracle text")
	}
}

func TestBuildCardImportSQL_EmptyCards(t *testing.T) {
	sql := buildCardImportSQL(nil)

	// Should still have DELETE statements even with no cards
	if !strings.Contains(sql, "DELETE FROM mtga_cards_fts;") {
		t.Error("SQL should contain DELETE even with no cards")
	}
	if !strings.Contains(sql, "DELETE FROM mtga_cards;") {
		t.Error("SQL should contain DELETE even with no cards")
	}

	// Should NOT contain any INSERT statements
	if strings.Contains(sql, "INSERT") {
		t.Error("SQL should not contain INSERT with empty cards")
	}
}

func TestCardEmbeddingText(t *testing.T) {
	card := ScryfallCard{
		Name:       "Lightning Bolt",
		TypeLine:   "Instant",
		OracleText: "Lightning Bolt deals 3 damage to any target.",
	}

	text := cardEmbeddingText(card)
	expected := "Lightning Bolt Instant Lightning Bolt deals 3 damage to any target."
	if text != expected {
		t.Errorf("expected %q, got %q", expected, text)
	}
}
