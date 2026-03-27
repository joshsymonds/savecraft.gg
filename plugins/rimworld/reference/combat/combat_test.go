package combat

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

func TestRangedDPS(t *testing.T) {
	// Charge rifle: damage 16, burst 3, warmup 1.0s, cooldown 2.0s,
	// ticksBetweenBurstShots 12, accuracy touch=0.55 short=0.64 medium=0.55 long=0.45
	chargeRifle := RangedWeaponStats{
		DamagePerShot:          16,
		ArmorPenetration:       0.35,
		BurstShotCount:         3,
		WarmupTime:             1.0,
		Cooldown:               2.0,
		TicksBetweenBurstShots: 12,
		Range:                  27.9,
		AccuracyTouch:          0.55,
		AccuracyShort:          0.64,
		AccuracyMedium:         0.55,
		AccuracyLong:           0.45,
	}

	// Raw DPS (no accuracy): damage * burstCount / cycleTime
	// cycleTime = warmup + cooldown + (burstCount-1) * ticksBetweenBurst/60
	// = 1.0 + 2.0 + 2 * 12/60 = 3.0 + 0.4 = 3.4 seconds
	// rawDPS = 16 * 3 / 3.4 = 48 / 3.4 ≈ 14.12
	rawDPS := RawRangedDPS(chargeRifle)
	approx(t, "charge rifle raw DPS", rawDPS, 14.12)

	// DPS at medium range (25 tiles): rawDPS * accuracy_at_25
	// Range breakpoints: touch=3, short=12, medium=25, long=40 (but capped at weapon range)
	// At 25 tiles: medium accuracy = 0.55
	dpsAtMedium := RangedDPSAtRange(chargeRifle, 25)
	approx(t, "charge rifle DPS at 25", dpsAtMedium, rawDPS*0.55)

	// DPS at short range (12): should use short accuracy = 0.64
	dpsAtShort := RangedDPSAtRange(chargeRifle, 12)
	approx(t, "charge rifle DPS at 12", dpsAtShort, rawDPS*0.64)
}

func TestRangedDPSRevolver(t *testing.T) {
	// Revolver: damage 12, burst 1, warmup 0.3, cooldown 1.6
	revolver := RangedWeaponStats{
		DamagePerShot:    12,
		BurstShotCount:   1,
		WarmupTime:       0.3,
		Cooldown:         1.6,
		Range:            25.9,
		AccuracyTouch:    0.80,
		AccuracyShort:    0.75,
		AccuracyMedium:   0.55,
		AccuracyLong:     0.40,
	}

	// cycleTime = 0.3 + 1.6 = 1.9s
	// rawDPS = 12 / 1.9 ≈ 6.316
	rawDPS := RawRangedDPS(revolver)
	approx(t, "revolver raw DPS", rawDPS, 6.316)
}

func TestAccuracyInterpolation(t *testing.T) {
	stats := RangedWeaponStats{
		AccuracyTouch:  0.80,
		AccuracyShort:  0.75,
		AccuracyMedium: 0.55,
		AccuracyLong:   0.40,
		Range:          25.9,
	}

	// At touch range (3): 0.80
	approx(t, "at touch (3)", AccuracyAtRange(stats, 3), 0.80)
	// At short range (12): 0.75
	approx(t, "at short (12)", AccuracyAtRange(stats, 12), 0.75)
	// At 7.5 (midpoint touch-short): (0.80+0.75)/2 = 0.775
	approx(t, "at 7.5", AccuracyAtRange(stats, 7.5), 0.775)
	// Below touch (1): same as touch
	approx(t, "at 1", AccuracyAtRange(stats, 1), 0.80)
}

func TestMeleeDPS(t *testing.T) {
	// Longsword: handle (blunt 9, cd 2.0), point (stab 23, cd 2.6), edge (cut 27, cd 2.6)
	// Need to check if there's an edge tool — let me get it from the XML search above
	// Actually the longsword grep only showed 2 tools. Let me use what we have.
	// The true DPS uses weighted selection:
	// weight_i = power_i / cooldown_i
	// totalWeight = sum of all weights
	// trueDPS = sum(weight_i / totalWeight * power_i / cooldown_i) ... actually
	// trueDPS = (sum(power_i * weight_i)) / (sum(cooldown_i * weight_i))
	// where weight_i = power_i / cooldown_i (simplified)
	//
	// Actually the correct formula is:
	// Each tool has selectionWeight = power / cooldown (proportional to DPS contribution)
	// Expected DPS = sum_i(prob_i * power_i / cooldown_i)
	// where prob_i = weight_i / totalWeight
	// So DPS = sum_i((weight_i/totalWeight) * power_i/cooldown_i)
	// = sum_i(weight_i * power_i/cooldown_i) / totalWeight
	// = sum_i((power_i/cooldown_i)^2) / sum_i(power_i/cooldown_i)

	tools := []MeleeTool{
		{Label: "handle", Power: 9, Cooldown: 2.0},
		{Label: "point", Power: 23, Cooldown: 2.6},
		{Label: "edge", Power: 23, Cooldown: 2.6},
	}

	dps := MeleeTrueDPS(tools)
	// v1.6 formula: weight = damage², trueDPS = sum(damage³) / sum(damage² × cooldown)
	// handle: weight = 81, damage³ = 729, weight×cd = 162
	// point:  weight = 529, damage³ = 12167, weight×cd = 1375.4
	// edge:   weight = 529, damage³ = 12167, weight×cd = 1375.4
	// trueDPS = (729 + 12167 + 12167) / (162 + 1375.4 + 1375.4)
	//         = 25063 / 2912.8 ≈ 8.604
	approx(t, "longsword true DPS", dps, 8.604)

	// DPS should be higher than simple average because heavier attacks are selected more often
	simpleAvg := (9.0/2.0 + 23.0/2.6 + 23.0/2.6) / 3.0
	if dps <= simpleAvg {
		t.Errorf("true DPS (%.2f) should exceed simple average (%.2f)", dps, simpleAvg)
	}
}

func TestArmorExpectedDamage(t *testing.T) {
	// Armor system: effectiveArmor = armorRating - armorPenetration
	// Random roll [0, 1):
	//   roll < effectiveArmor/2: fully deflected (0 damage)
	//   roll < effectiveArmor: half damage
	//   roll >= effectiveArmor: full damage
	// Expected damage = 0 * (ea/2) + (damage/2) * (ea/2) + damage * (1 - ea)
	// = damage * (ea/4 + 1 - ea) = damage * (1 - 3*ea/4)

	// 16 damage, 0.35 AP vs 1.0 armor (flak vest sharp)
	// effectiveArmor = max(1.0 - 0.35, 0) = 0.65
	// expected = 16 * (1 - 3*0.65/4) = 16 * (1 - 0.4875) = 16 * 0.5125 = 8.2
	expected := ArmorExpectedDamage(16, 0.35, 1.0)
	approx(t, "16 dmg vs 1.0 armor", expected, 8.2)

	// Full penetration: armor 0, AP anything
	expected = ArmorExpectedDamage(20, 0.5, 0)
	approx(t, "unarmored", expected, 20.0)

	// AP exceeds armor: full damage
	expected = ArmorExpectedDamage(16, 0.5, 0.3)
	approx(t, "AP > armor", expected, 16.0)
}
