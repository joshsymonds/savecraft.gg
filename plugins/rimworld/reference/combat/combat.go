// Package combat implements the RimWorld weapon DPS and armor calculator.
//
// Ranged DPS formula:
//
//	rawDPS = damage × burstCount / cycleTime
//	cycleTime = warmup + cooldown + (burstCount-1) × ticksBetweenBurst / 60
//	dpsAtRange = rawDPS × accuracyAtRange
//
// Melee true DPS uses weighted verb selection:
//
//	weight_i = power_i / cooldown_i
//	trueDPS = sum(weight_i²) / sum(weight_i)
//
// Armor expected damage:
//
//	effectiveArmor = max(armorRating - armorPenetration, 0)
//	expectedDamage = damage × (1 - 3 × effectiveArmor / 4)
package combat

// Range breakpoints for accuracy interpolation (in tiles).
const (
	RangeTouch  = 3.0
	RangeShort  = 12.0
	RangeMedium = 25.0
	RangeLong   = 40.0
)

// RangedWeaponStats contains the parameters needed for ranged DPS calculation.
type RangedWeaponStats struct {
	DamagePerShot          float64
	ArmorPenetration       float64
	BurstShotCount         int
	WarmupTime             float64 // seconds
	Cooldown               float64 // seconds
	TicksBetweenBurstShots int     // game ticks (60 ticks = 1 second)
	Range                  float64 // max range in tiles
	AccuracyTouch          float64 // accuracy at 3 tiles
	AccuracyShort          float64 // accuracy at 12 tiles
	AccuracyMedium         float64 // accuracy at 25 tiles
	AccuracyLong           float64 // accuracy at 40 tiles
}

// MeleeTool represents a single melee attack verb.
type MeleeTool struct {
	Label          string
	Power          float64 // damage per hit
	Cooldown       float64 // seconds between attacks
	ArmorPenetration float64
	Capacities     []string // damage types (Cut, Blunt, Stab, etc.)
}

// RawRangedDPS computes the theoretical maximum DPS ignoring accuracy.
func RawRangedDPS(w RangedWeaponStats) float64 {
	burstCount := w.BurstShotCount
	if burstCount < 1 {
		burstCount = 1
	}
	burstDelay := float64(burstCount-1) * float64(w.TicksBetweenBurstShots) / 60.0
	cycleTime := w.WarmupTime + w.Cooldown + burstDelay
	if cycleTime <= 0 {
		return 0
	}
	return w.DamagePerShot * float64(burstCount) / cycleTime
}

// RangedDPSAtRange computes DPS at a given distance in tiles.
func RangedDPSAtRange(w RangedWeaponStats, rangeTiles float64) float64 {
	return RawRangedDPS(w) * AccuracyAtRange(w, rangeTiles)
}

// AccuracyAtRange interpolates weapon accuracy at a given distance.
// Uses linear interpolation between the four range breakpoints.
// Below touch range uses touch accuracy. Above weapon range caps at the
// interpolated value at max range.
func AccuracyAtRange(w RangedWeaponStats, rangeTiles float64) float64 {
	breakpoints := [4]float64{RangeTouch, RangeShort, RangeMedium, RangeLong}
	accuracies := [4]float64{w.AccuracyTouch, w.AccuracyShort, w.AccuracyMedium, w.AccuracyLong}

	if rangeTiles <= breakpoints[0] {
		return accuracies[0]
	}
	for i := 1; i < 4; i++ {
		if rangeTiles <= breakpoints[i] {
			t := (rangeTiles - breakpoints[i-1]) / (breakpoints[i] - breakpoints[i-1])
			return accuracies[i-1] + t*(accuracies[i]-accuracies[i-1])
		}
	}
	return accuracies[3]
}

// MeleeTrueDPS computes the true DPS accounting for weighted verb selection.
// Each tool's selection weight is proportional to its damage/cooldown ratio.
// Higher-DPS attacks are selected more often, so true DPS exceeds simple average.
func MeleeTrueDPS(tools []MeleeTool) float64 {
	if len(tools) == 0 {
		return 0
	}

	var totalWeight, weightedDPSSum float64
	for _, t := range tools {
		if t.Cooldown <= 0 {
			continue
		}
		dps := t.Power / t.Cooldown
		weight := dps // selection weight proportional to DPS
		totalWeight += weight
		weightedDPSSum += weight * dps
	}
	if totalWeight <= 0 {
		return 0
	}
	return weightedDPSSum / totalWeight
}

// ArmorExpectedDamage computes the expected damage after armor mitigation.
//
// The armor system works as follows:
//
//	effectiveArmor = max(armorRating - armorPenetration, 0), clamped to [0, 1]
//	Random roll [0, 1):
//	  roll < ea/2: fully deflected (0 damage)
//	  roll < ea: half damage
//	  roll >= ea: full damage
//	Expected = damage × (1 - 3×ea/4)
func ArmorExpectedDamage(damage, armorPenetration, armorRating float64) float64 {
	ea := armorRating - armorPenetration
	if ea < 0 {
		ea = 0
	}
	if ea > 1 {
		ea = 1
	}
	return damage * (1 - 3*ea/4)
}
