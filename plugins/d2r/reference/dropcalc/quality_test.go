package dropcalc

import (
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/d2r/reference/data"
)

func TestEffectiveMF(t *testing.T) {
	// Magic tier uses raw MF (no diminishing returns).
	if got := effectiveMF(300, tierMagic); got != 300 {
		t.Errorf("magic MF 300: got %d, want 300", got)
	}

	// MF ≤ 10 returns raw value for any tier.
	if got := effectiveMF(10, tierUnique); got != 10 {
		t.Errorf("unique MF 10: got %d, want 10", got)
	}

	// Unique: factor=250. effectiveMF = 300*250/(300+250) = 75000/550 = 136 (int).
	if got := effectiveMF(300, tierUnique); got != 136 {
		t.Errorf("unique MF 300: got %d, want 136", got)
	}

	// Set: factor=500. effectiveMF = 300*500/(300+500) = 150000/800 = 187 (int).
	if got := effectiveMF(300, tierSet); got != 187 {
		t.Errorf("set MF 300: got %d, want 187", got)
	}

	// Rare: factor=600. effectiveMF = 300*600/(300+600) = 180000/900 = 200 (int).
	if got := effectiveMF(300, tierRare); got != 200 {
		t.Errorf("rare MF 300: got %d, want 200", got)
	}
}

func TestQualityChanceBasic(t *testing.T) {
	// Normal item ratio, no MF, no TC bonus.
	// Unique: Ratio=400, Divisor=1, Min=6400
	// chance = 400 - (87-1)/1 = 400 - 86 = 314
	// mulChance = 314 * 128 = 40192
	// chanceWithMF = 40192 * 100 / 100 = 40192
	// chanceAfterFactor = 40192 - 0 = 40192
	// prob = 128 / 40192 ≈ 0.003184
	mods := data.QualityModifiers{Ratio: 400, Divisor: 1, Min: 6400}
	prob := qualityChance(87, 1, 0, mods, 0, tierUnique)
	expected := 128.0 / 40192.0
	if !approxEqual(prob, expected) {
		t.Errorf("qualityChance basic: got %f, want %f", prob, expected)
	}
}

func TestQualityChanceWithMF(t *testing.T) {
	// Unique: Ratio=400, Divisor=1, Min=6400
	// mlvl=87, qlvl=1, mf=300
	// chance = 400 - 86 = 314
	// mulChance = 314 * 128 = 40192
	// effectiveMF(300, unique) = 300*250/550 = 136
	// chanceWithMF = 40192 * 100 / (100 + 136) = 4019200 / 236 = 17030 (int)
	// prob = 128 / 17030 ≈ 0.007516
	mods := data.QualityModifiers{Ratio: 400, Divisor: 1, Min: 6400}
	prob := qualityChance(87, 1, 300, mods, 0, tierUnique)
	expected := 128.0 / 17030.0
	if !approxEqual(prob, expected) {
		t.Errorf("qualityChance with MF: got %f, want %f", prob, expected)
	}
}

func TestQualityChanceWithTCBonus(t *testing.T) {
	// Unique: Ratio=400, Divisor=1, Min=6400
	// mlvl=87, qlvl=1, mf=0, tcBonus=983
	// chance = 400 - 86 = 314
	// mulChance = 314 * 128 = 40192
	// chanceWithMF = 40192 (no MF)
	// chanceAfterFactor = 40192 - (40192 * 983 / 1024) = 40192 - 38575 = 1617 (int)
	// prob = 128 / 1617 ≈ 0.07916
	mods := data.QualityModifiers{Ratio: 400, Divisor: 1, Min: 6400}
	prob := qualityChance(87, 1, 0, mods, 983, tierUnique)
	chanceAfterFactor := 40192 - (40192 * 983 / 1024)
	expected := 128.0 / float64(chanceAfterFactor)
	if !approxEqual(prob, expected) {
		t.Errorf("qualityChance with TC bonus: got %f, want %f", prob, expected)
	}
}

func TestQualityChanceMinClamp(t *testing.T) {
	// When mlvl >> qlvl, chance can go very low. Min clamp kicks in.
	// Ratio=400, Divisor=1, Min=6400
	// mlvl=99, qlvl=1, mf=1000
	// chance = 400 - 98 = 302
	// mulChance = 302 * 128 = 38656
	// effectiveMF(1000, unique) = 1000*250/1250 = 200
	// chanceWithMF = 38656 * 100 / 300 = 12885 (int)
	// Min=6400 > 12885? No, so no clamp in this case.
	// Let's use a case where Min clamps:
	// mlvl=1, qlvl=1, mf=1000
	// chance = 400 - 0 = 400
	// mulChance = 400 * 128 = 51200
	// chanceWithMF = 51200 * 100 / 300 = 17066 (int)
	// Min=6400 > 17066? No. Min only kicks in when chanceWithMF < Min.
	// Use very high MF to drive chanceWithMF below Min:
	// Actually with Ratio=400, Min=6400, even high MF won't drop below 6400.
	// The Min is a floor on chanceWithMF which prevents quality from going too high.
	// This mainly matters for items where mlvl is close to qlvl.

	// Verify Min clamp directly: construct a scenario where chanceWithMF < Min.
	// Ratio=10, Divisor=1, Min=5000. mlvl=1, qlvl=1, mf=0.
	// chance = 10 - 0 = 10
	// mulChance = 10 * 128 = 1280
	// chanceWithMF = 1280
	// Min=5000 > 1280 → clamp to 5000
	// prob = 128 / 5000 = 0.0256
	mods := data.QualityModifiers{Ratio: 10, Divisor: 1, Min: 5000}
	prob := qualityChance(1, 1, 0, mods, 0, tierUnique)
	expected := 128.0 / 5000.0
	if !approxEqual(prob, expected) {
		t.Errorf("qualityChance min clamp: got %f, want %f", prob, expected)
	}
}

