package materials

import (
	"math"
	"testing"
)

const tolerance = 0.01

func approx(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > tolerance {
		t.Errorf("%s = %.4f, want %.4f", name, got, want)
	}
}

func TestMaterialStatLookup(t *testing.T) {
	steel := MaterialStats{
		SharpArmorFactor: 0.9,
		BluntArmorFactor: 0.45,
		HeatArmorFactor:  0.60,
		SharpDamageFactor: 1.0,
		BluntDamageFactor: 1.0,
		MaxHitPointsFactor: 1.0, // steel doesn't have stuffProps HP factor, uses default
	}

	plasteel := MaterialStats{
		SharpArmorFactor:  1.14,
		BluntArmorFactor:  0.55,
		HeatArmorFactor:   0.65,
		SharpDamageFactor: 1.1,
		BluntDamageFactor: 0.9,
		MaxHitPointsFactor: 1.0,
	}

	// Plasteel should have higher sharp armor than steel
	if plasteel.SharpArmorFactor <= steel.SharpArmorFactor {
		t.Error("plasteel sharp armor should exceed steel")
	}

	// Steel has better blunt damage than plasteel
	if steel.BluntDamageFactor <= plasteel.BluntDamageFactor {
		t.Error("steel blunt damage should exceed plasteel")
	}
}

func TestQualityMultipliers(t *testing.T) {
	// Market value quality multipliers (well-known values)
	approx(t, "awful market value", MarketValueQuality(QualityAwful), 0.5)
	approx(t, "normal market value", MarketValueQuality(QualityNormal), 1.0)
	approx(t, "legendary market value", MarketValueQuality(QualityLegendary), 5.0)

	// Armor quality multipliers (from the game)
	approx(t, "normal armor", ArmorQuality(QualityNormal), 1.0)
	approx(t, "masterwork armor", ArmorQuality(QualityMasterwork), 1.25)
	approx(t, "legendary armor", ArmorQuality(QualityLegendary), 1.5)
}

func TestComputeItemStats(t *testing.T) {
	// A steel longsword at normal quality:
	// Base sharp armor of the longsword is 0 (weapons don't have armor)
	// But we can test damage: base power 23 * steel sharp multiplier 1.0 * quality 1.0 = 23
	// A plasteel longsword: 23 * 1.1 = 25.3

	steelDmg := ComputeStat(23, 1.0, DamageQuality(QualityNormal))
	approx(t, "steel sword damage", steelDmg, 23.0)

	plasteelDmg := ComputeStat(23, 1.1, DamageQuality(QualityNormal))
	approx(t, "plasteel sword damage", plasteelDmg, 25.3)

	// Masterwork plasteel: 23 * 1.1 * 1.15 (masterwork damage) = 29.095
	mwPlasteel := ComputeStat(23, 1.1, DamageQuality(QualityMasterwork))
	approx(t, "mw plasteel damage", mwPlasteel, 29.095)
}

func TestComputeArmorRating(t *testing.T) {
	// Flak vest base sharp armor: 1.0 (from ThingDef)
	// Steel: SharpArmorFactor 0.9
	// Normal quality armor multiplier: 1.0
	// Final: 1.0 * 0.9 * 1.0 = 0.9

	steelFlak := ComputeStat(1.0, 0.9, ArmorQuality(QualityNormal))
	approx(t, "steel flak sharp", steelFlak, 0.9)

	// Plasteel: 1.14
	plasteelFlak := ComputeStat(1.0, 1.14, ArmorQuality(QualityNormal))
	approx(t, "plasteel flak sharp", plasteelFlak, 1.14)

	// Legendary plasteel: 1.0 * 1.14 * 1.5 = 1.71
	legPlasteel := ComputeStat(1.0, 1.14, ArmorQuality(QualityLegendary))
	approx(t, "legendary plasteel flak sharp", legPlasteel, 1.71)
}
