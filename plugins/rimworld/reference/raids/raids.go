// Package raids implements the RimWorld colony wealth → raid threat calculator.
//
// Formulas from StorytellerUtility.cs DefaultThreatPointsNow:
//
//	totalWealth = itemWealth + buildingWealth × 0.5
//	wealthPoints = PointsPerWealthCurve.Evaluate(totalWealth)
//	pawnPoints = colonists × PointsPerColonistByWealthCurve.Evaluate(totalWealth)
//	totalPoints = clamp(wealthPoints + pawnPoints, 35, 10000)
package raids

import "github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/calc"

const (
	buildingWealthFactor = 0.5
	globalPointsMin      = 35.0
	globalPointsMax      = 10000.0
)

// RaidParams contains inputs for raid threat calculation.
type RaidParams struct {
	ItemWealth     float64 // Total item wealth (full value)
	BuildingWealth float64 // Total building wealth (counted at 50%)
	Colonists      int     // Number of free colonists
}

// RaidResult contains the calculated raid threat.
type RaidResult struct {
	TotalWealth  float64
	WealthPoints float64
	PawnPoints   float64
	TotalPoints  float64
}

// Calculate computes the expected raid points for the given colony state.
func Calculate(p RaidParams) RaidResult {
	totalWealth := TotalWealth(p.ItemWealth, p.BuildingWealth)
	wealthPts := WealthToRaidPoints(totalWealth)
	pawnPts := PawnPoints(totalWealth) * float64(p.Colonists)
	total := wealthPts + pawnPts
	if total < globalPointsMin {
		total = globalPointsMin
	}
	if total > globalPointsMax {
		total = globalPointsMax
	}
	return RaidResult{
		TotalWealth:  totalWealth,
		WealthPoints: wealthPts,
		PawnPoints:   pawnPts,
		TotalPoints:  total,
	}
}

// TotalWealth computes the effective colony wealth.
// Buildings count at 50% of their market value.
func TotalWealth(itemWealth, buildingWealth float64) float64 {
	return itemWealth + buildingWealth*buildingWealthFactor
}

// WealthToRaidPoints evaluates the PointsPerWealthCurve.
// Curve: (0,0), (14000,0), (400000,2400), (700000,3600), (1000000,4200)
func WealthToRaidPoints(wealth float64) float64 {
	return calc.EvaluateCurve(wealth, [][2]float64{
		{0, 0},
		{14000, 0},
		{400000, 2400},
		{700000, 3600},
		{1000000, 4200},
	})
}

// PawnPoints evaluates the PointsPerColonistByWealthCurve for a single colonist.
// Curve: (0,15), (10000,15), (400000,140), (1000000,200)
func PawnPoints(wealth float64) float64 {
	return calc.EvaluateCurve(wealth, [][2]float64{
		{0, 15},
		{10000, 15},
		{400000, 140},
		{1000000, 200},
	})
}
