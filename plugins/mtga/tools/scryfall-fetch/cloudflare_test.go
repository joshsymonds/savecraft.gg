package main

import (
	"strings"
	"testing"
)

func TestBuildCardSQL(t *testing.T) {
	cards := []ScryfallCard{
		{
			ScryfallID:    "scry-sheoldred",
			ArenaID:       87521,
			OracleID:      "abc-123",
			Name:          "Sheoldred, the Apocalypse",
			FrontFaceName: "Sheoldred, the Apocalypse",
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
			ScryfallID:    "scry-bolt",
			ArenaID:       0, // non-Arena card
			OracleID:      "def-456",
			Name:          "Lightning Bolt",
			FrontFaceName: "Lightning Bolt",
			ManaCost:      "{R}",
			CMC:           1,
			TypeLine:      "Instant",
			OracleText:    "Lightning Bolt deals 3 damage to any target.",
			Colors:        []string{"R"},
			Rarity:        "common",
			Set:           "STA",
			IsDefault:     true,
		},
	}

	sql := buildCardSQL(cards)

	// Should wipe both tables first.
	if !strings.Contains(sql, "DELETE FROM magic_cards_fts;") {
		t.Error("SQL should wipe magic_cards_fts")
	}
	if !strings.Contains(sql, "DELETE FROM magic_cards;") {
		t.Error("SQL should wipe magic_cards")
	}

	// Should INSERT into magic_cards (not UPSERT — we wipe first).
	if strings.Contains(sql, "ON CONFLICT") {
		t.Error("SQL should not contain ON CONFLICT (wipe-and-replace)")
	}

	// Arena card should have numeric arena_id.
	if !strings.Contains(sql, "87521") {
		t.Error("SQL should contain Sheoldred's arena_id")
	}

	// Non-Arena card should have NULL arena_id.
	// Count NULLs — Lightning Bolt has arena_id=NULL and arena_id_back=NULL.
	if !strings.Contains(sql, "NULL") {
		t.Error("SQL should contain NULL for non-Arena card's arena_id")
	}

	// Should contain card names.
	if !strings.Contains(sql, "Sheoldred, the Apocalypse") {
		t.Error("SQL should contain Sheoldred")
	}
	if !strings.Contains(sql, "Lightning Bolt") {
		t.Error("SQL should contain Lightning Bolt")
	}

	// Both cards are default, so FTS5 INSERTs for both.
	ftsCount := strings.Count(sql, "INSERT INTO magic_cards_fts")
	if ftsCount != 2 {
		t.Errorf("expected 2 FTS5 INSERTs, got %d", ftsCount)
	}

	// FTS5 should use scryfall_id.
	if !strings.Contains(sql, "'scry-sheoldred'") {
		t.Error("FTS5 INSERT should use scryfall_id")
	}

	// JSON arrays for colors.
	if !strings.Contains(sql, `["B"]`) {
		t.Error("SQL should contain JSON array for colors")
	}
}

func TestBuildCardSQL_ProducedMana(t *testing.T) {
	cards := []ScryfallCard{
		{
			ScryfallID:    "scry-sunpetal",
			ArenaID:       1,
			OracleID:      "land-1",
			Name:          "Sunpetal Grove",
			FrontFaceName: "Sunpetal Grove",
			TypeLine:      "Land",
			Rarity:        "rare",
			Set:           "DSK",
			ProducedMana:  []string{"G", "W"},
			IsDefault:     true,
		},
	}

	sql := buildCardSQL(cards)

	if !strings.Contains(sql, `["G","W"]`) {
		t.Error("SQL should contain produced_mana JSON for dual land")
	}
}

