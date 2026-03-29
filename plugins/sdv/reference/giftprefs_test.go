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

func TestTasteResolutionPriority(t *testing.T) {
	// The game resolves taste conflicts with priority: love > hate > like > dislike > neutral.
	// Jodi has item 18 (Daffodil) in both Like and Hate lists.
	// Hate takes priority over Like, so Jodi should HATE Daffodil.
	results := lookupItem("Daffodil")
	if results == nil {
		t.Fatal("expected results for Daffodil")
	}
	npcs := results["npcs"].([]any)
	for _, r := range npcs {
		m := r.(map[string]any)
		if m["npc"] == "Jodi" {
			if m["taste"] != "hate" {
				t.Errorf("Jodi's taste for Daffodil = %q, want %q (hate > like in priority)", m["taste"], "hate")
			}
			return
		}
	}
	t.Error("Jodi not found in Daffodil results")
}

func TestTasteResolutionDirectItemOverridesCategory(t *testing.T) {
	// Elliott has -79 (Fruit) in Like, but Salmonberry (296) directly in Hate.
	// Direct item match in Hate trumps category match in Like.
	results := lookupItem("Salmonberry")
	if results == nil {
		t.Fatal("expected results for Salmonberry")
	}
	npcs := results["npcs"].([]any)
	for _, r := range npcs {
		m := r.(map[string]any)
		if m["npc"] == "Elliott" {
			if m["taste"] != "hate" {
				t.Errorf("Elliott's taste for Salmonberry = %q, want %q (direct item hate > category like)", m["taste"], "hate")
			}
			return
		}
	}
	t.Error("Elliott not found in Salmonberry results")
}

func TestTasteResolutionCategoryConflict(t *testing.T) {
	// Elliott has -79 (Fruit) in both Like and Dislike lists.
	// Like takes priority over Dislike, so Elliott should LIKE Apple (a fruit not in any specific list).
	results := lookupItem("Apple")
	if results == nil {
		t.Fatal("expected results for Apple")
	}
	npcs := results["npcs"].([]any)
	for _, r := range npcs {
		m := r.(map[string]any)
		if m["npc"] == "Elliott" {
			if m["taste"] != "like" {
				t.Errorf("Elliott's taste for Apple = %q, want %q (like > dislike in priority)", m["taste"], "like")
			}
			return
		}
	}
	t.Error("Elliott not found in Apple results")
}

// Tests for structured output (view-compatible structuredContent).

func TestNPCQueryResultHasStructuredFields(t *testing.T) {
	result := npcQueryResult("Abigail")
	if result == nil {
		t.Fatal("expected result for Abigail")
	}

	// Must have formatted text
	if _, ok := result["formatted"].(string); !ok {
		t.Error("missing formatted field")
	}

	// Must have structured fields for view rendering
	if result["npc"] != "Abigail" {
		t.Errorf("npc = %v, want Abigail", result["npc"])
	}

	// Taste tier arrays must be present
	loves := result["love"].([]any)
	if len(loves) < 8 {
		t.Errorf("expected at least 8 loved items, got %d", len(loves))
	}

	// Universal tiers must be present
	for _, key := range []string{"universalLove", "universalLike", "universalNeutral", "universalDislike", "universalHate"} {
		if result[key] == nil {
			t.Errorf("missing %s", key)
		}
	}
}

func TestItemQueryResultHasStructuredFields(t *testing.T) {
	result := itemQueryResult("Diamond")
	if result == nil {
		t.Fatal("expected result for Diamond")
	}

	// Must have formatted text
	if _, ok := result["formatted"].(string); !ok {
		t.Error("missing formatted field")
	}

	// Must have structured fields for view rendering
	if result["item"] != "Diamond" {
		t.Errorf("item = %v, want Diamond", result["item"])
	}

	npcs := result["npcs"].([]any)
	if len(npcs) == 0 {
		t.Error("expected npcs in result")
	}

	uTaste, ok := result["universalTaste"].(string)
	if !ok || uTaste != "like" {
		t.Errorf("universalTaste = %v, want like", uTaste)
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
