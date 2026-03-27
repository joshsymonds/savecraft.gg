package surgery

import (
	"math"
	"testing"
)

const tolerance = 0.001

func approx(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > tolerance {
		t.Errorf("%s = %.4f, want %.4f", name, got, want)
	}
}

func TestMedicalSkillFactor(t *testing.T) {
	// valuesPerLevel from StatDef XML (0-indexed: skill 0 -> 0.10, skill 15 -> 1.00)
	approx(t, "skill 0", MedicalSkillFactor(0), 0.10)
	approx(t, "skill 5", MedicalSkillFactor(5), 0.60)
	approx(t, "skill 10", MedicalSkillFactor(10), 0.90)
	approx(t, "skill 15", MedicalSkillFactor(15), 1.00)
	approx(t, "skill 20", MedicalSkillFactor(20), 1.10)
}

func TestMedicinePotencyCurve(t *testing.T) {
	// SimpleCurve: (0, 0.7), (1, 1.0), (2, 1.3) -- linear interpolation
	approx(t, "no medicine", MedicinePotencyFactor(0), 0.70)
	approx(t, "herbal (0.6)", MedicinePotencyFactor(0.6), 0.88)
	approx(t, "industrial (1.0)", MedicinePotencyFactor(1.0), 1.00)
	approx(t, "glitterworld (1.6)", MedicinePotencyFactor(1.6), 1.18)
}

func TestCleanlinessCurve(t *testing.T) {
	// SimpleCurve: (-5, 0.6), (0, 1.0), (1, 1.10), (5, 1.15)
	approx(t, "very dirty (-5)", CleanlinessFactor(-5), 0.60)
	approx(t, "clean (0)", CleanlinessFactor(0), 1.00)
	approx(t, "sterile tile (+0.6)", CleanlinessFactor(0.6), 1.06)
	approx(t, "max sterile (+1)", CleanlinessFactor(1), 1.10)
}

func TestQualityFactor(t *testing.T) {
	// From StatPart_Quality in SurgerySuccessChanceFactor StatDef
	approx(t, "awful", QualityFactor(QualityAwful), 0.90)
	approx(t, "poor", QualityFactor(QualityPoor), 0.95)
	approx(t, "normal", QualityFactor(QualityNormal), 1.00)
	approx(t, "good", QualityFactor(QualityGood), 1.05)
	approx(t, "excellent", QualityFactor(QualityExcellent), 1.10)
	approx(t, "masterwork", QualityFactor(QualityMasterwork), 1.15)
	approx(t, "legendary", QualityFactor(QualityLegendary), 1.30)
}

func TestGlowFactor(t *testing.T) {
	// SimpleCurve: (0, 0.75), (0.5, 1.0) -- clamped at 1.0 above 0.5
	approx(t, "darkness (0)", GlowFactor(0), 0.75)
	approx(t, "dim (0.25)", GlowFactor(0.25), 0.875)
	approx(t, "normal (0.5+)", GlowFactor(0.5), 1.00)
	approx(t, "bright (1.0)", GlowFactor(1.0), 1.00)
}

