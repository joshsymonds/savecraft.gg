package main

import (
	"testing"
)

// ─── Helpers ────────────────────────────────────────────────────────────────

func runPowerCalculator(t *testing.T, query string) map[string]any {
	t.Helper()
	result, code := runReference(t, query)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d; result: %v", code, result)
	}
	if result["type"] != "result" {
		t.Fatalf("expected type=result, got %v", result["type"])
	}
	return result["data"].(map[string]any)
}

func findSource(sources []any, typ string) map[string]any {
	for _, s := range sources {
		src := s.(map[string]any)
		if src["type"] == typ {
			return src
		}
	}
	return nil
}

// ─── Schema ─────────────────────────────────────────────────────────────────

func TestPowerCalculator_InSchema(t *testing.T) {
	result, code := runReference(t, "{}")
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)
	modules := data["modules"].(map[string]any)
	if _, ok := modules["power_calculator"]; !ok {
		t.Error("schema missing power_calculator module")
	}
}

// ─── Steam ──────────────────────────────────────────────────────────────────

func TestPowerCalculator_SteamCoal(t *testing.T) {
	// 1 offshore pump → 20 boilers → 40 steam engines
	// 40 steam engines * 900kW = 36 MW
	// Request 36 MW from steam with coal fuel.
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 36,
		"sources": [{"type": "steam", "fuel": "coal"}]
	}`)

	sources := data["sources"].([]any)
	if len(sources) != 1 {
		t.Fatalf("expected 1 source, got %d", len(sources))
	}

	steam := findSource(sources, "steam")
	if steam == nil {
		t.Fatal("expected steam source")
	}

	entities := steam["entities"].(map[string]any)
	approx(t, "offshore-pumps", entities["offshore-pump"].(float64), 1, 0)
	approx(t, "boilers", entities["boiler"].(float64), 20, 0)
	approx(t, "steam-engines", entities["steam-engine"].(float64), 40, 0)

	genMW := steam["generation_mw"].(float64)
	approx(t, "generation_mw", genMW, 36, 0.1)

	// Fuel consumption: each boiler burns 1.8MW of fuel.
	// Coal = 4MJ, so per boiler: 1.8MW / 4MJ = 0.45 coal/s = 27 coal/min.
	// 20 boilers = 540 coal/min.
	fuel := steam["fuel"].(map[string]any)
	fuelPerMin := fuel["fuel_per_min"].(float64)
	approx(t, "coal/min", fuelPerMin, 540, 1)

	// Total should match
	totalMW := data["total_generation_mw"].(float64)
	approx(t, "total_generation_mw", totalMW, 36, 0.1)
}

func TestPowerCalculator_SteamSolidFuel(t *testing.T) {
	// Same 36 MW but with solid fuel (12 MJ).
	// Per boiler: 1.8MW / 12MJ = 0.15 solid-fuel/s = 9 solid-fuel/min.
	// 20 boilers = 180 solid-fuel/min.
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 36,
		"sources": [{"type": "steam", "fuel": "solid-fuel"}]
	}`)

	sources := data["sources"].([]any)
	steam := findSource(sources, "steam")
	fuel := steam["fuel"].(map[string]any)
	approx(t, "solid-fuel/min", fuel["fuel_per_min"].(float64), 180, 1)
}

// ─── Solar ──────────────────────────────────────────────────────────────────

