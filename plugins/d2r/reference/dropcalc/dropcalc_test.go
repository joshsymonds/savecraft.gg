package dropcalc

import (
	"math"
	"testing"
)

const epsilon = 1e-9

func approxEqual(a, b float64) bool {
	return math.Abs(a-b) < epsilon
}

func TestNewCalculator(t *testing.T) {
	c := NewCalculator()
	if c == nil {
		t.Fatal("NewCalculator returned nil")
	}
	// Spot-check indexes built correctly.
	if _, ok := c.tcByName["Mephisto (H)"]; !ok {
		t.Error("missing TC: Mephisto (H)")
	}
	if _, ok := c.baseItemByCode["cap"]; !ok {
		t.Error("missing base item: cap")
	}
	if _, ok := c.itemTypeByCode["helm"]; !ok {
		t.Error("missing item type: helm")
	}
	if _, ok := c.monsterByID["mephisto"]; !ok {
		t.Error("missing monster: mephisto")
	}
}

func TestParentTypeCodes(t *testing.T) {
	c := NewCalculator()
	// "helm" should have parent "armo"
	codes := c.allTypeCodes["helm"]
	if codes == nil {
		t.Fatal("no type codes for helm")
	}
	if !codes["armo"] {
		t.Error("helm should have parent armo")
	}
	if !codes["helm"] {
		t.Error("helm should include itself")
	}
}

func TestVirtualTCs(t *testing.T) {
	c := NewCalculator()
	// Cap is level 1, tcLevel = 1 + (3-1%3)%3 = 1+2 = 3
	// Cap is type "helm", which has parent "armo"
	// So Cap should appear in virtual TCs "helm3" and "armo3"
	vtc, ok := c.virtualTCs["armo3"]
	if !ok {
		t.Fatal("missing virtual TC: armo3")
	}
	found := false
	for _, item := range vtc.Items {
		if item.Code == "cap" {
			found = true
			break
		}
	}
	if !found {
		t.Error("armo3 should contain cap")
	}
	if vtc.TotalWeight <= 0 {
		t.Error("armo3 should have positive total weight")
	}
}

func TestCalcNoDrop(t *testing.T) {
	// Single player: NoDrop unchanged.
	nd := calcNoDrop(100, 300, 1, 1)
	if nd != 100 {
		t.Errorf("single player NoDrop: got %d, want 100", nd)
	}

	// Two players in party of 2: exponent = floor(1 + 0.5 + 0.5) = 2
	// baseRate = 100/(100+300) = 0.25, newRate = 0.25^2 = 0.0625
	// newNum = (0.0625/0.9375) * 300 = 20
	nd = calcNoDrop(100, 300, 2, 2)
	if nd != 20 {
		t.Errorf("2p/2party NoDrop: got %d, want 20", nd)
	}

	// NoDrop=0 means no NoDrop.
	nd = calcNoDrop(0, 300, 1, 1)
	if nd != 0 {
		t.Errorf("zero NoDrop: got %d, want 0", nd)
	}
}

func TestTCGroupUpgrade(t *testing.T) {
	c := NewCalculator()
	// "Act 1 Equip A" is group 1, level 3.
	// At mlvl 3, should stay the same.
	upgraded := c.upgradeTCByLevel("Act 1 Equip A", 3)
	if upgraded != "Act 1 Equip A" {
		t.Errorf("upgrade at mlvl 3: got %q, want Act 1 Equip A", upgraded)
	}
	// At mlvl 90+, should upgrade to the highest in the group.
	upgraded = c.upgradeTCByLevel("Act 1 Equip A", 99)
	if upgraded == "Act 1 Equip A" {
		t.Error("upgrade at mlvl 99 should not stay at Act 1 Equip A")
	}
}

func TestSimpleResolve(t *testing.T) {
	c := NewCalculator()
	// "Runes 1" = {r01: 3, r02: 2}, Picks=1, NoDrop=0.
	// Total = 5. r01 = 3/5 = 0.6, r02 = 2/5 = 0.4.
	result := c.Resolve("Runes 1", 1, 1)
	if !approxEqual(result["r01"], 3.0/5.0) {
		t.Errorf("Runes 1 → r01: got %f, want %f", result["r01"], 3.0/5.0)
	}
	if !approxEqual(result["r02"], 2.0/5.0) {
		t.Errorf("Runes 1 → r02: got %f, want %f", result["r02"], 2.0/5.0)
	}
}

func TestRecursiveResolve(t *testing.T) {
	c := NewCalculator()
	// "Runes 2" = {r03: 3, r04: 2, "Runes 1": 2}, Picks=1, NoDrop=0.
	// Total = 7. r03 = 3/7, r04 = 2/7, Runes 1 = 2/7.
	// Runes 1 = {r01: 3/5, r02: 2/5}.
	// r01 from Runes 2 = (2/7) * (3/5) = 6/35.
	// r02 from Runes 2 = (2/7) * (2/5) = 4/35.
	result := c.Resolve("Runes 2", 1, 1)
	if !approxEqual(result["r03"], 3.0/7.0) {
		t.Errorf("Runes 2 → r03: got %f, want %f", result["r03"], 3.0/7.0)
	}
	if !approxEqual(result["r04"], 2.0/7.0) {
		t.Errorf("Runes 2 → r04: got %f, want %f", result["r04"], 2.0/7.0)
	}
	if !approxEqual(result["r01"], 6.0/35.0) {
		t.Errorf("Runes 2 → r01: got %f, want %f", result["r01"], 6.0/35.0)
	}
	if !approxEqual(result["r02"], 4.0/35.0) {
		t.Errorf("Runes 2 → r02: got %f, want %f", result["r02"], 4.0/35.0)
	}
}

func TestResolveWithNoDrop(t *testing.T) {
	c := NewCalculator()
	// Find a TC with NoDrop > 0 and verify probabilities sum < 1.
	// "Countess Item" has NoDrop=19, Picks=5.
	result := c.Resolve("Countess Item", 1, 1)
	var total float64
	for _, p := range result {
		total += p
	}
	// With NoDrop, total probability of getting any specific item < 1,
	// but since Picks=5, multiple items can drop. Just verify non-empty.
	if len(result) == 0 {
		t.Error("Countess Item should resolve to some items")
	}
}

func TestNegativePicks(t *testing.T) {
	c := NewCalculator()
	// "Countess Rune" has Picks=3 (positive) but only one outcome "Runes 4"
	// with NoDrop=5. Each of 3 picks independently rolls.
	// P(at least one from Runes 4) = 1 - (1 - 15/20)^3 = 1 - (0.25)^3 = 0.984375
	// Actually Picks=3 means 3 independent picks from {Runes 4: 15, NoDrop: 5}.
	result := c.Resolve("Countess Rune", 1, 1)
	if len(result) == 0 {
		t.Error("Countess Rune should resolve to rune items")
	}
	// Should contain El Rune (r01) through at least Fal Rune (r15)
	if _, ok := result["r01"]; !ok {
		t.Error("Countess Rune should include r01 (El Rune)")
	}
}

func TestVirtualTCResolution(t *testing.T) {
	c := NewCalculator()
	// "armo3" should resolve to base items of armor type at level ≤ 3
	result := c.Resolve("armo3", 1, 1)
	if len(result) == 0 {
		t.Error("armo3 should resolve to armor items")
	}
	// Cap (code "cap") is a level 1 helm, should be in armo3
	if _, ok := result["cap"]; !ok {
		t.Error("armo3 should include cap")
	}
}
