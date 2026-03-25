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
