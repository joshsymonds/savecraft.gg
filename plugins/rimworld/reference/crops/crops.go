// Package crops implements the RimWorld crop production calculator.
//
// Growth rate formula from Plant.cs:
//
//	GrowthRate = FertilityFactor x TemperatureFactor x LightFactor
//	GrowthPerTick = 1 / (60000 x growDays) x GrowthRate
//
// Plants rest when Resting (hour 19-05, 10 hours). Active 14 hours = 35000 ticks.
// Effective growth per day = GrowthPerTick x 35000 = GrowthRate x 7/12 / growDays
// Actual calendar days to maturity = growDays / (GrowthRate x 7/12)
package crops

import "github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/calc"

// NutritionPerColonistPerDay is the standard daily nutrition need for a colonist.
const NutritionPerColonistPerDay = 1.6

// CropParams contains all inputs to the crop production calculation.
type CropParams struct {
	GrowDays             float64 // Base grow days from plant def
	HarvestYield         float64 // Units harvested per plant
	NutritionPerUnit     float64 // Nutrition per harvested unit
	MarketValuePerUnit   float64 // Silver value per harvested unit
	FertilitySensitivity float64 // Plant's fertility sensitivity (0-1)
	SoilFertility        float64 // Soil fertility value (0.7 gravel, 1.0 soil, 1.4 rich)
	Temperature          float64 // Average temperature in C
}

// CropResult contains computed production metrics for a crop.
type CropResult struct {
	GrowthRate      float64 // Effective growth rate multiplier
	ActualGrowDays  float64 // Calendar days to maturity (0 if cannot grow)
	NutritionPerDay float64 // Nutrition produced per day per tile
	SilverPerDay    float64 // Silver value produced per day per tile
}

// Calculate computes crop production metrics.
func Calculate(p CropParams) CropResult {
	fertFactor := FertilityFactor(p.SoilFertility, p.FertilitySensitivity)
	tempFactor := calc.TemperatureFactor(p.Temperature)
	growthRate := fertFactor * tempFactor

	if growthRate <= 0 || p.GrowDays <= 0 {
		return CropResult{}
	}

	actualDays := p.GrowDays / (growthRate * calc.RestFraction)
	totalNutrition := p.HarvestYield * p.NutritionPerUnit
	totalSilver := p.HarvestYield * p.MarketValuePerUnit

	return CropResult{
		GrowthRate:      growthRate,
		ActualGrowDays:  actualDays,
		NutritionPerDay: totalNutrition / actualDays,
		SilverPerDay:    totalSilver / actualDays,
	}
}

// TilesPerColonist computes how many growing tiles are needed to feed
// the given number of colonists at standard nutrition requirements.
func TilesPerColonist(nutritionPerDayPerTile float64, colonists int) float64 {
	if nutritionPerDayPerTile <= 0 {
		return 0
	}
	return float64(colonists) * NutritionPerColonistPerDay / nutritionPerDayPerTile
}

// FertilityFactor computes the fertility growth rate multiplier.
// From Plant.cs GrowthRateFactor_Fertility:
//
//	soilFertility x sensitivity + (1 - sensitivity)
func FertilityFactor(soilFertility, sensitivity float64) float64 {
	return soilFertility*sensitivity + (1 - sensitivity)
}
