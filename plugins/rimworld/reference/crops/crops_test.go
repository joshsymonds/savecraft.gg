package crops

import (
	"math"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/calc"
)

const tolerance = 0.001

func approx(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > tolerance {
		t.Errorf("%s = %.4f, want %.4f", name, got, want)
	}
}

func TestTemperatureFactor(t *testing.T) {
	// From Plant.cs GrowthRateFactor_Temperature:
	// <0C -> 0, 0-10C linear to 1, 10-42C -> 1, 42-58C linear to 0, >58C -> 0
	approx(t, "below zero", calc.TemperatureFactor(-5), 0)
	approx(t, "zero", calc.TemperatureFactor(0), 0)
	approx(t, "5C", calc.TemperatureFactor(5), 0.5)
	approx(t, "10C", calc.TemperatureFactor(10), 1.0)
	approx(t, "25C optimal", calc.TemperatureFactor(25), 1.0)
	approx(t, "42C", calc.TemperatureFactor(42), 1.0)
	approx(t, "50C", calc.TemperatureFactor(50), 0.5)
	approx(t, "58C", calc.TemperatureFactor(58), 0)
	approx(t, "above 58", calc.TemperatureFactor(65), 0)
}

func TestFertilityFactor(t *testing.T) {
	// From Plant.cs: fertility * sensitivity + (1 - sensitivity)
	// Rice: sensitivity 1.0 (default from PlantBaseNonEdible)
	approx(t, "rice normal soil", FertilityFactor(1.0, 1.0), 1.0)
	approx(t, "rice rich soil", FertilityFactor(1.4, 1.0), 1.4)
	approx(t, "rice gravel", FertilityFactor(0.7, 1.0), 0.7)

	// Potatoes: sensitivity 0.4
	approx(t, "potato normal soil", FertilityFactor(1.0, 0.4), 1.0)
	approx(t, "potato rich soil", FertilityFactor(1.4, 0.4), 1.16)
	approx(t, "potato gravel", FertilityFactor(0.7, 0.4), 0.88)
}

func TestRestFractionAppliedToGrowth(t *testing.T) {
	// Verify that the rest fraction correctly lengthens actual grow days.
	// A crop with growDays=3 at optimal conditions (growthRate=1.0) should take
	// 3.0 / (1.0 * 7/12) = 36/7 ~ 5.143 actual calendar days.
	result := Calculate(CropParams{
		GrowDays:             3,
		HarvestYield:         6,
		NutritionPerUnit:     0.05,
		MarketValuePerUnit:   1.1,
		FertilitySensitivity: 1.0,
		SoilFertility:        1.0,
		Temperature:          20, // optimal
	})

	// Without rest fraction, actual days would equal grow days (3.0).
	// With rest fraction, actual days = 3.0 / (7/12) ~ 5.143.
	wantActualDays := 3.0 / calc.RestFraction
	approx(t, "actual grow days with rest fraction", result.ActualGrowDays, wantActualDays)

	// The rest fraction should make actual days ~1.714x longer than base grow days
	ratio := result.ActualGrowDays / 3.0
	approx(t, "rest elongation ratio", ratio, 12.0/7.0)
}

func TestCalculateRice(t *testing.T) {
	// Rice: growDays=3, harvestYield=6, nutrition per unit=0.05, sensitivity=1.0
	result := Calculate(CropParams{
		GrowDays:             3,
		HarvestYield:         6,
		NutritionPerUnit:     0.05,
		MarketValuePerUnit:   1.1,
		FertilitySensitivity: 1.0,
		SoilFertility:        1.0, // normal soil
		Temperature:          20,  // optimal
	})

	// Actual grow days = growDays / (growthRate * restFraction)
	// growthRate = fertilityFactor(1.0, 1.0) * tempFactor(20) = 1.0 * 1.0 = 1.0
	// actualDays = 3 / (1.0 * 7/12) = 3 * 12/7 ~ 5.143
	wantActualDays := 3.0 / (1.0 * 7.0 / 12.0)
	approx(t, "actual grow days", result.ActualGrowDays, wantActualDays)

	// Total nutrition per harvest = 6 * 0.05 = 0.30
	// Nutrition per day = 0.30 / actualDays ~ 0.0583
	wantNutritionPerDay := (6 * 0.05) / wantActualDays
	approx(t, "nutrition/day/tile", result.NutritionPerDay, wantNutritionPerDay)
}

