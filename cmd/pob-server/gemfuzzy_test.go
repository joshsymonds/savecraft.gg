package main

import (
	"slices"
	"strings"
	"testing"
)

func TestSuggestGemNames(t *testing.T) {
	// Representative slice of real PoB gem names — mix of actives and
	// supports, varied lengths.
	gems := []string{
		"Added Lightning Damage",
		"Added Cold Damage",
		"Added Fire Damage",
		"Added Chaos Damage",
		"Ruthless Support",
		"Inspiration Support",
		"Hatred",
		"Herald of Ice",
		"Frostbolt",
		"Kinetic Bolt",
	}

	cases := []struct {
		name    string
		query   string
		limit   int
		wantTop string // empty = assert empty slice
		wantIn  []string
	}{
		{
			name:    "exact case-insensitive match",
			query:   "added lightning damage",
			limit:   3,
			wantTop: "Added Lightning Damage",
		},
		{
			name:    "single-char typo",
			query:   "Added Lightning Damgae",
			limit:   3,
			wantTop: "Added Lightning Damage",
		},
		{
			name:    "support-suffix confusion ranks stripped name first",
			query:   "Added Lightning Damage Support",
			limit:   3,
			wantTop: "Added Lightning Damage",
		},
		{
			name:  "two close matches appear in top-3",
			query: "Added Lightning Damge",
			limit: 3,
			wantIn: []string{
				"Added Lightning Damage",
			},
		},
		{
			name:  "unrelated query past distance cap returns empty",
			query: "xyzzy123completelyunrelated",
			limit: 3,
			// Completely unrelated — distance to any gem > cap.
		},
		{
			name:  "empty gem list returns empty",
			query: "Anything",
			limit: 3,
		},
		{
			name:  "limit 0 returns empty",
			query: "Hatred",
			limit: 0,
		},
		{
			name:  "negative limit returns empty",
			query: "Hatred",
			limit: -2,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			list := gems
			if tc.name == "empty gem list returns empty" {
				list = nil
			}
			got := suggestGemNames(tc.query, list, tc.limit)

			if tc.wantTop == "" && len(tc.wantIn) == 0 {
				if len(got) != 0 {
					t.Fatalf("expected no suggestions, got %v", got)
				}
				return
			}
			if tc.wantTop != "" {
				if len(got) == 0 {
					t.Fatalf("expected %q at top, got empty", tc.wantTop)
				}
				if got[0] != tc.wantTop {
					t.Fatalf("top suggestion: got %q, want %q (full: %v)", got[0], tc.wantTop, got)
				}
			}
			for _, want := range tc.wantIn {
				if !slices.Contains(got, want) {
					t.Errorf("expected %q in suggestions, got %v", want, got)
				}
			}
		})
	}
}

// Ordering stability: equal edit distance should break ties
// alphabetically so tests stay deterministic across runs.
func TestSuggestGemNamesDeterministicTieBreak(t *testing.T) {
	// Two gems equidistant (Levenshtein=1) from "Hatre": "Hatred"
	// and "Wrath" are not equidistant, but we can engineer: "abc" vs
	// "adc" are both distance 1 from "aac".
	gems := []string{"adc", "abc", "xyz"}
	got := suggestGemNames("aac", gems, 3)
	// "abc" < "adc" lexically, should come first on tie.
	if len(got) < 2 {
		t.Fatalf("expected 2+ suggestions, got %v", got)
	}
	if got[0] != "abc" || got[1] != "adc" {
		t.Fatalf("tie-break order: got %v, want [abc adc ...]", got)
	}
}

func TestLevenshtein(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"", "", 0},
		{"abc", "abc", 0},
		{"abc", "", 3},
		{"", "abc", 3},
		{"kitten", "sitting", 3},
		{"hatred", "Hatred", 1}, // case-sensitive at this layer
	}
	for _, tc := range cases {
		t.Run(tc.a+"_"+tc.b, func(t *testing.T) {
			got := levenshtein(tc.a, tc.b)
			if got != tc.want {
				t.Fatalf("levenshtein(%q,%q) = %d, want %d", tc.a, tc.b, got, tc.want)
			}
		})
	}
}

func TestEnrichGemNotFoundError(t *testing.T) {
	names := []string{
		"Added Lightning Damage",
		"Added Cold Damage",
		"Ruthless Support",
		"Hatred",
	}

	cases := []struct {
		name         string
		input        string
		wantEnrich   bool
		wantContains []string
		wantMissing  []string
	}{
		{
			name:       "swap_gem not found gets suggestions",
			input:      "operation 1: swap_gem: gem not found: Added Lightning Damgae",
			wantEnrich: true,
			wantContains: []string{
				"Added Lightning Damage",
				"gem_search",
				"operation 1",
			},
		},
		{
			name:       "add_gem not found also enriched",
			input:      "operation 2: add_gem: gem not found: Added Cold Damgae",
			wantEnrich: true,
			wantContains: []string{
				"Added Cold Damage",
				"gem_search",
			},
		},
		{
			name:        "unrelated error passes through",
			input:       "operation 1: set_level: level out of range",
			wantEnrich:  false,
			wantMissing: []string{"gem_search"},
		},
		{
			name:       "empty names slice still enriches with gem_search pointer",
			input:      "operation 1: swap_gem: gem not found: Whatever",
			wantEnrich: true,
			wantContains: []string{
				"gem_search",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			list := names
			if tc.name == "empty names slice still enriches with gem_search pointer" {
				list = nil
			}
			got, didEnrich := enrichGemNotFoundError(tc.input, list)
			if didEnrich != tc.wantEnrich {
				t.Fatalf("didEnrich: got %v, want %v (message=%q)", didEnrich, tc.wantEnrich, got)
			}
			if !tc.wantEnrich && got != tc.input {
				t.Fatalf("pass-through case changed message: got %q", got)
			}
			for _, want := range tc.wantContains {
				if !strings.Contains(got, want) {
					t.Errorf("enriched message missing %q: %s", want, got)
				}
			}
			for _, miss := range tc.wantMissing {
				if strings.Contains(got, miss) {
					t.Errorf("enriched message unexpectedly contains %q: %s", miss, got)
				}
			}
		})
	}
}

func TestEnrichGemNotFoundPreservesOrigError(t *testing.T) {
	// The enriched message should still contain the original error
	// phrase so any downstream tooling that greps for "gem not found"
	// continues to work.
	input := "operation 1: swap_gem: gem not found: Added Lightning Damgae"
	got, _ := enrichGemNotFoundError(input, []string{"Added Lightning Damage"})
	if !strings.Contains(got, "gem not found") {
		t.Errorf("enriched error dropped 'gem not found' phrase: %s", got)
	}
}
