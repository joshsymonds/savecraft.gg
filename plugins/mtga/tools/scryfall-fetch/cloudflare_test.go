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
			IsDefault:     true,
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
			IsDefault:  true,
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

	// Should contain is_default in INSERT
	if !strings.Contains(sql, "is_default") {
		t.Error("SQL should contain is_default column")
	}

	// Both cards are default, so FTS5 INSERTs for both
	if !strings.Contains(sql, "INSERT INTO mtga_cards_fts") {
		t.Error("SQL should contain INSERT INTO mtga_cards_fts")
	}

	// Count INSERT statements: 2 default cards × 2 tables = 4 INSERTs
	insertCount := strings.Count(sql, "INSERT INTO")
	if insertCount != 4 {
		t.Errorf("expected 4 INSERT statements, got %d", insertCount)
	}

	// JSON arrays should be present for colors/legalities
	if !strings.Contains(sql, `["B"]`) {
		t.Error("SQL should contain JSON array for colors")
	}
}

func TestBuildCardImportSQL_NonDefaultSkipsFTS(t *testing.T) {
	cards := []ScryfallCard{
		{
			ArenaID:   100,
			OracleID:  "oracle-1",
			Name:      "Go for the Throat",
			Rarity:    "uncommon",
			Set:       "BRO",
			IsDefault: false,
		},
		{
			ArenaID:   200,
			OracleID:  "oracle-1",
			Name:      "Go for the Throat",
			Rarity:    "uncommon",
			Set:       "FDN",
			IsDefault: true,
		},
	}

	sql := buildCardImportSQL(cards)

	// Both cards get mtga_cards INSERT
	mtgaInserts := strings.Count(sql, "INSERT INTO mtga_cards (")
	if mtgaInserts != 2 {
		t.Errorf("expected 2 mtga_cards INSERTs, got %d", mtgaInserts)
	}

	// Only default card gets FTS5 INSERT
	ftsInserts := strings.Count(sql, "INSERT INTO mtga_cards_fts")
	if ftsInserts != 1 {
		t.Errorf("expected 1 mtga_cards_fts INSERT (default only), got %d", ftsInserts)
	}

	// Non-default has is_default 0
	if !strings.Contains(sql, ", 0);") {
		t.Error("SQL should contain is_default = 0 for non-default card")
	}
	// Default has is_default 1
	if !strings.Contains(sql, ", 1);") {
		t.Error("SQL should contain is_default = 1 for default card")
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
			IsDefault:  true,
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

func TestComputeDefaults(t *testing.T) {
	cards := []ScryfallCard{
		{ArenaID: 100, OracleID: "oracle-1", Name: "Go for the Throat", Set: "BRO"},
		{ArenaID: 300, OracleID: "oracle-1", Name: "Go for the Throat", Set: "FDN"},
		{ArenaID: 200, OracleID: "oracle-1", Name: "Go for the Throat", Set: "DSK"},
		{ArenaID: 500, OracleID: "oracle-2", Name: "Lightning Bolt", Set: "STA"},
	}

	computeDefaults(cards)

	// Highest arena_id per oracle_id should be default
	for _, c := range cards {
		switch {
		case c.OracleID == "oracle-1" && c.ArenaID == 300:
			if !c.IsDefault {
				t.Errorf("Go for the Throat (FDN, arena_id=300) should be default")
			}
		case c.OracleID == "oracle-1":
			if c.IsDefault {
				t.Errorf("Go for the Throat (arena_id=%d) should NOT be default", c.ArenaID)
			}
		case c.OracleID == "oracle-2":
			if !c.IsDefault {
				t.Errorf("Lightning Bolt should be default (only printing)")
			}
		}
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