func TestSurgeryCalculation(t *testing.T) {
	tests := []struct {
		name   string
		params Params
		want   float64
	}{
		{
			name: "skill 14 surgeon, hospital bed, normal quality, industrial medicine, clean room",
			params: Params{
				MedicalSkill:    14,
				Manipulation:    1.0,
				Sight:           1.0,
				BedFactor:       1.1, // hospital bed
				Quality:         QualityNormal,
				Cleanliness:     0,
				GlowLevel:      1.0,
				IsOutdoors:      false,
				MedicinePotency: 1.0, // industrial
				Difficulty:      1.0, // standard operation
				Inspired:        false,
			},
			// surgeonStat = 0.98 (skill 14) * 1.0 (manipulation) * 1.0 (sight) = 0.98
			// bedFactor = 1.1 * 1.0 (normal quality) * 1.0 (cleanliness) * 1.0 (glow) * 1.0 (indoors) = 1.1
			// medicineFactor = 1.0
			// difficulty = 1.0
			// total = 0.98 * 1.1 * 1.0 * 1.0 = 1.078 -> capped at 0.98
			want: 0.98,
		},
		{
			name: "low skill surgeon, sleeping spot, herbal medicine, dirty room",
			params: Params{
				MedicalSkill:    4,
				Manipulation:    1.0,
				Sight:           1.0,
				BedFactor:       0.7, // sleeping spot
				Quality:         QualityNormal,
				Cleanliness:     -3,
				GlowLevel:      1.0,
				IsOutdoors:      false,
				MedicinePotency: 0.6, // herbal
				Difficulty:      1.0,
				Inspired:        false,
			},
			// surgeonStat = 0.50 * 1.0 * 1.0 = 0.50
			// cleanlinessFactor at -3: interpolate (-5,0.6)->(0,1.0): 0.6 + (2/5)*0.4 = 0.76
			// bedFactor = 0.7 * 1.0 (quality) * 0.76 (cleanliness) * 1.0 (glow) * 1.0 (indoors) = 0.532
			// medicineFactor at 0.6: interpolate (0,0.7)->(1,1.0): 0.7 + 0.6*0.3 = 0.88
			// total = 0.50 * 0.532 * 0.88 * 1.0 = 0.2341
			want: 0.2341,
		},
		{
			name: "98% cap with inspired surgery",
			params: Params{
				MedicalSkill:    20,
				Manipulation:    1.0,
				Sight:           1.0,
				BedFactor:       1.1,
				Quality:         QualityLegendary,
				Cleanliness:     1,
				GlowLevel:      1.0,
				IsOutdoors:      false,
				MedicinePotency: 1.6, // glitterworld
				Difficulty:      1.0,
				Inspired:        true,
			},
			// Even with everything maxed + inspired, capped at 0.98
			want: 0.98,
		},
		{
			name: "inspired doubles the pre-cap value",
			params: Params{
				MedicalSkill:    4,
				Manipulation:    1.0,
				Sight:           1.0,
				BedFactor:       0.7,
				Quality:         QualityNormal,
				Cleanliness:     0,
				GlowLevel:      1.0,
				IsOutdoors:      false,
				MedicinePotency: 1.0,
				Difficulty:      1.0,
				Inspired:        true,
			},
			// Without inspired: 0.50 * 0.7 * 1.0 * 1.0 * 1.0 * 1.0 = 0.35
			// With inspired: 0.35 * 2.0 = 0.70
			want: 0.70,
		},
		{
			name: "no medicine (potency 0)",
			params: Params{
				MedicalSkill:    10,
				Manipulation:    1.0,
				Sight:           1.0,
				BedFactor:       1.0,
				Quality:         QualityNormal,
				Cleanliness:     0,
				GlowLevel:      1.0,
				IsOutdoors:      false,
				MedicinePotency: 0,
				Difficulty:      1.0,
				Inspired:        false,
			},
			// surgeonStat = 0.90
			// bedFactor = 1.0
			// medicineFactor at 0 = 0.70
			// total = 0.90 * 1.0 * 0.70 * 1.0 = 0.63
			want: 0.63,
		},
		{
			name: "outdoors penalty",
			params: Params{
				MedicalSkill:    10,
				Manipulation:    1.0,
				Sight:           1.0,
				BedFactor:       1.0,
				Quality:         QualityNormal,
				Cleanliness:     0,
				GlowLevel:      1.0,
				IsOutdoors:      true,
				MedicinePotency: 1.0,
				Difficulty:      1.0,
				Inspired:        false,
			},
			// surgeonStat = 0.90
			// bedFactor = 1.0 * 1.0 * 1.0 * 1.0 * 0.85 (outdoors) = 0.85
			// total = 0.90 * 0.85 * 1.0 * 1.0 = 0.765
			want: 0.765,
		},
		{
			name: "impaired manipulation",
			params: Params{
				MedicalSkill:    15,
				Manipulation:    0.5, // one arm
				Sight:           1.0,
				BedFactor:       1.0,
				Quality:         QualityNormal,
				Cleanliness:     0,
				GlowLevel:      1.0,
				IsOutdoors:      false,
				MedicinePotency: 1.0,
				Difficulty:      1.0,
				Inspired:        false,
			},
			// surgeonStat = 1.0 (skill 15) * 0.5 (manipulation, weight 1) * 1.0 (sight capped at max 1) = 0.50
			// bedFactor = 1.0
			// total = 0.50 * 1.0 * 1.0 * 1.0 = 0.50
			want: 0.50,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Calculate(tt.params)
			approx(t, "success chance", result.SuccessChance, tt.want)
		})
	}
}

func TestSurgeryResultBreakdown(t *testing.T) {
	result := Calculate(Params{
		MedicalSkill:    10,
		Manipulation:    1.0,
		Sight:           1.0,
		BedFactor:       1.1,
		Quality:         QualityGood,
		Cleanliness:     0.6,
		GlowLevel:      1.0,
		IsOutdoors:      false,
		MedicinePotency: 1.0,
		Difficulty:      1.0,
		Inspired:        false,
	})

	// Surgeon factor: skill 10 = 0.90 * manipulation 1.0 * sight 1.0 = 0.90
	approx(t, "surgeon factor", result.SurgeonFactor, 0.90)

	// Bed effective: 1.1 (hospital) * 1.05 (good quality) * cleanliness(0.6) * 1.0 (glow) * 1.0 (indoors)
	// cleanliness(0.6): interpolate (0,1.0)->(1,1.10): 1.0 + 0.6*0.10 = 1.06
	// = 1.1 * 1.05 * 1.06 * 1.0 * 1.0 = 1.22430
	approx(t, "bed effective factor", result.BedEffectiveFactor, 1.1*1.05*1.06)

	// Medicine factor at potency 1.0 = 1.0
	approx(t, "medicine factor", result.MedicineFactor, 1.0)

	// Difficulty = 1.0
	approx(t, "difficulty factor", result.DifficultyFactor, 1.0)

	// Inspired factor = 1.0 (not inspired)
	approx(t, "inspired factor", result.InspiredFactor, 1.0)

	// Uncapped = 0.90 * 1.22430 * 1.0 * 1.0 * 1.0 = 1.10187
	approx(t, "uncapped", result.Uncapped, 0.90*1.1*1.05*1.06)

	if !result.Capped {
		t.Error("expected result to be capped at 98%")
	}
	approx(t, "success chance capped", result.SuccessChance, 0.98)
}