func TestPowerCalculator_Solar(t *testing.T) {
	// Solar panel average: 42kW. Accumulator ratio: 21 per 25 panels.
	// For 10 MW = 10000 kW: panels = ceil(10000/42) = 239 (238.095...)
	// Accumulators: floor(239 * 21/25) = 200 (200.76 → 201)
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 10,
		"sources": [{"type": "solar"}]
	}`)

	sources := data["sources"].([]any)
	solar := findSource(sources, "solar")
	if solar == nil {
		t.Fatal("expected solar source")
	}

	entities := solar["entities"].(map[string]any)
	panels := entities["solar-panel"].(float64)
	accumulators := entities["accumulator"].(float64)

	// ceil(10000/42) = 239
	if panels < 238 || panels > 240 {
		t.Errorf("expected ~239 panels, got %v", panels)
	}

	// 239 * 21/25 = 200.76 → ceil = 201
	if accumulators < 200 || accumulators > 202 {
		t.Errorf("expected ~201 accumulators, got %v", accumulators)
	}

	genMW := solar["generation_mw"].(float64)
	// 239 * 42kW / 1000 = 10.038 MW
	if genMW < 10 {
		t.Errorf("expected generation >= 10 MW, got %v", genMW)
	}
}

// ─── Nuclear ────────────────────────────────────────────────────────────────

func TestPowerCalculator_Nuclear2x2(t *testing.T) {
	// 2x2 layout: 4 reactors.
	// Adjacencies: each reactor has 2 neighbors (corner-connected 2x2 grid).
	// Per reactor: 40MW * (1+2) = 120MW thermal.
	// Total thermal: 4 * 120 = 480 MW.
	// Heat exchanger: each converts 10MW thermal → steam.
	// 480 / 10 = 48 heat exchangers.
	// Steam turbine: each 5.82 MW electrical from steam.
	// Turbine count: 48 * 10 / 5.82 = 82.47 → 83
	// Actual electrical: 48 * 10 = 480 MW thermal → same in electrical? No.
	// Each heat exchanger produces steam at 10MW thermal rate.
	// Each steam turbine consumes steam at 5.82MW rate.
	// So turbines = 48 * 10 / 5.82 = 82.47 → 83 turbines.
	// Electrical output = 83 * 5.82 = 483.06 MW ≈ 480 MW.
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 480,
		"sources": [{"type": "nuclear", "layout": "2x2"}]
	}`)

	sources := data["sources"].([]any)
	nuclear := findSource(sources, "nuclear")
	if nuclear == nil {
		t.Fatal("expected nuclear source")
	}

	entities := nuclear["entities"].(map[string]any)
	approx(t, "reactors", entities["nuclear-reactor"].(float64), 4, 0)
	approx(t, "heat-exchangers", entities["heat-exchanger"].(float64), 48, 0)

	// Turbines: 48 exchangers * 10MW / 5.82MW per turbine ≈ 83
	turbines := entities["steam-turbine"].(float64)
	if turbines < 82 || turbines > 84 {
		t.Errorf("expected ~83 turbines, got %v", turbines)
	}

	// Fuel consumption: 4 reactors * 1 fuel cell per 200s = 0.02 fuel cells/s = 1.2/min
	fuel := nuclear["fuel"].(map[string]any)
	fuelCellsPerMin := fuel["fuel_cells_per_min"].(float64)
	approx(t, "fuel_cells/min", fuelCellsPerMin, 1.2, 0.1)

	// Check generation is close to 480 MW
	genMW := nuclear["generation_mw"].(float64)
	if genMW < 478 || genMW > 485 {
		t.Errorf("expected ~480 MW, got %v", genMW)
	}
}

func TestPowerCalculator_Nuclear1x1(t *testing.T) {
	// 1x1: single reactor, 0 neighbors.
	// Thermal: 40 MW. Heat exchangers: 4. Turbines: 4*10/5.82 ≈ 7.
	// Electrical: ~40 MW.
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 40,
		"sources": [{"type": "nuclear", "layout": "1x1"}]
	}`)

	sources := data["sources"].([]any)
	nuclear := findSource(sources, "nuclear")
	entities := nuclear["entities"].(map[string]any)

	approx(t, "reactors", entities["nuclear-reactor"].(float64), 1, 0)
	approx(t, "heat-exchangers", entities["heat-exchanger"].(float64), 4, 0)

	turbines := entities["steam-turbine"].(float64)
	if turbines < 6 || turbines > 8 {
		t.Errorf("expected ~7 turbines, got %v", turbines)
	}
}

// ─── Mixed ──────────────────────────────────────────────────────────────────

func TestPowerCalculator_MixedNuclearSolar(t *testing.T) {
	// 500 MW total: nuclear 2x2 (480 MW) + solar fills remainder (20 MW).
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 500,
		"sources": [
			{"type": "nuclear", "layout": "2x2"},
			{"type": "solar"}
		]
	}`)

	sources := data["sources"].([]any)
	if len(sources) != 2 {
		t.Fatalf("expected 2 sources, got %d", len(sources))
	}

	nuclear := findSource(sources, "nuclear")
	solar := findSource(sources, "solar")

	if nuclear == nil {
		t.Fatal("expected nuclear source")
	}
	if solar == nil {
		t.Fatal("expected solar source")
	}

	// Nuclear should produce ~480 MW
	nuclearMW := nuclear["generation_mw"].(float64)
	if nuclearMW < 478 || nuclearMW > 485 {
		t.Errorf("expected nuclear ~480 MW, got %v", nuclearMW)
	}

	// Solar should fill the gap: 500 - nuclear generation.
	// Nuclear 2x2 produces ~483 MW (83 turbines * 5.82 MW), so solar ≈ 17 MW.
	solarMW := solar["generation_mw"].(float64)
	if solarMW < 15 || solarMW > 22 {
		t.Errorf("expected solar ~17 MW, got %v", solarMW)
	}

	// Total should cover target
	totalMW := data["total_generation_mw"].(float64)
	if totalMW < 500 {
		t.Errorf("expected total >= 500 MW, got %v", totalMW)
	}
}

