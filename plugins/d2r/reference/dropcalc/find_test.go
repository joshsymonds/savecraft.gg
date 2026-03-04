package dropcalc

import (
	"testing"
)

func TestFindAncestorTCs(t *testing.T) {
	c := NewCalculator()

	// r13 (Shael) should trace up through Runes 7 → Runes 8 → ... → monster TCs.
	ancestors := c.findAncestorTCs("r13")
	if !ancestors["Runes 7"] {
		t.Error("r13 ancestors should include Runes 7")
	}
	if !ancestors["Runes 8"] {
		t.Error("r13 ancestors should include Runes 8 (parent of Runes 7)")
	}
	if len(ancestors) < 10 {
		t.Errorf("r13 should have many ancestor TCs, got %d", len(ancestors))
	}

	// cap (Cap helmet) should trace through virtual TCs armo3, helm3.
	ancestors = c.findAncestorTCs("cap")
	if len(ancestors) == 0 {
		t.Error("cap should have ancestor TCs")
	}
}

func TestFindItemSourcesShael(t *testing.T) {
	c := NewCalculator()

	sources := c.FindItemSources("r13", FindOptions{
		Difficulty: 2, // Hell
		TCType:     0, // Regular TC
		BossOnly:   true,
		Players:    1,
		MF:         0,
	})

	if len(sources) == 0 {
		t.Fatal("Shael should have boss sources in Hell")
	}

	// Verify sources are sorted by unique probability descending.
	for i := 1; i < len(sources); i++ {
		if sources[i].Quality.Unique > sources[i-1].Quality.Unique {
			t.Errorf("sources not sorted: [%d]=%f > [%d]=%f",
				i, sources[i].Quality.Unique, i-1, sources[i-1].Quality.Unique)
		}
	}

	// Log top 5 for inspection.
	for i, s := range sources {
		if i >= 5 {
			break
		}
		t.Logf("#%d %s (%s) diff=%d: 1:%.0f", i+1, s.MonsterName, s.MonsterID, s.Difficulty, 1/s.BaseProb)
	}
}

func TestFindItemSourcesBossFilter(t *testing.T) {
	c := NewCalculator()

	bossSources := c.FindItemSources("r13", FindOptions{
		Difficulty: 2,
		TCType:     0,
		BossOnly:   true,
		Players:    1,
	})
	allSources := c.FindItemSources("r13", FindOptions{
		Difficulty: 2,
		TCType:     0,
		Players:    1,
	})

	if len(bossSources) >= len(allSources) {
		t.Error("boss-only should return fewer results than all")
	}
	for _, s := range bossSources {
		if !s.IsBoss {
			t.Errorf("boss filter returned non-boss: %s", s.MonsterID)
		}
	}
}

func TestFindItemSourcesAreaFilter(t *testing.T) {
	c := NewCalculator()

	sources := c.FindItemSources("r13", FindOptions{
		Difficulty: 2,
		TCType:     0,
		Area:       "Pit Level 1",
		Players:    1,
	})

	for _, s := range sources {
		if s.Area != "Pit Level 1" && s.Area != "" {
			t.Errorf("area filter returned wrong area: %s", s.Area)
		}
	}
}

func TestFindItemSourcesVipermagiCrossCheck(t *testing.T) {
	c := NewCalculator()

	// Cross-check: find Serpentskin Armor (xea) unique from bosses in Hell.
	// Should match our cross-check test values.
	sources := c.FindItemSources("xea", FindOptions{
		Difficulty: 2,
		TCType:     0,
		BossOnly:   true,
		Players:    3,
		PartySize:  1,
		MF:         33,
	})

	// Build a map for lookup.
	byMonster := make(map[string]*ItemSource)
	for i := range sources {
		byMonster[sources[i].MonsterID] = &sources[i]
	}

	// Mephisto Hell should be 1:915.
	if m, ok := byMonster["mephisto"]; ok {
		got := 1 / m.Quality.Unique
		if got < 910 || got > 920 {
			t.Errorf("Mephisto Hell xea unique: got 1:%.0f, want ~1:915", got)
		}
	} else {
		t.Error("Mephisto not in xea boss sources")
	}

	// Baal Hell should be 1:947.
	if b, ok := byMonster["baalcrab"]; ok {
		got := 1 / b.Quality.Unique
		if got < 940 || got > 950 {
			t.Errorf("Baal Hell xea unique: got 1:%.0f, want ~1:947", got)
		}
	} else {
		t.Error("Baal not in xea boss sources")
	}
}

func TestItemCode(t *testing.T) {
	c := NewCalculator()

	// By code.
	if c.ItemCode("r13") != "r13" {
		t.Error("ItemCode should resolve code directly")
	}

	// By name.
	if c.ItemCode("Cap") != "cap" {
		t.Errorf("ItemCode('Cap') = %q, want 'cap'", c.ItemCode("Cap"))
	}

	// Unknown.
	if c.ItemCode("nonexistent") != "" {
		t.Error("ItemCode should return empty for unknown")
	}
}

func TestItemCodeUniqueNames(t *testing.T) {
	c := NewCalculator()

	tests := []struct {
		name string
		want string
	}{
		{"Skin of the Vipermagi", "xea"},
		{"Magefist", "tgl"},
		{"Shako", "uap"},
		{"Arachnid Mesh", "ulc"},
		// Corrected spellings of Blizzard typos.
		{"Peasant Crown", "xap"},
		{"Valkyrie Wing", "xhm"},
		{"Que-Hegan's Wisdom", "xtp"},
		{"Thundergod's Vigor", "zhb"},
		{"Death's Web", "7gw"},
		{"Steel Carapace", "uul"},
	}

	for _, tt := range tests {
		got := c.ItemCode(tt.name)
		if got != tt.want {
			t.Errorf("ItemCode(%q) = %q, want %q", tt.name, got, tt.want)
		}
	}
}

func TestItemCodeSetNames(t *testing.T) {
	c := NewCalculator()

	tests := []struct {
		name string
		want string
	}{
		{"Tal Rasha's Horadric Crest", "xsk"},
		{"Civerb's Ward", "lrg"},
		// Corrected spelling of Blizzard typo.
		{"Griswold's Redemption", "7ws"},
	}

	for _, tt := range tests {
		got := c.ItemCode(tt.name)
		if got != tt.want {
			t.Errorf("ItemCode(%q) = %q, want %q", tt.name, got, tt.want)
		}
	}
}
