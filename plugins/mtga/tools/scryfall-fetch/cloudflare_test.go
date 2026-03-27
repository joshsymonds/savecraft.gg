package main

import (
	"strings"
	"testing"
)

func TestBuildCardEnrichmentSQL(t *testing.T) {
	cards := []ScryfallCard{
		{
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
			ArenaID:       1,
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

	sql := buildCardEnrichmentSQL(cards)

	// Should delete FTS5 entries per card (not bulk delete).
	if !strings.Contains(sql, "DELETE FROM mtga_cards_fts WHERE arena_id = 87521;") {
		t.Error("SQL should delete FTS5 for Sheoldred's arena_id")
	}
	if !strings.Contains(sql, "DELETE FROM mtga_cards_fts WHERE arena_id = 1;") {
		t.Error("SQL should delete FTS5 for Lightning Bolt's arena_id")
	}

	// Should NOT delete from mtga_cards — mtga-carddb owns that data.
	if strings.Contains(sql, "DELETE FROM mtga_cards;") {
		t.Error("SQL should NOT contain DELETE FROM mtga_cards (mtga-carddb owns base data)")
	}

	// Should contain UPSERT with ON CONFLICT for enrichment.
	if !strings.Contains(sql, "ON CONFLICT(arena_id) DO UPDATE SET") {
		t.Error("SQL should contain ON CONFLICT upsert for enrichment")
	}

	// Should enrich oracle_id, legalities, keywords, oracle_text, produced_mana.
	if !strings.Contains(sql, "oracle_id =") {
		t.Error("ON CONFLICT should update oracle_id")
	}
	if !strings.Contains(sql, "legalities =") {
		t.Error("ON CONFLICT should update legalities")
	}
	if !strings.Contains(sql, "keywords =") {
		t.Error("ON CONFLICT should update keywords")
	}

	// Should contain card names.
	if !strings.Contains(sql, "Sheoldred, the Apocalypse") {
		t.Error("SQL should contain Sheoldred")
	}
	if !strings.Contains(sql, "Lightning Bolt") {
		t.Error("SQL should contain Lightning Bolt")
	}

	// Both cards are default, so FTS5 INSERTs for both.
	ftsCount := strings.Count(sql, "INSERT INTO mtga_cards_fts")
	if ftsCount != 2 {
		t.Errorf("expected 2 FTS5 INSERTs, got %d", ftsCount)
	}

	// JSON arrays for colors.
	if !strings.Contains(sql, `["B"]`) {
		t.Error("SQL should contain JSON array for colors")
	}
}

func TestBuildCardEnrichmentSQL_ProducedMana(t *testing.T) {
	cards := []ScryfallCard{
		{
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

	sql := buildCardEnrichmentSQL(cards)

	if !strings.Contains(sql, `["G","W"]`) {
		t.Error("SQL should contain produced_mana JSON for dual land")
	}
}

func TestBuildCardEnrichmentSQL_NonDefaultSkipsFTS(t *testing.T) {
	cards := []ScryfallCard{
		{
			ArenaID:       100,
			OracleID:      "oracle-1",
			Name:          "Go for the Throat",
			FrontFaceName: "Go for the Throat",
			Rarity:        "uncommon",
			Set:           "BRO",
			IsDefault:     false,
		},
		{
			ArenaID:       200,
			OracleID:      "oracle-1",
			Name:          "Go for the Throat",
			FrontFaceName: "Go for the Throat",
			Rarity:        "uncommon",
			Set:           "FDN",
			IsDefault:     true,
		},
	}

	sql := buildCardEnrichmentSQL(cards)

	// Both get mtga_cards UPSERT.
	upsertCount := strings.Count(sql, "INSERT INTO mtga_cards (")
	if upsertCount != 2 {
		t.Errorf("expected 2 mtga_cards UPSERTs, got %d", upsertCount)
	}

	// Only default card gets FTS5 INSERT.
	ftsCount := strings.Count(sql, "INSERT INTO mtga_cards_fts")
	if ftsCount != 1 {
		t.Errorf("expected 1 FTS5 INSERT, got %d", ftsCount)
	}
}

func TestBuildCardEnrichmentSQL_EscapesSingleQuotes(t *testing.T) {
	cards := []ScryfallCard{
		{
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

	sql := buildCardEnrichmentSQL(cards)

	if !strings.Contains(sql, "Frodo''s Ring") {
		t.Error("SQL should escape single quotes in card names")
	}
	if !strings.Contains(sql, "It''s dangerous") {
		t.Error("SQL should escape single quotes in oracle text")
	}
}

func TestBuildCardEnrichmentSQL_EmptyCards(t *testing.T) {
	sql := buildCardEnrichmentSQL(nil)

	// No DELETE, no INSERT — empty input produces empty SQL.
	if strings.Contains(sql, "DELETE") {
		t.Error("SQL should not contain DELETE with empty cards")
	}
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