// ─── Steam Fill ─────────────────────────────────────────────────────────────

func TestPowerCalculator_SteamFill(t *testing.T) {
	// Nuclear 1x1 (40 MW) + steam fills remainder to 76 MW = 36 MW of steam.
	// 36 MW steam = 40 engines, 20 boilers, 1 pump.
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 76,
		"sources": [
			{"type": "nuclear", "layout": "1x1"},
			{"type": "steam", "fuel": "coal"}
		]
	}`)

	sources := data["sources"].([]any)
	if len(sources) != 2 {
		t.Fatalf("expected 2 sources, got %d", len(sources))
	}

	nuclear := findSource(sources, "nuclear")
	steam := findSource(sources, "steam")
	if nuclear == nil {
		t.Fatal("expected nuclear source")
	}
	if steam == nil {
		t.Fatal("expected steam source")
	}

	// Nuclear 1x1 generates ~40 MW (7 turbines * 5.82 = 40.74).
	// Steam should fill the gap: 76 - ~40.74 = ~35.26 MW.
	// ceil(35260 / 900) = 40 engines, 20 boilers, 1 pump.
	steamMW := steam["generation_mw"].(float64)
	if steamMW < 34 || steamMW > 38 {
		t.Errorf("expected steam ~36 MW, got %v", steamMW)
	}

	totalMW := data["total_generation_mw"].(float64)
	if totalMW < 76 {
		t.Errorf("expected total >= 76 MW, got %v", totalMW)
	}
}

// ─── Existing Power ─────────────────────────────────────────────────────────

func TestPowerCalculator_ExistingPower(t *testing.T) {
	// Target 100 MW, existing factory generates 60 MW.
	// Should report deficit of 40 MW and plan sources for 100 MW total.
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 100,
		"sources": [{"type": "solar"}],
		"existing_power": {
			"surfaces": {
				"nauvis": {
					"generation_mw": 60,
					"consumption_mw": 55,
					"satisfaction": 1.09,
					"generators": {
						"steam-engine": {"count": 80, "mw": 60}
					}
				}
			}
		}
	}`)

	// Should have existing_mw and deficit_mw in output
	existingMW := data["existing_mw"].(float64)
	approx(t, "existing_mw", existingMW, 60, 0.1)

	deficitMW := data["deficit_mw"].(float64)
	approx(t, "deficit_mw", deficitMW, 40, 0.1)

	// Sources should still plan for the full target
	totalMW := data["total_generation_mw"].(float64)
	if totalMW < 100 {
		t.Errorf("expected total >= 100 MW, got %v", totalMW)
	}
}

// ─── 2xN Dynamic Layout ─────────────────────────────────────────────────────

