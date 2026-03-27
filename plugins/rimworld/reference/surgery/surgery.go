// Package surgery implements the RimWorld surgery success chance calculator.
//
// The formula comes from RimWorld's Recipe_Surgery.CheckSurgeryFail method:
//
//	chance = surgeonStat * bedEffectiveFactor * medicineFactor * difficulty
//	if inspired: chance *= 2.0
//	chance = min(chance, 0.98)
//
// where bedEffectiveFactor = bedBaseFactor * qualityFactor * cleanlinessFactor * glowFactor * outdoorsFactor
package surgery

import "github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/calc"

// Quality aliases for backward compatibility with existing callers.
const (
	QualityAwful      = calc.QualityAwful
	QualityPoor       = calc.QualityPoor
	QualityNormal     = calc.QualityNormal
	QualityGood       = calc.QualityGood
	QualityExcellent  = calc.QualityExcellent
	QualityMasterwork = calc.QualityMasterwork
	QualityLegendary  = calc.QualityLegendary
)

const maxSuccessChance = 0.98

// Params contains all inputs to the surgery success calculation.
type Params struct {
	MedicalSkill    int     // Medicine skill level (0-20)
	Manipulation    float64 // Manipulation capacity (0-1+, 1.0 = healthy)
	Sight           float64 // Sight capacity (0-1+, 1.0 = healthy)
	BedFactor       float64 // Bed's base SurgerySuccessChanceFactor
	Quality         int     // Bed quality (QualityAwful through QualityLegendary)
	Cleanliness     float64 // Room cleanliness stat (-5 to +5)
	GlowLevel       float64 // Light level (0 to 1)
	IsOutdoors      bool    // Whether the surgery location is outdoors
	MedicinePotency float64 // Medicine's MedicalPotency stat (0=none, 0.6=herbal, 1.0=industrial, 1.6=glitterworld)
	Difficulty      float64 // Recipe's surgerySuccessChanceFactor (1.0 = standard)
	Inspired        bool    // Whether the surgeon has Inspired Surgery
}

// Result contains the calculated success chance and factor breakdown.
type Result struct {
	SuccessChance      float64 // Final clamped success probability (0 to 0.98)
	SurgeonFactor      float64 // Surgeon's MedicalSurgerySuccessChance stat
	BedEffectiveFactor float64 // Bed factor × quality × cleanliness × glow × outdoors
	MedicineFactor     float64 // Medicine potency curve factor
	DifficultyFactor   float64 // Operation difficulty multiplier
	InspiredFactor     float64 // 2.0 if inspired, 1.0 otherwise
	Uncapped           float64 // Product before 98% clamp
	Capped             bool    // Whether the result was clamped
}

// Calculate computes the surgery success chance from the given parameters.
func Calculate(p Params) Result {
	surgeonFactor := surgeonStat(p.MedicalSkill, p.Manipulation, p.Sight)
	bedEffective := p.BedFactor * QualityFactor(p.Quality) * CleanlinessFactor(p.Cleanliness) * GlowFactor(p.GlowLevel) * outdoorsFactor(p.IsOutdoors)
	medicineFactor := MedicinePotencyFactor(p.MedicinePotency)
	inspiredFactor := 1.0
	if p.Inspired {
		inspiredFactor = 2.0
	}

	uncapped := surgeonFactor * bedEffective * medicineFactor * p.Difficulty * inspiredFactor
	capped := uncapped > maxSuccessChance
	successChance := uncapped
	if capped {
		successChance = maxSuccessChance
	}

	return Result{
		SuccessChance:      successChance,
		SurgeonFactor:      surgeonFactor,
		BedEffectiveFactor: bedEffective,
		MedicineFactor:     medicineFactor,
		DifficultyFactor:   p.Difficulty,
		InspiredFactor:     inspiredFactor,
		Uncapped:           uncapped,
		Capped:             capped,
	}
}

// surgeonStat computes the MedicalSurgerySuccessChance stat value.
// Formula: defaultBaseValue (1.0) * skillFactor * manipulationFactor * sightFactor
//
// Capacity factors from StatDef XML:
//   - Manipulation: weight 1, no max
//   - Sight: weight 0.4, max 1
//
// The capacity factor formula is: Lerp(1, capacity, weight), clamped to max if set.
// For weight 1: factor = capacity
// For weight 0.4, max 1: factor = min(Lerp(1, capacity, 0.4), 1) = min(1 + 0.4*(capacity-1), 1)
func surgeonStat(skill int, manipulation, sight float64) float64 {
	base := 1.0
	skillFactor := MedicalSkillFactor(skill)
	manipFactor := manipulation // weight 1, no max
	sightFactor := 1.0 + 0.4*(sight-1.0)
	if sightFactor > 1.0 {
		sightFactor = 1.0 // max 1
	}
	result := base * skillFactor * manipFactor * sightFactor
	if result < 0.01 { // minValue from StatDef
		result = 0.01
	}
	return result
}

// MedicalSkillFactor returns the skill factor from the valuesPerLevel table.
// Skill levels 0-20 map to specific factors from the StatDef XML.
func MedicalSkillFactor(skill int) float64 {
	// From MedicalSurgerySuccessChance StatDef, skillNeedFactors valuesPerLevel
	// Index 0 = skill level 0, index 20 = skill level 20
	values := [21]float64{
		0.10, 0.20, 0.30, 0.40, 0.50, // 0-4
		0.60, 0.70, 0.75, 0.80, 0.85, // 5-9
		0.90, 0.92, 0.94, 0.96, 0.98, // 10-14
		1.00, 1.02, 1.04, 1.06, 1.08, // 15-19
		1.10, // 20
	}
	if skill < 0 {
		return values[0]
	}
	if skill > 20 {
		return values[20]
	}
	return values[skill]
}

// MedicinePotencyFactor evaluates the MedicineMedicalPotencyToSurgeryChanceFactor curve.
// SimpleCurve points: (0, 0.7), (1, 1.0), (2, 1.3)
func MedicinePotencyFactor(potency float64) float64 {
	return calc.EvaluateCurve(potency, [][2]float64{
		{0, 0.7},
		{1, 1.0},
		{2, 1.3},
	})
}

// CleanlinessFactor evaluates the room cleanliness → surgery success curve.
// SimpleCurve points: (-5, 0.6), (0, 1.0), (1, 1.10), (5, 1.15)
func CleanlinessFactor(cleanliness float64) float64 {
	return calc.EvaluateCurve(cleanliness, [][2]float64{
		{-5, 0.6},
		{0, 1.0},
		{1, 1.10},
		{5, 1.15},
	})
}

// GlowFactor evaluates the light level → surgery success curve.
// SimpleCurve points: (0, 0.75), (0.5, 1.0)
func GlowFactor(glow float64) float64 {
	return calc.EvaluateCurve(glow, [][2]float64{
		{0, 0.75},
		{0.5, 1.0},
	})
}

// QualityFactor returns the quality multiplier for the bed's surgery stat.
// From StatPart_Quality in the SurgerySuccessChanceFactor StatDef.
func QualityFactor(quality int) float64 {
	factors := [7]float64{0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.30}
	if quality < 0 {
		return factors[0]
	}
	if quality > 6 {
		return factors[6]
	}
	return factors[quality]
}

func outdoorsFactor(outdoors bool) float64 {
	if outdoors {
		return 0.85
	}
	return 1.0
}

