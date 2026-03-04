package main

import (
	"testing"
)

func TestNPCLookup(t *testing.T) {
	prefs := lookupNPC("Abigail")
	if prefs == nil {
		t.Fatal("expected Abigail preferences, got nil")
	}

	// Abigail loves Amethyst (66), Pufferfish (128), Chocolate Cake (220),
	// Spicy Eel (226), Pumpkin (276), Blackberry Cobbler (611),
	// Banana Pudding (904), Book of Stars (Book_Void)
	loves := prefs["love"].([]any)
	if len(loves) < 8 {
		t.Errorf("expected at least 8 loved items for Abigail, got %d", len(loves))
	}

	// Check that item names are resolved
	found := false
	for _, item := range loves {
		m := item.(map[string]any)
		if m["name"] == "Amethyst" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected Amethyst in Abigail's loves")
	}
}

func TestNPCLookupIncludesUniversal(t *testing.T) {
	prefs := lookupNPC("Abigail")
	if prefs == nil {
		t.Fatal("expected Abigail preferences, got nil")
	}

	// Universal loves include Prismatic Shard (74), Rabbit's Foot (446), etc.
	// These should be shown in the universal section, not mixed into personal
	universal := prefs["universalLove"]
	if universal == nil {
		t.Error("expected universalLove section")
	}
}

func TestNPCLookupUnknown(t *testing.T) {
	prefs := lookupNPC("FakeNPC")
	if prefs != nil {
		t.Error("expected nil for unknown NPC")
	}
}

func TestItemLookup(t *testing.T) {
	results := lookupItem("Diamond")
	if results == nil {
		t.Fatal("expected results for Diamond")
	}

	// Diamond (72) is universally liked.
	// Specific NPCs who love Diamond: Evelyn, Gus, Jodi, Krobus, Maru, Willy
	npcResults := results["npcs"].([]any)

	loveCount := 0
	for _, r := range npcResults {
		m := r.(map[string]any)
		if m["taste"] == "love" {
			loveCount++
		}
	}
	if loveCount < 6 {
		t.Errorf("expected at least 6 NPCs who love Diamond, got %d", loveCount)
	}

	// Should also report universal taste
	uTaste, ok := results["universalTaste"].(string)
	if !ok || uTaste != "like" {
		t.Errorf("expected universal taste 'like' for Diamond, got %q", uTaste)
	}
}

func TestItemLookupByCategory(t *testing.T) {
	// Pumpkin (276) is category -75 (Vegetable).
	// NPCs who love Vegetables category: check that they appear.
	results := lookupItem("Pumpkin")
	if results == nil {
		t.Fatal("expected results for Pumpkin")
	}

	npcResults := results["npcs"].([]any)

	// Abigail loves Pumpkin (276) directly.
	found := false
	for _, r := range npcResults {
		m := r.(map[string]any)
		if m["npc"] == "Abigail" && m["taste"] == "love" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected Abigail to love Pumpkin")
	}
}

func TestItemLookupUnknown(t *testing.T) {
	results := lookupItem("Nonexistent Item XYZ")
	if results != nil {
		t.Error("expected nil for unknown item")
	}
}

func TestAllNPCsHavePrefs(t *testing.T) {
	// Verify all NPCs in npcTastes can be looked up
	for name := range npcTastes {
		prefs := lookupNPC(name)
		if prefs == nil {
			t.Errorf("lookupNPC(%q) returned nil", name)
		}
	}
}

func TestCategoryName(t *testing.T) {
	tests := []struct {
		cat  int
		want string
	}{
		{-75, "Vegetable"},
		{-79, "Fruit"},
		{-80, "Flower"},
		{-4, "Fish"},
		{-2, "Mineral (Gem)"},
		{-7, "Cooking"},
		{-999, ""},
	}
	for _, tt := range tests {
		got := categoryName(tt.cat)
		if got != tt.want {
			t.Errorf("categoryName(%d) = %q, want %q", tt.cat, got, tt.want)
		}
	}
}
