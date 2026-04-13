package main

import (
	"strings"
	"testing"
)

func TestBuildArenaLookup(t *testing.T) {
	lookup := buildArenaLookup()

	if len(lookup) == 0 {
		t.Fatal("buildArenaLookup returned empty map")
	}

	// All keys should be lowercase.
	for key := range lookup {
		if key.name != strings.ToLower(key.name) {
			t.Errorf("name not lowercase: %q", key.name)
		}
		if key.set != strings.ToLower(key.set) {
			t.Errorf("set not lowercase: %q", key.set)
		}
	}

	// All arena_ids should be positive.
	for key, id := range lookup {
		if id <= 0 {
			t.Errorf("non-positive arena_id %d for %v", id, key)
		}
	}

	// Spot-check: Adamant Will from FDN should be present.
	if _, ok := lookup[arenaKey{"adamant will", "fdn"}]; !ok {
		t.Error("expected 'adamant will' in fdn")
	}
}

func TestBackfillArenaOnly(t *testing.T) {
	// backfillArenaOnly finds MTGA client cards not in Scryfall at all.
	// Cards with a name match in the nameIndex should NOT be backfilled
	// (they're already in Scryfall under a different printing).
	cards := []ScryfallCard{
		{ScryfallID: "abc-123", ArenaID: 1, FrontFaceName: "Lightning Bolt"},
	}
	nameIndex := map[string]ScryfallCard{
		"lightning bolt": {
			ScryfallID:    "abc-123",
			OracleID:      "bolt-oracle",
			Name:          "Lightning Bolt",
			FrontFaceName: "Lightning Bolt",
			Legalities:    map[string]string{"standard": "legal"},
		},
	}

	backfilled := backfillArenaOnly(cards, nameIndex)

	// Lightning Bolt (arena_id 1) is already matched — should NOT be backfilled.
	for _, c := range backfilled {
		if c.ArenaID == 1 {
			t.Error("already-matched card should not be backfilled")
		}
	}

	// Backfilled cards should have synthetic scryfall_ids.
	for _, c := range backfilled {
		if !strings.HasPrefix(c.ScryfallID, "arena-") {
			t.Errorf("backfilled card %d (%s) should have synthetic scryfall_id, got %q", c.ArenaID, c.Name, c.ScryfallID)
		}
		if c.ArenaID <= 0 {
			t.Errorf("backfilled card should have positive arena_id, got %d", c.ArenaID)
		}
	}
}

func TestBackfillArenaOnlySkipsNameMatches(t *testing.T) {
	// If the nameIndex has a Scryfall entry for the card name, the card
	// exists in Scryfall (just wasn't matched by arena_id) — skip it.
	cards := []ScryfallCard{}
	nameIndex := map[string]ScryfallCard{
		"kavaero, mind-bitten": {
			ScryfallID: "real-scryfall-id",
			OracleID:   "spider-oracle",
			Name:       "Superior Spider-Man",
			Legalities: map[string]string{"standard": "legal"},
		},
	}

	backfilled := backfillArenaOnly(cards, nameIndex)

	// Kavaero should NOT be backfilled because it exists in Scryfall
	// (under its canonical name via the nameIndex).
	for _, c := range backfilled {
		if strings.Contains(strings.ToLower(c.Name), "kavaero") {
			t.Error("card with Scryfall name match should not be backfilled as Arena-only")
		}
	}
}

func TestMergeBackFaceArenaIDs(t *testing.T) {
	// Poppet Stitcher (78407) // Poppet Factory (78408) is a known DFC in MID.
	// ArenaCards has 78408 as the back face. mergeBackFaceArenaIDs should
	// store 78408 as ArenaIDBack on the front face's row.
	cards := []ScryfallCard{
		{
			ScryfallID:    "abc-123",
			ArenaID:       78407,
			Name:          "Poppet Stitcher // Poppet Factory",
			FrontFaceName: "Poppet Stitcher",
			Set:           "mid",
		},
	}

	mergeBackFaceArenaIDs(cards)

	if cards[0].ScryfallID != "abc-123" {
		t.Error("mergeBackFaceArenaIDs should not modify scryfall_id")
	}
	if cards[0].ArenaID != 78407 {
		t.Error("mergeBackFaceArenaIDs should not modify front-face arena_id")
	}
	if cards[0].ArenaIDBack != 78408 {
		t.Errorf("expected ArenaIDBack=78408 (Poppet Factory), got %d", cards[0].ArenaIDBack)
	}
}

func TestComputeDefaultsPrefersArena(t *testing.T) {
	cards := []ScryfallCard{
		{ScryfallID: "paper-1", ArenaID: 0, OracleID: "bolt-oracle", Name: "Lightning Bolt"},
		{ScryfallID: "arena-1", ArenaID: 12345, OracleID: "bolt-oracle", Name: "Lightning Bolt"},
		{ScryfallID: "paper-2", ArenaID: 0, OracleID: "bolt-oracle", Name: "Lightning Bolt"},
	}

	computeDefaults(cards)

	for i, c := range cards {
		if c.ScryfallID == "arena-1" && !c.IsDefault {
			t.Errorf("card[%d] Arena printing should be default", i)
		}
		if c.ScryfallID != "arena-1" && c.IsDefault {
			t.Errorf("card[%d] non-Arena printing should not be default", i)
		}
	}
}

func TestComputeDefaultsNonArenaFallback(t *testing.T) {
	// When no Arena printing exists, one non-Arena printing should be default.
	cards := []ScryfallCard{
		{ScryfallID: "paper-1", ArenaID: 0, OracleID: "force-oracle", Name: "Force of Will"},
		{ScryfallID: "paper-2", ArenaID: 0, OracleID: "force-oracle", Name: "Force of Will"},
	}

	computeDefaults(cards)

	defaultCount := 0
	for _, c := range cards {
		if c.IsDefault {
			defaultCount++
		}
	}
	if defaultCount != 1 {
		t.Errorf("expected exactly 1 default, got %d", defaultCount)
	}
}

func TestBuildArenaLookupSplitCards(t *testing.T) {
	lookup := buildArenaLookup()

	// Split/DFC cards in ArenaCards have full names ("Fire // Ice").
	// The lookup should index them by front face name ("fire").
	// No key should contain " // " since we split on it.
	for key := range lookup {
		if strings.Contains(key.name, " // ") {
			t.Errorf("lookup key contains unsplit name: %q", key.name)
		}
	}
}
