package dropcalc

import (
	"math"
	"testing"
)

// TestAndarielHellTC validates the TC resolution for Andariel's Hell boss TC.
// Since we use D2R RoTW data, Andariel's TC is "Andarielq (H)" (quest drop).
func TestAndarielHellTC(t *testing.T) {
	c := NewCalculator()

	// Andarielq (H) has Picks=7, NoDrop=15.
	// Items: [{Act 5 (H) Equip A: 52}, {Act 5 (H) Good: 3}]
	// (After TC upgrade from Andarielq to the appropriate level.)
	mon := c.monsterByID["andariel"]
	if mon == nil {
		t.Fatal("missing monster: andariel")
	}
	tcName := mon.TCs[2][0] // Hell, regular (BOSS maps to regular TC)
	mlvl := mon.Levels[2]
	tcName = c.upgradeTCByLevel(tcName, mlvl)
	t.Logf("Andariel Hell TC: %s (mlvl=%d)", tcName, mlvl)

	result := c.ResolveToTCs(tcName, 1, 1)

	// Verify the TC resolves to expected categories.
	if len(result) == 0 {
		t.Fatal("empty result")
	}

	// Log top items for debugging.
	t.Log("Virtual TC probabilities:")
	for code, prob := range result {
		if prob > 0.01 {
			t.Logf("  %s: %.6f", code, prob)
		}
	}

	// All probabilities should be positive.
	for code, prob := range result {
		if prob < 0 {
			t.Errorf("%s has negative probability: %f", code, prob)
		}
	}
}

// TestManualTCMath validates the math by hand-computing a simple case.
// "Runes 1" = {r01: 3, r02: 2}, Picks=1, NoDrop=0.
// P(r01) = 3/5, P(r02) = 2/5.
// These should sum to 1.0 (no NoDrop, picks=1).
func TestManualTCMath(t *testing.T) {
	c := NewCalculator()
	result := c.Resolve("Runes 1", 1, 1)

	total := 0.0
	for _, p := range result {
		total += p
	}
	if !approxEqual(total, 1.0) {
		t.Errorf("Runes 1 total: got %f, want 1.0", total)
	}
}

// TestPicksMath validates the picks formula with a known TC.
// Countess Rune: Picks=3, NoDrop=5, Items=[{Runes 4: 15}].
// Runes 4: {r07: 3, r08: 2, Runes 3: 7}, Picks=1, NoDrop=0.
// P(selecting Runes 4 on one pick) = 15/20 = 0.75.
// P(selecting r07 within Runes 4) = 3/12.
// P(r07 on one pick) = 0.75 * 3/12 = 0.1875.
// P(at least one r07 in 3 picks) = 1 - (1-0.1875)^3.
func TestPicksMath(t *testing.T) {
	c := NewCalculator()
	result := c.Resolve("Countess Rune", 1, 1)

	// r07 (Tal Rune): path probability = (15/20) * (3/12) = 0.1875 per pick.
	// 3 picks: 1 - (1-0.1875)^3.
	expectedR07 := 1 - math.Pow(1-0.75*3.0/12.0, 3)
	if !approxEqual(result["r07"], expectedR07) {
		t.Errorf("Countess Rune → r07: got %f, want %f", result["r07"], expectedR07)
	}

	// Sum of probabilities can exceed 1.0 because multiple items can drop
	// from 3 independent picks. This is expected.
	total := 0.0
	for _, p := range result {
		total += p
	}
	if total < 1.0 {
		t.Errorf("3 picks should yield total > 1.0 (expected items), got %f", total)
	}
}

// TestNegativePicksChampion validates that negative picks make each item
// an independent, guaranteed drop.
func TestNegativePicksChampion(t *testing.T) {
	c := NewCalculator()
	// "Act 1 Champ A" has Picks=-2, Items=[{Act 1 Citem A: 1}, {Act 1 Cpot A: 1}].
	// Both should be independent drops. Total probability should be > 1
	// (since each is an independent event).
	result := c.ResolveToTCs("Act 1 Champ A", 1, 1)

	citemProb := 0.0
	cpotProb := 0.0
	for code, prob := range result {
		t.Logf("  %s: %.6f", code, prob)
		if code == "Act 1 Citem A" || containsTC(c, code, "Act 1 Citem A") {
			citemProb += prob
		}
		if code == "Act 1 Cpot A" || containsTC(c, code, "Act 1 Cpot A") {
			cpotProb += prob
		}
	}

	// Each sub-TC should have non-zero probability.
	if len(result) == 0 {
		t.Error("Act 1 Champ A should produce drops")
	}

	// Total should be > 1.0 because items and potions are independent.
	total := 0.0
	for _, p := range result {
		total += p
	}
	if total < 1.0 {
		t.Errorf("negative picks total should be > 1.0 (independent drops), got %f", total)
	}
}

// containsTC checks if a code is a sub-TC of the named TC.
func containsTC(c *Calculator, code, tcName string) bool {
	tc := c.tcByName[tcName]
	if tc == nil {
		return false
	}
	for _, item := range tc.Items {
		if item.Name == code {
			return true
		}
	}
	return false
}

func TestMephistoHellDrops(t *testing.T) {
	c := NewCalculator()
	result, err := c.ResolveMonster("mephisto", 2, 0, 1, 1)
	if err != nil {
		t.Fatal(err)
	}

	xapProb := result["xap"]
	t.Logf("War Hat (xap): %.10f (1:%.0f)", xapProb, 1/xapProb)

	if xapProb <= 0 {
		t.Error("War Hat should have non-zero drop probability from Mephisto Hell")
	}

	if len(result) < 50 {
		t.Errorf("Mephisto Hell should drop many items, got %d", len(result))
	}
}
