package dropcalc

import (
	"strings"
	"testing"
)

func TestSearchCannotBeFrozen(t *testing.T) {
	c := NewCalculator()
	results := c.SearchItems("Cannot Be Frozen")
	if len(results) == 0 {
		t.Fatal("expected items with Cannot Be Frozen (nofreeze)")
	}
	// Raven Frost should be in the results.
	found := false
	for _, r := range results {
		if r.Name == "Raven Frost" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected Raven Frost in Cannot Be Frozen results")
	}
}

func TestSearchLifeStealRing(t *testing.T) {
	c := NewCalculator()
	results := c.SearchItems("life steal ring")
	if len(results) == 0 {
		t.Fatal("expected rings with life steal")
	}
	// All results should be rings (base code "rin").
	for _, r := range results {
		if r.BaseCode != "rin" {
			t.Errorf("expected ring base code, got %q for %s", r.BaseCode, r.Name)
		}
	}
	// All should have lifesteal stat.
	for _, r := range results {
		hasLifeSteal := false
		for _, s := range r.Stats {
			if s.Property == "lifesteal" {
				hasLifeSteal = true
				break
			}
		}
		if !hasLifeSteal {
			t.Errorf("expected lifesteal stat on %s", r.Name)
		}
	}
}

func TestSearchByItemName(t *testing.T) {
	c := NewCalculator()
	results := c.SearchItems("Harlequin")
	if len(results) == 0 {
		t.Fatal("expected results for 'Harlequin'")
	}
	found := false
	for _, r := range results {
		if strings.Contains(r.Name, "Harlequin") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected an item with 'Harlequin' in the name")
	}
}

func TestSearchBySetName(t *testing.T) {
	c := NewCalculator()
	results := c.SearchItems("Tal Rasha")
	if len(results) == 0 {
		t.Fatal("expected results for Tal Rasha set")
	}
	for _, r := range results {
		if !r.IsSet {
			t.Errorf("expected set item, got unique: %s", r.Name)
		}
	}
}

func TestSearchNoResults(t *testing.T) {
	c := NewCalculator()
	results := c.SearchItems("xyznonexistent123")
	if len(results) != 0 {
		t.Errorf("expected no results, got %d", len(results))
	}
}

func TestSearchResultsPopulated(t *testing.T) {
	c := NewCalculator()
	results := c.SearchItems("Raven")
	if len(results) == 0 {
		t.Fatal("expected results for 'Raven'")
	}
	for _, r := range results {
		if r.Name == "" {
			t.Error("expected non-empty name")
		}
		if r.BaseCode == "" {
			t.Error("expected non-empty base code")
		}
		if r.BaseName == "" {
			t.Error("expected non-empty base name")
		}
	}
}

func TestSearchColdAbsorbOR(t *testing.T) {
	c := NewCalculator()
	// "cold absorb" maps to {"abs-cold%", "abs-cold"} — should match items with EITHER.
	results := c.SearchItems("cold absorb")
	if len(results) == 0 {
		t.Fatal("expected items with cold absorb")
	}
	for _, r := range results {
		hasAbsorb := false
		for _, s := range r.Stats {
			if s.Property == "abs-cold%" || s.Property == "abs-cold" {
				hasAbsorb = true
				break
			}
		}
		if !hasAbsorb {
			t.Errorf("expected cold absorb stat on %s", r.Name)
		}
	}
}
