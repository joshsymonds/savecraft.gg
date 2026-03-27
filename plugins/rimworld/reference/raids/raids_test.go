package raids

import (
	"math"
	"testing"
)

const tolerance = 1.0 // raid points are large integers, allow ±1

func approx(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > tolerance {
		t.Errorf("%s = %.1f, want %.1f", name, got, want)
	}
}

func TestWealthToRaidPoints(t *testing.T) {
	// From StorytellerUtility.cs PointsPerWealthCurve:
	// (0, 0), (14000, 0), (400000, 2400), (700000, 3600), (1000000, 4200)
	approx(t, "0 wealth", WealthToRaidPoints(0), 0)
	approx(t, "14k wealth", WealthToRaidPoints(14000), 0)
	approx(t, "207k wealth", WealthToRaidPoints(207000), 1200) // midpoint 14k→400k
	approx(t, "400k wealth", WealthToRaidPoints(400000), 2400)
	approx(t, "700k wealth", WealthToRaidPoints(700000), 3600)
	approx(t, "1M wealth", WealthToRaidPoints(1000000), 4200)
	approx(t, "2M wealth", WealthToRaidPoints(2000000), 4200) // capped
}

func TestPawnPoints(t *testing.T) {
	// From PointsPerColonistByWealthCurve:
	// (0, 15), (10000, 15), (400000, 140), (1000000, 200)
	approx(t, "pawn at 0 wealth", PawnPoints(0), 15)
	approx(t, "pawn at 10k wealth", PawnPoints(10000), 15)
	approx(t, "pawn at 400k wealth", PawnPoints(400000), 140)
	approx(t, "pawn at 1M wealth", PawnPoints(1000000), 200)
}

func TestBuildingWealthFactor(t *testing.T) {
	// Buildings count at 50% of their market value
	// Total wealth = itemWealth + buildingWealth * 0.5
	total := TotalWealth(100000, 50000)
	if total != 125000 {
		t.Errorf("total wealth = %.0f, want 125000", total)
	}
}

func TestCalculateRaid(t *testing.T) {
	result := Calculate(RaidParams{
		ItemWealth:     200000,
		BuildingWealth: 100000,
		Colonists:      8,
	})

	// Total wealth = 200000 + 100000*0.5 = 250000
	// Wealth points from curve: interpolate between (14000,0) and (400000,2400)
	// t = (250000-14000)/(400000-14000) = 236000/386000 ≈ 0.6114
	// wealthPoints = 0 + 0.6114 * 2400 ≈ 1467
	// Pawn points at 250k: interpolate (10000,15)→(400000,140)
	// t = (250000-10000)/(400000-10000) = 240000/390000 ≈ 0.6154
	// pawnPts = 15 + 0.6154*125 ≈ 91.9 per colonist
	// Total pawn points = 91.9 * 8 ≈ 735
	// Total raid points = 1467 + 735 ≈ 2202, clamped to [35, 10000]

	if result.TotalPoints < 2000 || result.TotalPoints > 2400 {
		t.Errorf("total raid points = %.0f, expected ~2200", result.TotalPoints)
	}
	if result.WealthPoints < 1400 || result.WealthPoints > 1550 {
		t.Errorf("wealth points = %.0f, expected ~1467", result.WealthPoints)
	}
}