func TestPowerCalculator_Nuclear2x6(t *testing.T) {
	// 2x6: 12 reactors. Corners (4) have 2 neighbors, interior (8) have 3.
	// Total thermal: 4*40*(1+2) + 8*40*(1+3) = 480 + 1280 = 1760 MW.
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 1760,
		"sources": [{"type": "nuclear", "layout": "2x6"}]
	}`)

	sources := data["sources"].([]any)
	nuclear := findSource(sources, "nuclear")
	if nuclear == nil {
		t.Fatal("expected nuclear source")
	}

	entities := nuclear["entities"].(map[string]any)
	approx(t, "reactors", entities["nuclear-reactor"].(float64), 12, 0)
	approx(t, "heat-exchangers", entities["heat-exchanger"].(float64), 176, 0)

	// Should have U-235 and uranium ore in fuel output
	fuel := nuclear["fuel"].(map[string]any)
	if _, ok := fuel["u235_per_min"]; !ok {
		t.Error("expected u235_per_min in fuel output")
	}
	if _, ok := fuel["uranium_ore_per_min"]; !ok {
		t.Error("expected uranium_ore_per_min in fuel output")
	}
}

// ─── 2x4 Layout (non-uniform adjacency) ────────────────────────────────────

func TestPowerCalculator_Nuclear2x4(t *testing.T) {
	// 2x4: 8 reactors. Adjacencies: [2,3,3,2,2,3,3,2]. Avg = 2.5.
	// Total thermal: 4*40*(1+2) + 4*40*(1+3) = 480 + 640 = 1120 MW.
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 1120,
		"sources": [{"type": "nuclear", "layout": "2x4"}]
	}`)

	sources := data["sources"].([]any)
	nuclear := findSource(sources, "nuclear")
	entities := nuclear["entities"].(map[string]any)

	approx(t, "reactors", entities["nuclear-reactor"].(float64), 8, 0)
	approx(t, "heat-exchangers", entities["heat-exchanger"].(float64), 112, 0)
}

// ─── Unknown Fuel Fallback ──────────────────────────────────────────────────

func TestPowerCalculator_UnknownFuelDefaultsToCoal(t *testing.T) {
	// Unknown fuel should silently default to coal.
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 36,
		"sources": [{"type": "steam", "fuel": "nonexistent-fuel"}]
	}`)

	sources := data["sources"].([]any)
	steam := findSource(sources, "steam")
	fuel := steam["fuel"].(map[string]any)

	// Should have defaulted to coal
	if fuel["type"] != "coal" {
		t.Errorf("expected fuel type 'coal', got %v", fuel["type"])
	}
	// Coal consumption should be same as explicit coal test: 540/min for 36MW
	approx(t, "coal/min", fuel["fuel_per_min"].(float64), 540, 1)
}

// ─── U-235 and Uranium Ore Output ───────────────────────────────────────────

func TestPowerCalculator_NuclearFuelOutput(t *testing.T) {
	// Verify nuclear includes u235_per_min and uranium_ore_per_min.
	// 2x2: 4 reactors, 1.2 fuel cells/min, 1.2 u235/min, ~171.6 ore/min.
	data := runPowerCalculator(t, `{
		"module": "power_calculator",
		"target_mw": 480,
		"sources": [{"type": "nuclear", "layout": "2x2"}]
	}`)

	sources := data["sources"].([]any)
	nuclear := findSource(sources, "nuclear")
	fuel := nuclear["fuel"].(map[string]any)

	fuelCells := fuel["fuel_cells_per_min"].(float64)
	u235 := fuel["u235_per_min"].(float64)
	orePerMin := fuel["uranium_ore_per_min"].(float64)

	approx(t, "fuel_cells/min", fuelCells, 1.2, 0.1)
	approx(t, "u235/min", u235, 1.2, 0.1)
	// 1.2 * 143 = 171.6
	approx(t, "uranium_ore/min", orePerMin, 171.6, 1)
}

// ─── Errors ─────────────────────────────────────────────────────────────────

func TestPowerCalculator_MissingTarget(t *testing.T) {
	result, code := runReference(t, `{
		"module": "power_calculator",
		"sources": [{"type": "steam"}]
	}`)
	if code != 1 {
		t.Fatalf("expected exit 1, got %d", code)
	}
	if result["type"] != "error" {
		t.Errorf("expected type=error, got %v", result["type"])
	}
}

func TestPowerCalculator_InvalidLayout(t *testing.T) {
	result, code := runReference(t, `{
		"module": "power_calculator",
		"target_mw": 100,
		"sources": [{"type": "nuclear", "layout": "5x5"}]
	}`)
	if code != 1 {
		t.Fatalf("expected exit 1, got %d", code)
	}
	if result["type"] != "error" {
		t.Errorf("expected type=error, got %v", result["type"])
	}
}

func TestPowerCalculator_NoSources(t *testing.T) {
	result, code := runReference(t, `{
		"module": "power_calculator",
		"target_mw": 100
	}`)
	if code != 1 {
		t.Fatalf("expected exit 1, got %d", code)
	}
	if result["type"] != "error" {
		t.Errorf("expected type=error, got %v", result["type"])
	}
}