func TestBuildCardSQL_NonDefaultSkipsFTS(t *testing.T) {
	cards := []ScryfallCard{
		{
			ScryfallID:    "scry-gftt-bro",
			ArenaID:       100,
			OracleID:      "oracle-1",
			Name:          "Go for the Throat",
			FrontFaceName: "Go for the Throat",
			Rarity:        "uncommon",
			Set:           "BRO",
			IsDefault:     false,
		},
		{
			ScryfallID:    "scry-gftt-fdn",
			ArenaID:       200,
			OracleID:      "oracle-1",
			Name:          "Go for the Throat",
			FrontFaceName: "Go for the Throat",
			Rarity:        "uncommon",
			Set:           "FDN",
			IsDefault:     true,
		},
	}

	sql := buildCardSQL(cards)

	// Both get magic_cards INSERT.
	insertCount := strings.Count(sql, "INSERT INTO magic_cards (")
	if insertCount != 2 {
		t.Errorf("expected 2 magic_cards INSERTs, got %d", insertCount)
	}

	// Only default card gets FTS5 INSERT.
	ftsCount := strings.Count(sql, "INSERT INTO magic_cards_fts")
	if ftsCount != 1 {
		t.Errorf("expected 1 FTS5 INSERT, got %d", ftsCount)
	}
}

func TestBuildCardSQL_EscapesSingleQuotes(t *testing.T) {
	cards := []ScryfallCard{
		{
			ScryfallID:    "scry-frodo",
			ArenaID:       1,
			OracleID:      "a",
			Name:          "Frodo's Ring",
			FrontFaceName: "Frodo's Ring",
			OracleText:    "It's dangerous to go alone.",
			Rarity:        "rare",
			Set:           "LTR",
			IsDefault:     true,
		},
	}

	sql := buildCardSQL(cards)

	if !strings.Contains(sql, "Frodo''s Ring") {
		t.Error("SQL should escape single quotes in card names")
	}
	if !strings.Contains(sql, "It''s dangerous") {
		t.Error("SQL should escape single quotes in oracle text")
	}
}

func TestBuildCardSQL_EmptyCards(t *testing.T) {
	sql := buildCardSQL(nil)

	// Should still have DELETE statements (wipe is unconditional).
	if !strings.Contains(sql, "DELETE FROM magic_cards_fts;") {
		t.Error("SQL should contain DELETE even with empty cards")
	}
	if !strings.Contains(sql, "DELETE FROM magic_cards;") {
		t.Error("SQL should contain DELETE even with empty cards")
	}
	// No INSERT statements.
	if strings.Contains(sql, "INSERT") {
		t.Error("SQL should not contain INSERT with empty cards")
	}
}

func TestBuildCardSQL_DFCBackFaceArenaID(t *testing.T) {
	cards := []ScryfallCard{
		{
			ScryfallID:    "scry-poppet",
			ArenaID:       78407,
			ArenaIDBack:   78408,
			OracleID:      "poppet-oracle",
			Name:          "Poppet Stitcher // Poppet Factory",
			FrontFaceName: "Poppet Stitcher",
			TypeLine:      "Creature — Human Wizard",
			Rarity:        "mythic",
			Set:           "mid",
			IsDefault:     true,
		},
	}

	sql := buildCardSQL(cards)

	// Should contain both arena_id and arena_id_back.
	if !strings.Contains(sql, "78407") {
		t.Error("SQL should contain front-face arena_id")
	}
	if !strings.Contains(sql, "78408") {
		t.Error("SQL should contain back-face arena_id")
	}
}

func TestComputeDefaults(t *testing.T) {
	cards := []ScryfallCard{
		{ScryfallID: "a", ArenaID: 100, OracleID: "oracle-1", Name: "Go for the Throat", Set: "BRO"},
		{ScryfallID: "b", ArenaID: 300, OracleID: "oracle-1", Name: "Go for the Throat", Set: "FDN"},
		{ScryfallID: "c", ArenaID: 200, OracleID: "oracle-1", Name: "Go for the Throat", Set: "DSK"},
		{ScryfallID: "d", ArenaID: 500, OracleID: "oracle-2", Name: "Lightning Bolt", Set: "STA"},
	}

	computeDefaults(cards)

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
