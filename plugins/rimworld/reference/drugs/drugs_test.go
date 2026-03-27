package drugs

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

func TestFlakeVsYayoPerLeaf(t *testing.T) {
	// Flake: 4 leaves → 1 flake @ 14 silver = 3.50 silver/leaf
	// Yayo: 8 leaves → 1 yayo @ 21 silver = 2.625 silver/leaf
	// Flake yields 33% more silver per leaf
	flakePerLeaf := SilverPerLeaf(14, 4)
	yayoPerLeaf := SilverPerLeaf(21, 8)
	approx(t, "flake silver/leaf", flakePerLeaf, 3.50)
	approx(t, "yayo silver/leaf", yayoPerLeaf, 2.625)
	if flakePerLeaf <= yayoPerLeaf {
		t.Error("flake should yield more silver per leaf than yayo")
	}
}

func TestFlakeVsYayoPerWorkTick(t *testing.T) {
	// Flake: 14 silver / 250 work = 0.056 silver/work
	// Yayo: 21 silver / 350 work = 0.060 silver/work
	// Yayo yields ~7% more silver per work tick
	flakePerWork := SilverPerWork(14, 250)
	yayoPerWork := SilverPerWork(21, 350)
	approx(t, "flake silver/work", flakePerWork, 0.056)
	approx(t, "yayo silver/work", yayoPerWork, 0.060)
	if yayoPerWork <= flakePerWork {
		t.Error("yayo should yield more silver per work tick than flake")
	}
}

func TestProductionChainSilverPerDay(t *testing.T) {
	// Psychoid plant: growDays=9.0, yield=8 leaves, sensitivity=0.4
	// On normal soil at optimal temp:
	// growthRate = 1.0*0.4 + (1-0.4) = 1.0 (sensitivity doesn't change on fertility 1.0)
	// actualDays = 9.0 / (1.0 * 7/12) = 15.43 days
	// Leaves per day per tile = 8 / 15.43 = 0.5185
	// Flake: 4 leaves per flake, so flake/day = 0.5185/4 = 0.1296
	// Silver/day = 0.1296 * 14 = 1.815

	result := ProductionChain(ProductionParams{
		CropGrowDays:         9.0,
		CropYield:            8,
		FertilitySensitivity: 0.4,
		SoilFertility:        1.0,
		Temperature:          20,
		LeavesPerDrug:        4,
		DrugMarketValue:      14,
		DrugWorkAmount:       250,
	})

	if result.SilverPerDayPerTile < 1.5 || result.SilverPerDayPerTile > 2.0 {
		t.Errorf("flake silver/day/tile = %.3f, expected ~1.815", result.SilverPerDayPerTile)
	}
}

func TestAddictionRisk(t *testing.T) {
	// Flake addictiveness: 0.05 (5% per dose)
	// Yayo addictiveness: 0.01 (1% per dose)
	// Safe if tolerance below minToleranceToAddict (flake has none, yayo has none)
	// These are the base rates before tolerance modifiers

	flake := DrugRisk{Addictiveness: 0.05}
	yayo := DrugRisk{Addictiveness: 0.01}

	if flake.Addictiveness <= yayo.Addictiveness {
		t.Error("flake should be more addictive than yayo")
	}
}

func TestSilverPerLeaf(t *testing.T) {
	approx(t, "zero leaves", SilverPerLeaf(10, 0), 0)
}