func TestComputeQualitySums(t *testing.T) {
	c := NewCalculator()
	// War Hat (xap) is a known base item. Quality probabilities should sum to 1.0.
	q := c.ComputeQuality("xap", 87, 0, data.QualityRatios{})
	total := q.Unique + q.Set + q.Rare + q.Magic + q.White
	if !approxEqual(total, 1.0) {
		t.Errorf("quality sum for xap: got %f, want 1.0", total)
	}

	// All tiers should be non-negative.
	if q.Unique < 0 || q.Set < 0 || q.Rare < 0 || q.Magic < 0 || q.White < 0 {
		t.Errorf("negative quality probability: %+v", q)
	}
}

func TestComputeQualityWithMF(t *testing.T) {
	c := NewCalculator()
	// Higher MF should increase unique chance.
	q0 := c.ComputeQuality("xap", 87, 0, data.QualityRatios{})
	q300 := c.ComputeQuality("xap", 87, 300, data.QualityRatios{})

	if q300.Unique <= q0.Unique {
		t.Errorf("MF 300 unique (%f) should exceed MF 0 unique (%f)", q300.Unique, q0.Unique)
	}
	// White should decrease with more MF.
	if q300.White >= q0.White {
		t.Errorf("MF 300 white (%f) should be less than MF 0 white (%f)", q300.White, q0.White)
	}
}

func TestComputeQualityWithTCBonus(t *testing.T) {
	c := NewCalculator()
	// TC bonus (like Mephisto's 983) should boost unique chance.
	q0 := c.ComputeQuality("xap", 87, 0, data.QualityRatios{})
	qBoss := c.ComputeQuality("xap", 87, 0, data.QualityRatios{Unique: 983, Set: 983, Rare: 983, Magic: 1024})

	if qBoss.Unique <= q0.Unique {
		t.Errorf("boss TC unique (%f) should exceed base unique (%f)", qBoss.Unique, q0.Unique)
	}
}

func TestComputeQualityNonMagicItem(t *testing.T) {
	c := NewCalculator()
	// Gold (gld) is not a base item with CanBeMagic, should return all white.
	q := c.ComputeQuality("gld", 87, 300, data.QualityRatios{Unique: 983})
	if q.White != 1.0 {
		t.Errorf("non-magic item white: got %f, want 1.0", q.White)
	}
}

func TestResolveWithQualityMephisto(t *testing.T) {
	c := NewCalculator()
	drops, err := c.ResolveWithQuality("mephisto", 2, 0, 1, 1, 0)
	if err != nil {
		t.Fatal(err)
	}

	if len(drops) < 50 {
		t.Errorf("Mephisto Hell should drop many items, got %d", len(drops))
	}

	// Find War Hat (xap) and verify quality breakdown.
	var xap *ItemDrop
	for i := range drops {
		if drops[i].Code == "xap" {
			xap = &drops[i]
			break
		}
	}
	if xap == nil {
		t.Fatal("xap (War Hat) not in Mephisto Hell drops")
	}

	// Quality probabilities should sum to base probability.
	qualitySum := xap.Quality.Unique + xap.Quality.Set + xap.Quality.Rare + xap.Quality.Magic + xap.Quality.White
	if !approxEqual(qualitySum, xap.BaseProb) {
		t.Errorf("xap quality sum (%f) != base prob (%f)", qualitySum, xap.BaseProb)
	}

	t.Logf("War Hat from Mephisto Hell (0 MF): base=1:%.0f, unique=1:%.0f, set=1:%.0f, rare=1:%.0f",
		1/xap.BaseProb, 1/xap.Quality.Unique, 1/xap.Quality.Set, 1/xap.Quality.Rare)
}

func TestResolveWithQualityMFEffect(t *testing.T) {
	c := NewCalculator()
	drops0, err := c.ResolveWithQuality("mephisto", 2, 0, 1, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	drops300, err := c.ResolveWithQuality("mephisto", 2, 0, 1, 1, 300)
	if err != nil {
		t.Fatal(err)
	}

	// Build maps for comparison.
	m0 := make(map[string]*ItemDrop, len(drops0))
	for i := range drops0 {
		m0[drops0[i].Code] = &drops0[i]
	}
	m300 := make(map[string]*ItemDrop, len(drops300))
	for i := range drops300 {
		m300[drops300[i].Code] = &drops300[i]
	}

	// War Hat unique chance should be higher at 300 MF.
	xap0 := m0["xap"]
	xap300 := m300["xap"]
	if xap0 == nil || xap300 == nil {
		t.Fatal("xap missing from drops")
	}
	if xap300.Quality.Unique <= xap0.Quality.Unique {
		t.Errorf("300 MF unique (%f) should exceed 0 MF unique (%f)",
			xap300.Quality.Unique, xap0.Quality.Unique)
	}
	// Base prob should be identical (MF doesn't affect base item selection).
	if !approxEqual(xap0.BaseProb, xap300.BaseProb) {
		t.Errorf("base prob changed with MF: 0=%f, 300=%f", xap0.BaseProb, xap300.BaseProb)
	}
}
