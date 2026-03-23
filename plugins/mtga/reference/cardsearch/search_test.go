package cardsearch

import (
	"strings"
	"testing"
)

func TestSearchByName(t *testing.T) {
	results := Search(Query{Name: "Sheoldred, the Apocalypse"})
	if len(results) != 1 {
		t.Fatalf("expected 1 result for exact name, got %d", len(results))
	}
	if results[0].Name != "Sheoldred, the Apocalypse" {
		t.Errorf("expected 'Sheoldred, the Apocalypse', got %q", results[0].Name)
	}
	if results[0].ManaCost != "{2}{B}{B}" {
		t.Errorf("expected mana cost '{2}{B}{B}', got %q", results[0].ManaCost)
	}
}

func TestSearchByNameCaseInsensitive(t *testing.T) {
	results := Search(Query{Name: "sheoldred"})
	found := false
	for _, r := range results {
		if r.Name == "Sheoldred, the Apocalypse" {
			found = true
		}
	}
	if !found {
		t.Error("expected to find Sheoldred with case-insensitive search")
	}
}

func TestSearchByType(t *testing.T) {
	results := Search(Query{Type: "legendary creature", Limit: 5})
	if len(results) == 0 {
		t.Fatal("expected results for 'legendary creature' type search")
	}
	for _, r := range results {
		if r.TypeLine == "" {
			t.Error("expected non-empty type line")
		}
	}
}

func TestSearchByFormat(t *testing.T) {
	results := Search(Query{Format: "standard", Limit: 5})
	if len(results) == 0 {
		t.Fatal("expected results for standard-legal cards")
	}
	for _, r := range results {
		legality, ok := r.Legalities["standard"]
		if !ok || legality != "legal" {
			t.Errorf("card %q is not standard legal: %v", r.Name, r.Legalities["standard"])
		}
	}
}

func TestSearchByCMC(t *testing.T) {
	cmc := 1
	results := Search(Query{CMC: &cmc, Format: "standard", Limit: 5})
	if len(results) == 0 {
		t.Fatal("expected results for CMC=1 standard cards")
	}
	for _, r := range results {
		if r.CMC != 1.0 {
			t.Errorf("expected CMC 1.0, got %.1f for %q", r.CMC, r.Name)
		}
	}
}

func TestSearchByCMCLessThanOrEqual(t *testing.T) {
	cmc := 2
	results := Search(Query{CMC: &cmc, CMCOp: "<=", Limit: 5})
	if len(results) == 0 {
		t.Fatal("expected results for CMC<=2")
	}
	for _, r := range results {
		if r.CMC > 2.0 {
			t.Errorf("expected CMC <= 2.0, got %.1f for %q", r.CMC, r.Name)
		}
	}
}

func TestSearchByRarity(t *testing.T) {
	results := Search(Query{Rarity: "mythic", Limit: 5})
	if len(results) == 0 {
		t.Fatal("expected results for mythic rarity")
	}
	for _, r := range results {
		if r.Rarity != "mythic" {
			t.Errorf("expected rarity 'mythic', got %q for %q", r.Rarity, r.Name)
		}
	}
}

func TestSearchByColors(t *testing.T) {
	results := Search(Query{Colors: "B", Type: "creature", Limit: 5})
	if len(results) == 0 {
		t.Fatal("expected results for black creatures")
	}
	for _, r := range results {
		hasBlack := false
		for _, c := range r.ColorIdentity {
			if c == "B" {
				hasBlack = true
			}
		}
		if !hasBlack {
			t.Errorf("card %q doesn't have black in color identity: %v", r.Name, r.ColorIdentity)
		}
	}
}

func TestSearchByOracleText(t *testing.T) {
	results := Search(Query{Text: "deathtouch", Limit: 5})
	if len(results) == 0 {
		t.Fatal("expected results for oracle text 'deathtouch'")
	}
	for _, r := range results {
		if !strings.Contains(strings.ToLower(r.OracleText), "deathtouch") {
			t.Errorf("card %q oracle text doesn't contain 'deathtouch': %q", r.Name, r.OracleText)
		}
	}
}

func TestSearchLimit(t *testing.T) {
	results := Search(Query{Type: "creature", Limit: 3})
	if len(results) > 3 {
		t.Errorf("expected at most 3 results, got %d", len(results))
	}
}

func TestSearchDefaultLimit(t *testing.T) {
	results := Search(Query{Type: "creature"})
	if len(results) > 20 {
		t.Errorf("expected default limit of 20, got %d results", len(results))
	}
}

func TestSearchNoResults(t *testing.T) {
	results := Search(Query{Name: "xyznonexistentcard"})
	if len(results) != 0 {
		t.Errorf("expected 0 results for nonexistent card, got %d", len(results))
	}
}

func TestSearchSortByCMC(t *testing.T) {
	results := Search(Query{Type: "creature", Sort: "cmc", Limit: 10})
	if len(results) < 2 {
		t.Skip("not enough results to test sorting")
	}
	for i := 1; i < len(results); i++ {
		if results[i].CMC < results[i-1].CMC {
			t.Errorf("results not sorted by CMC: %.1f before %.1f", results[i-1].CMC, results[i].CMC)
		}
	}
}
