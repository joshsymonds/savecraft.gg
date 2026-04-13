package main

import (
	"os"
	"path/filepath"
	"testing"
)

func loadFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return data
}

func TestParseCommanderPage(t *testing.T) {
	data := loadFixture(t, "atraxa_commander.json")
	pc, err := ParseCommanderPage(data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if pc.Name != "Atraxa, Praetors' Voice" {
		t.Errorf("Name = %q", pc.Name)
	}
	if pc.Slug != "atraxa-praetors-voice" {
		t.Errorf("Slug = %q", pc.Slug)
	}
	if pc.ScryfallID != "d0d33d52-3d28-4635-b985-51e126289259" {
		t.Errorf("ScryfallID = %q", pc.ScryfallID)
	}
	if len(pc.ColorIdentity) != 4 {
		t.Errorf("ColorIdentity = %v, want 4 colors", pc.ColorIdentity)
	}
	if pc.DeckCount == 0 {
		t.Errorf("DeckCount should be non-zero")
	}
	if pc.Rank == 0 {
		t.Errorf("Rank should be set")
	}

	// Themes — Atraxa has 182 tag links
	if len(pc.Themes) < 100 {
		t.Errorf("Themes = %d, want >=100", len(pc.Themes))
	}
	foundInfect := false
	for _, th := range pc.Themes {
		if th.Slug == "infect" {
			foundInfect = true
			if th.Count == 0 {
				t.Errorf("infect theme count should be non-zero")
			}
		}
	}
	if !foundInfect {
		t.Errorf("expected infect theme")
	}

	// Similar commanders
	if len(pc.Similar) == 0 {
		t.Errorf("Similar should be non-empty")
	}

	// Mana curve
	if len(pc.Curve) == 0 {
		t.Errorf("Curve should be non-empty")
	}

	// Recommendations — should have entries across multiple categories
	if len(pc.Recs) < 50 {
		t.Errorf("Recs = %d, want >=50", len(pc.Recs))
	}
	categorySet := make(map[string]bool)
	for _, r := range pc.Recs {
		categorySet[r.Category] = true
	}
	for _, want := range []string{"highsynergycards", "topcards", "creatures", "lands"} {
		if !categorySet[want] {
			t.Errorf("missing category %q", want)
		}
	}

	// Spot-check: no categories we explicitly drop (like "piechart" or similar UI things)
	for _, r := range pc.Recs {
		if !keptCategories[r.Category] {
			t.Errorf("unexpected category %q leaked through", r.Category)
		}
	}
}

func TestParseCombosPage(t *testing.T) {
	data := loadFixture(t, "atraxa_combos.json")
	combos, err := ParseCombosPage(data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(combos) == 0 {
		t.Fatalf("no combos parsed")
	}
	if len(combos) < 50 {
		t.Errorf("combos = %d, want >=50", len(combos))
	}

	c := combos[0]
	if c.ComboID == "" {
		t.Errorf("ComboID empty")
	}
	if len(c.CardNames) == 0 {
		t.Errorf("CardNames empty")
	}
	if len(c.CardIDs) == 0 {
		t.Errorf("CardIDs empty")
	}
	if c.Colors == "" {
		t.Errorf("Colors empty")
	}
	if c.DeckCount == 0 {
		t.Errorf("DeckCount should be non-zero")
	}
}

func TestParseAverageDecksPage(t *testing.T) {
	data := loadFixture(t, "atraxa_average.json")
	entries, err := ParseAverageDecksPage(data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(entries) < 80 {
		t.Errorf("entries = %d, want >=80 (typical Commander deck ~91)", len(entries))
	}

	// First entry should be Atraxa herself
	if entries[0].CardName != "Atraxa, Praetors' Voice" {
		t.Errorf("first entry = %q", entries[0].CardName)
	}
	if entries[0].Quantity != 1 {
		t.Errorf("first entry quantity = %d", entries[0].Quantity)
	}

	// Some basics should have Quantity > 1
	foundMulti := false
	for _, e := range entries {
		if e.Quantity > 1 {
			foundMulti = true
			break
		}
	}
	if !foundMulti {
		t.Errorf("expected at least one multi-copy entry (basics)")
	}

	// Categories should be populated for at least most entries
	withCat := 0
	for _, e := range entries {
		if e.Category != "" {
			withCat++
		}
	}
	if withCat < len(entries)/2 {
		t.Errorf("only %d/%d entries have categories", withCat, len(entries))
	}
}
