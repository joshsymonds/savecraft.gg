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

func TestComputeStatWithMaterialFactors(t *testing.T) {
	// Steel longsword at normal quality: base 23 * sharp 1.0 * quality 1.0 = 23
	approx(t, "steel normal sharp damage",
		ComputeStat(23, 1.0, DamageQuality(QualityNormal)), 23.0)

	// Plasteel longsword at normal quality: 23 * 1.1 * 1.0 = 25.3
	approx(t, "plasteel normal sharp damage",
		ComputeStat(23, 1.1, DamageQuality(QualityNormal)), 25.3)

	// Masterwork plasteel: 23 * 1.1 * 1.15 = 29.095
	approx(t, "plasteel masterwork sharp damage",
		ComputeStat(23, 1.1, DamageQuality(QualityMasterwork)), 29.095)

	// Steel flak vest sharp armor: base 1.0 * steel 0.9 * normal 1.0 = 0.9
	approx(t, "steel flak sharp armor",
		ComputeStat(1.0, 0.9, ArmorQuality(QualityNormal)), 0.9)

	// Legendary plasteel flak: 1.0 * 1.14 * 1.5 = 1.71
	approx(t, "legendary plasteel flak sharp armor",
		ComputeStat(1.0, 1.14, ArmorQuality(QualityLegendary)), 1.71)
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
