// Package materials implements the RimWorld item × material × quality stat calculator.
//
// RimWorld's stat system uses a three-layer multiplication:
//
//	finalStat = baseStat × materialFactor × qualityFactor
//
// Material factors come from StuffPower_* and *DamageMultiplier stats on the
// material ThingDef. Quality multipliers vary by stat category.
package materials

// Quality levels.
const (
	QualityAwful      = iota // 0
	QualityPoor              // 1
	QualityNormal            // 2
	QualityGood              // 3
	QualityExcellent         // 4
	QualityMasterwork        // 5
	QualityLegendary         // 6
)

// MaterialStats contains the stat factors for a material (stuff).
type MaterialStats struct {
	DefName            string
	Label              string
	MarketValue        float64
	SharpArmorFactor   float64 // StuffPower_Armor_Sharp
	BluntArmorFactor   float64 // StuffPower_Armor_Blunt
	HeatArmorFactor    float64 // StuffPower_Armor_Heat
	ColdInsulation     float64 // StuffPower_Insulation_Cold
	HeatInsulation     float64 // StuffPower_Insulation_Heat
	SharpDamageFactor  float64 // SharpDamageMultiplier
	BluntDamageFactor  float64 // BluntDamageMultiplier
	MaxHitPointsFactor float64 // from stuffProps.statFactors.MaxHitPoints
	BeautyFactor       float64 // from stuffProps.statFactors.Beauty
	BeautyOffset       float64 // from stuffProps.statOffsets.Beauty
}

// ComputeStat applies the three-layer multiplication: base × material × quality.
func ComputeStat(base, materialFactor, qualityFactor float64) float64 {
	return base * materialFactor * qualityFactor
}

// MarketValueQuality returns the quality multiplier for market value.
// From QualityCategory in the decompiled source.
func MarketValueQuality(quality int) float64 {
	factors := [7]float64{0.5, 0.75, 1.0, 1.25, 1.5, 2.5, 5.0}
	if quality < 0 {
		return factors[0]
	}
	if quality > 6 {
		return factors[6]
	}
	return factors[quality]
}

// ArmorQuality returns the quality multiplier for armor ratings.
func ArmorQuality(quality int) float64 {
	factors := [7]float64{0.5, 0.75, 1.0, 1.1, 1.2, 1.25, 1.5}
	if quality < 0 {
		return factors[0]
	}
	if quality > 6 {
		return factors[6]
	}
	return factors[quality]
}

// DamageQuality returns the quality multiplier for melee weapon damage.
func DamageQuality(quality int) float64 {
	factors := [7]float64{0.8, 0.9, 1.0, 1.05, 1.1, 1.15, 1.3}
	if quality < 0 {
		return factors[0]
	}
	if quality > 6 {
		return factors[6]
	}
	return factors[quality]
}

// HitPointsQuality returns the quality multiplier for max hit points.
func HitPointsQuality(quality int) float64 {
	factors := [7]float64{0.5, 0.75, 1.0, 1.1, 1.2, 1.5, 2.5}
	if quality < 0 {
		return factors[0]
	}
	if quality > 6 {
		return factors[6]
	}
	return factors[quality]
}
