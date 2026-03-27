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
	// Flake: 4 leaves -> 1 flake @ 14 silver = 3.50 silver/leaf
	// Yayo: 8 leaves -> 1 yayo @ 21 silver = 2.625 silver/leaf
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

func TestProductionChainZeroGrowDays(t *testing.T) {
	// Zero grow days should return zero result, not panic.
	result := ProductionChain(ProductionParams{
		CropGrowDays:         0,
		CropYield:            8,
		FertilitySensitivity: 0.4,
		SoilFertility:        1.0,
		Temperature:          20,
		LeavesPerDrug:        4,
		DrugMarketValue:      14,
		DrugWorkAmount:       250,
	})
	if result.SilverPerDayPerTile != 0 {
		t.Errorf("zero grow days: silver/day = %.4f, want 0", result.SilverPerDayPerTile)
	}
	if result.ActualGrowDays != 0 {
		t.Errorf("zero grow days: actual grow days = %.4f, want 0", result.ActualGrowDays)
	}
}

func TestSilverPerWorkEdgeCases(t *testing.T) {
	tests := []struct {
		name  string
		value float64
		work  float64
		want  float64
	}{
		{"zero work", 14, 0, 0},
		{"normal flake", 14, 250, 0.056},
		{"normal yayo", 21, 350, 0.060},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			approx(t, tc.name, SilverPerWork(tc.value, tc.work), tc.want)
		})
	}
}

func TestSilverPerLeaf(t *testing.T) {
	approx(t, "zero leaves", SilverPerLeaf(10, 0), 0)
}
