package dropcalc

import "testing"

func TestLevenshtein(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{"", "", 0},
		{"abc", "", 3},
		{"", "abc", 3},
		{"abc", "abc", 0},
		{"abc", "abd", 1},
		{"kitten", "sitting", 3},
		{"saturday", "sunday", 3},
		{"ravenfrost", "ravenfrost", 0},
		{"magefis", "magefist", 1},
	}
	for _, tt := range tests {
		got := levenshtein(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("levenshtein(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestNormalize(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Raven Frost", "ravenfrost"},
		{"Tal Rasha's", "talrashas"},
		{"Que-Hegan's Wisdom", "queheganswisdom"},
		{"SHAKO", "shako"},
		{"skin of the vipermagi", "skinofthevipermagi"},
		{"", ""},
	}
	for _, tt := range tests {
		got := normalize(tt.input)
		if got != tt.want {
			t.Errorf("normalize(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestResolveItemFuzzyExact(t *testing.T) {
	c := NewCalculator()

	// Exact match by unique name.
	r := c.ResolveItemFuzzy("Raven Frost")
	if r.Code == "" {
		t.Fatal("expected Raven Frost to resolve")
	}
	if r.Corrected != "" {
		t.Errorf("exact match should not set Corrected, got %q", r.Corrected)
	}
	if r.ResolveType != ResolveUnique {
		t.Errorf("expected ResolveUnique, got %d", r.ResolveType)
	}
}

func TestResolveItemFuzzyCaseInsensitive(t *testing.T) {
	c := NewCalculator()

	// Case-insensitive: "shako" should resolve to "Shako".
	r := c.ResolveItemFuzzy("shako")
	if r.Code == "" {
		t.Fatal("expected shako to resolve case-insensitively")
	}
	if r.Corrected != "Shako" {
		t.Errorf("expected Corrected=%q, got %q", "Shako", r.Corrected)
	}
}

func TestResolveItemFuzzyNormalized(t *testing.T) {
	c := NewCalculator()

	// "Ravenfrost" (no space) should normalize-match "Raven Frost".
	r := c.ResolveItemFuzzy("Ravenfrost")
	if r.Code == "" {
		t.Fatal("expected Ravenfrost to normalize-resolve to Raven Frost")
	}
	if r.Corrected != "Raven Frost" {
		t.Errorf("expected Corrected=%q, got %q", "Raven Frost", r.Corrected)
	}
	if r.ResolveType != ResolveUnique {
		t.Errorf("expected ResolveUnique, got %d", r.ResolveType)
	}
}

func TestResolveItemFuzzyLevenshtein(t *testing.T) {
	c := NewCalculator()

	// "Magefis" is 1 edit from "Magefist" (after normalization: "magefis" vs "magefist").
	r := c.ResolveItemFuzzy("Magefis")
	if r.Code == "" {
		t.Fatal("expected Magefis to auto-resolve to Magefist")
	}
	if r.Corrected != "Magefist" {
		t.Errorf("expected Corrected=%q, got %q", "Magefist", r.Corrected)
	}
}

func TestResolveItemFuzzyGarbage(t *testing.T) {
	c := NewCalculator()

	// Total garbage should return nothing.
	r := c.ResolveItemFuzzy("xyzgarbage123")
	if r.Code != "" {
		t.Errorf("expected empty code for garbage input, got %q", r.Code)
	}
	if len(r.Suggestions) != 0 {
		t.Errorf("expected no suggestions for garbage, got %v", r.Suggestions)
	}
}

func TestResolveItemFuzzySuggestions(t *testing.T) {
	c := NewCalculator()

	// Use an input with normalized distance 3-5 from known items so it produces
	// suggestions but does NOT auto-resolve (auto-resolve threshold is ≤2).
	// "Mageplaster" → "mageplaster" vs "magefist" → "magefist" = distance 6 (too far).
	// "Magefast" → "magefast" vs "magefist" = distance 2 (would auto-resolve).
	// "Mageblaster" → "mageblaster" vs "magefist" = distance 5 (suggestions).
	r := c.ResolveItemFuzzy("Mageblaster")
	if r.Code != "" {
		t.Errorf("expected no auto-resolve for 'Mageblaster', got code %q", r.Code)
	}
	if len(r.Suggestions) == 0 {
		t.Error("expected suggestions for 'Mageblaster'")
	}
}

func TestResolveItemFuzzyBaseItemCode(t *testing.T) {
	c := NewCalculator()

	// Direct code should still work as exact match.
	r := c.ResolveItemFuzzy("rin")
	if r.Code != "rin" {
		t.Errorf("expected code 'rin', got %q", r.Code)
	}
	if r.Corrected != "" {
		t.Errorf("exact code match should not set Corrected, got %q", r.Corrected)
	}
}