func TestCalculatePotatoOnGravel(t *testing.T) {
	// Potatoes: growDays=5.8, yield=11, nutrition=0.05, sensitivity=0.4
	// Gravel: fertility=0.7
	result := Calculate(CropParams{
		GrowDays:             5.8,
		HarvestYield:         11,
		NutritionPerUnit:     0.05,
		MarketValuePerUnit:   1.1,
		FertilitySensitivity: 0.4,
		SoilFertility:        0.7,
		Temperature:          20,
	})

	// fertilityFactor = 0.7 * 0.4 + (1 - 0.4) = 0.28 + 0.6 = 0.88
	// growthRate = 0.88 * 1.0 = 0.88
	// actualDays = 5.8 / (0.88 * 7/12) = 5.8 / 0.5133 ~ 11.299
	growthRate := 0.88
	wantActualDays := 5.8 / (growthRate * 7.0 / 12.0)
	approx(t, "actual grow days", result.ActualGrowDays, wantActualDays)

	// nutrition/day = (11 * 0.05) / actualDays
	wantNutrition := (11 * 0.05) / wantActualDays
	approx(t, "nutrition/day/tile", result.NutritionPerDay, wantNutrition)
}

func TestCalculateColdTemperature(t *testing.T) {
	// At 5C, temperature factor is 0.5 -- growth is halved
	result := Calculate(CropParams{
		GrowDays:             3,
		HarvestYield:         6,
		NutritionPerUnit:     0.05,
		MarketValuePerUnit:   1.1,
		FertilitySensitivity: 1.0,
		SoilFertility:        1.0,
		Temperature:          5,
	})

	growthRate := 0.5 // temp factor at 5C
	wantActualDays := 3.0 / (growthRate * 7.0 / 12.0)
	approx(t, "actual grow days at 5C", result.ActualGrowDays, wantActualDays)
}

func TestCalculateZeroTemperature(t *testing.T) {
	// At 0C, growth stops -- should return zero nutrition/day
	result := Calculate(CropParams{
		GrowDays:             3,
		HarvestYield:         6,
		NutritionPerUnit:     0.05,
		MarketValuePerUnit:   1.1,
		FertilitySensitivity: 1.0,
		SoilFertility:        1.0,
		Temperature:          0,
	})

	if result.NutritionPerDay != 0 {
		t.Errorf("nutrition/day at 0C = %.4f, want 0", result.NutritionPerDay)
	}
	if result.ActualGrowDays != 0 {
		t.Errorf("actual grow days at 0C = %.4f, want 0 (cannot grow)", result.ActualGrowDays)
	}
}

func TestTilesNeeded(t *testing.T) {
	// A colonist needs 1.6 nutrition/day (standard)
	// If rice produces ~0.0583 nutrition/day/tile on normal soil at optimal temp,
	// tiles needed = 1.6 / 0.0583 ~ 27.4
	result := Calculate(CropParams{
		GrowDays:             3,
		HarvestYield:         6,
		NutritionPerUnit:     0.05,
		MarketValuePerUnit:   1.1,
		FertilitySensitivity: 1.0,
		SoilFertility:        1.0,
		Temperature:          20,
	})

	tiles := TilesPerColonist(result.NutritionPerDay, 1)
	if tiles < 25 || tiles > 30 {
		t.Errorf("tiles per colonist for rice = %.1f, expected 25-30 range", tiles)
	}
}

func TestSilverPerDay(t *testing.T) {
	result := Calculate(CropParams{
		GrowDays:             3,
		HarvestYield:         6,
		NutritionPerUnit:     0.05,
		MarketValuePerUnit:   1.1,
		FertilitySensitivity: 1.0,
		SoilFertility:        1.0,
		Temperature:          20,
	})

	// silver/day = yield * marketValue / actualDays = 6 * 1.1 / actualDays
	wantSilver := (6 * 1.1) / result.ActualGrowDays
	approx(t, "silver/day/tile", result.SilverPerDay, wantSilver)
}
