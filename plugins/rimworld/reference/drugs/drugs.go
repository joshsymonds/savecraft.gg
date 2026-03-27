// Package drugs implements the RimWorld drug economy and addiction analyzer.
//
// Computes silver/day for drug production chains (crop -> processed drug),
// addiction probability per dose, and safe use intervals.
package drugs

import "github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/calc"

// RestFraction is the plant growth active fraction (14/24 hours).
const RestFraction = 7.0 / 12.0

// ProductionParams contains inputs for drug production chain calculation.
type ProductionParams struct {
	CropGrowDays         float64 // Plant grow days
	CropYield            float64 // Leaves per harvest
	FertilitySensitivity float64 // Crop fertility sensitivity
	SoilFertility        float64 // Soil fertility value
	Temperature          float64 // Average temperature
	LeavesPerDrug        float64 // Raw material per drug unit
	DrugMarketValue      float64 // Silver value per drug
	DrugWorkAmount       float64 // Work ticks to craft one drug
}

// ProductionResult contains computed drug production metrics.
type ProductionResult struct {
	SilverPerDayPerTile float64
	DrugsPerDayPerTile  float64
	LeavesPerDay        float64
	ActualGrowDays      float64
}

// ProductionChain computes the silver/day/tile for a drug production chain.
func ProductionChain(p ProductionParams) ProductionResult {
	fertFactor := p.SoilFertility*p.FertilitySensitivity + (1 - p.FertilitySensitivity)
	tempFactor := calc.TemperatureFactor(p.Temperature)
	growthRate := fertFactor * tempFactor

	if growthRate <= 0 || p.CropGrowDays <= 0 {
		return ProductionResult{}
	}

	actualDays := p.CropGrowDays / (growthRate * RestFraction)
	leavesPerDay := p.CropYield / actualDays

	drugsPerDay := 0.0
	if p.LeavesPerDrug > 0 {
		drugsPerDay = leavesPerDay / p.LeavesPerDrug
	}

	return ProductionResult{
		SilverPerDayPerTile: drugsPerDay * p.DrugMarketValue,
		DrugsPerDayPerTile:  drugsPerDay,
		LeavesPerDay:        leavesPerDay,
		ActualGrowDays:      actualDays,
	}
}

// SilverPerLeaf computes the silver yield per raw material unit.
func SilverPerLeaf(drugValue, leavesPerDrug float64) float64 {
	if leavesPerDrug <= 0 {
		return 0
	}
	return drugValue / leavesPerDrug
}

// SilverPerWork computes the silver yield per work tick of crafting.
func SilverPerWork(drugValue, workAmount float64) float64 {
	if workAmount <= 0 {
		return 0
	}
	return drugValue / workAmount
}
