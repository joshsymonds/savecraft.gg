// Package calc provides shared computation utilities for RimWorld reference modules.
package calc

// Quality levels match RimWorld's QualityCategory enum.
const (
	QualityAwful      = iota // 0
	QualityPoor              // 1
	QualityNormal            // 2
	QualityGood              // 3
	QualityExcellent         // 4
	QualityMasterwork        // 5
	QualityLegendary         // 6
)

// RestFraction is the fraction of a day that plants actively grow.
// Plants rest from hour 19 to hour 5 (10 hours rest, 14 hours active).
// 14/24 = 7/12 ~ 0.5833
const RestFraction = 7.0 / 12.0

// EvaluateCurve does linear interpolation on a SimpleCurve.
// Points must be sorted by x. Values outside the range are clamped to the
// nearest endpoint (matching RimWorld's SimpleCurve.Evaluate behavior).
func EvaluateCurve(x float64, points [][2]float64) float64 {
	if len(points) == 0 {
		return 0
	}
	if x <= points[0][0] {
		return points[0][1]
	}
	last := len(points) - 1
	if x >= points[last][0] {
		return points[last][1]
	}
	for i := 1; i < len(points); i++ {
		if x <= points[i][0] {
			x0, y0 := points[i-1][0], points[i-1][1]
			x1, y1 := points[i][0], points[i][1]
			t := (x - x0) / (x1 - x0)
			return y0 + t*(y1-y0)
		}
	}
	return points[last][1]
}

// TemperatureFactor computes the temperature growth rate multiplier.
// From Plant.cs GrowthRateFactor_Temperature:
//
//	temp < 0  -> 0, 0-10 -> linear, 10-42 -> 1.0, 42-58 -> linear, >58 -> 0
func TemperatureFactor(temp float64) float64 {
	if temp < 0 {
		return 0
	}
	if temp < 10 {
		return temp / 10.0
	}
	if temp <= 42 {
		return 1.0
	}
	if temp < 58 {
		return (58.0 - temp) / 16.0
	}
	return 0
}

// OutdoorsFactor returns the surgery/stat penalty for being outdoors.
func OutdoorsFactor(outdoors bool) float64 {
	if outdoors {
		return 0.85
	}
	return 1.0
}
