package collectiondiff

import (
	"testing"
)

func TestDiffNoMissing(t *testing.T) {
	target := []DeckEntry{
		{Name: "Sheoldred, the Apocalypse", Count: 4},
	}
	// arena_id 82159 = Sheoldred, the Apocalypse
	collection := []CollectionEntry{
		{ArenaID: 82159, Count: 4},
	}
	result := Diff(target, collection)
	if len(result.Missing) != 0 {
		t.Errorf("expected no missing cards, got %d", len(result.Missing))
	}
	if result.WildcardCost.Total != 0 {
		t.Errorf("expected 0 total wildcards, got %d", result.WildcardCost.Total)
	}
}

func TestDiffPartialOwnership(t *testing.T) {
	target := []DeckEntry{
		{Name: "Sheoldred, the Apocalypse", Count: 4},
	}
	collection := []CollectionEntry{
		{ArenaID: 82159, Count: 1},
	}
	result := Diff(target, collection)
	if len(result.Missing) != 1 {
		t.Fatalf("expected 1 missing entry, got %d", len(result.Missing))
	}
	if result.Missing[0].Count != 3 {
		t.Errorf("expected 3 missing, got %d", result.Missing[0].Count)
	}
	if result.Missing[0].Rarity != "mythic" {
		t.Errorf("expected rarity 'mythic', got %q", result.Missing[0].Rarity)
	}
	if result.WildcardCost.Mythic != 3 {
		t.Errorf("expected 3 mythic wildcards, got %d", result.WildcardCost.Mythic)
	}
	if result.WildcardCost.Total != 3 {
		t.Errorf("expected total 3, got %d", result.WildcardCost.Total)
	}
}

func TestDiffNotOwned(t *testing.T) {
	target := []DeckEntry{
		{Name: "Sheoldred, the Apocalypse", Count: 2},
	}
	result := Diff(target, nil)
	if len(result.Missing) != 1 {
		t.Fatalf("expected 1 missing entry, got %d", len(result.Missing))
	}
	if result.Missing[0].Count != 2 {
		t.Errorf("expected 2 missing, got %d", result.Missing[0].Count)
	}
}

func TestDiffMultipleRarities(t *testing.T) {
	target := []DeckEntry{
		{Name: "Sheoldred, the Apocalypse", Count: 4}, // mythic, arena_id 82159
		{Name: "Sheoldred's Restoration", Count: 4},   // uncommon, arena_id 82160
	}
	collection := []CollectionEntry{
		{ArenaID: 82159, Count: 2},
		{ArenaID: 82160, Count: 1},
	}
	result := Diff(target, collection)
	if result.WildcardCost.Mythic != 2 {
		t.Errorf("expected 2 mythic wildcards, got %d", result.WildcardCost.Mythic)
	}
	if result.WildcardCost.Uncommon != 3 {
		t.Errorf("expected 3 uncommon wildcards, got %d", result.WildcardCost.Uncommon)
	}
	if result.WildcardCost.Total != 5 {
		t.Errorf("expected total 5, got %d", result.WildcardCost.Total)
	}
}

func TestDiffCaseInsensitive(t *testing.T) {
	target := []DeckEntry{
		{Name: "sheoldred, the apocalypse", Count: 1},
	}
	result := Diff(target, nil)
	if len(result.Missing) != 1 {
		t.Fatalf("expected 1 missing entry, got %d", len(result.Missing))
	}
	if result.Missing[0].Rarity != "mythic" {
		t.Errorf("expected rarity 'mythic' from case-insensitive match, got %q", result.Missing[0].Rarity)
	}
}

func TestDiffEmptyTarget(t *testing.T) {
	result := Diff(nil, nil)
	if len(result.Missing) != 0 {
		t.Errorf("expected no missing for empty target, got %d", len(result.Missing))
	}
}
