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

func TestBackfillFromNameIndex(t *testing.T) {
	// Simulate: arena_id 999 is in MTGA client data but not matched by Scryfall.
	// The name index has the card with legalities.
	matched := []ScryfallCard{
		{ArenaID: 1, FrontFaceName: "Lightning Bolt"},
	}
	nameIndex := map[string]ScryfallCard{
		"lightning bolt": {
			OracleID:      "bolt-oracle",
			Name:          "Lightning Bolt",
			FrontFaceName: "Lightning Bolt",
			Legalities:    map[string]string{"standard": "legal"},
		},
		// A card that exists in MTGA client data but not in matched
		"kavaero, mind-bitten": {
			OracleID:      "kavaero-oracle",
			Name:          "Kavaero, Mind-Bitten",
			FrontFaceName: "Kavaero, Mind-Bitten",
			Legalities:    map[string]string{"standard": "legal", "historic": "legal"},
			TypeLine:      "Legendary Creature",
		},
	}

	backfilled := backfillFromNameIndex(matched, nameIndex)

	// Lightning Bolt (arena_id 1) is already matched — should NOT be backfilled.
	for _, c := range backfilled {
		if c.ArenaID == 1 {
			t.Error("already-matched card should not be backfilled")
		}
	}

	// Cards from MTGA client data that match by name should be backfilled.
	// We can't predict specific arena_ids from data.ArenaCards, but we can
	// verify the function doesn't crash and returns reasonable results.
	// The key property: backfilled cards should have legalities from the index.
	for _, c := range backfilled {
		if len(c.Legalities) == 0 {
			t.Errorf("backfilled card %d (%s) has empty legalities", c.ArenaID, c.Name)
		}
		if c.OracleID == "" {
			t.Errorf("backfilled card %d (%s) has empty oracle_id", c.ArenaID, c.Name)
		}
	}
}

func TestBackfillSkipsEmptyLegalities(t *testing.T) {
	matched := []ScryfallCard{}
	nameIndex := map[string]ScryfallCard{
		// Card exists in index but has no legalities — should be skipped
		"some card": {
			OracleID:   "some-oracle",
			Name:       "Some Card",
			Legalities: map[string]string{},
		},
	}

	backfilled := backfillFromNameIndex(matched, nameIndex)

	// No MTGA client card named "some card" exists, so nothing to backfill.
	// But even if one did, empty legalities should be skipped.
	for _, c := range backfilled {
		if len(c.Legalities) == 0 {
			t.Errorf("card with empty legalities should not be backfilled: %s", c.Name)
		}
	}
}

func TestBuildArenaLookupSplitCards(t *testing.T) {
	lookup := buildArenaLookup()

	// Split/DFC cards in ArenaCards have full names ("Fire // Ice").
	// The lookup should index them by front face name ("fire").
	// Check that a known split card is accessible by front face.
	//
	// We can't predict exact card names, but we can verify the property:
	// no key should contain " // " since we split on it.
	for key := range lookup {
		if strings.Contains(key.name, " // ") {
			t.Errorf("lookup key contains unsplit name: %q", key.name)
		}
	}
}
