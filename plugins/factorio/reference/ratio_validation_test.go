package main

import (
	"math"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

// These tests validate the ratio_calculator's FORMULAS against well-known
// Factorio production ratios. The recipe data comes from factorio --dump-data,
// so ingredients and craft times are correct. These tests verify the math
// that combines crafting speed, modules, beacons, and productivity.

// approx checks that actual is within tolerance of expected.
func approx(t *testing.T, label string, actual, expected, tolerance float64) {
	t.Helper()
	if math.Abs(actual-expected) > tolerance {
		t.Errorf("%s: got %.4f, want %.4f (±%.4f)", label, actual, expected, tolerance)
	}
}

// runRatio is a helper that runs a ratio_calculator query and returns the parsed result data.
func runRatio(t *testing.T, query string) map[string]any {
	t.Helper()
	result, code := runReference(t, query)
	if code != 0 {
		t.Fatalf("ratio_calculator exited %d for query: %s", code, query)
	}
	if result["type"] != "result" {
		t.Fatalf("expected type=result, got %v", result["type"])
	}
	return result["data"].(map[string]any)
}

func getTree(data map[string]any) map[string]any {
	return data["production_tree"].(map[string]any)
}

func getRawMaterials(data map[string]any) map[string]float64 {
	raws := make(map[string]float64)
	for _, r := range data["raw_materials"].([]any) {
		rm := r.(map[string]any)
		raws[rm["item"].(string)] = rm["rate_per_min"].(float64)
	}
	return raws
}

func findChild(tree map[string]any, itemName string) map[string]any {
	children, ok := tree["children"].([]any)
	if !ok {
		return nil
	}
	for _, c := range children {
		child := c.(map[string]any)
		if child["item"] == itemName {
			return child
		}
	}
	return nil
}

// ─── Base Ratios (no modules, no beacons) ────────────────────────────────────

func TestValidation_IronGearWheel_AM2(t *testing.T) {
	// iron-gear-wheel: 2 iron-plate → 1 gear, 0.5s craft time
	// AM2 speed = 0.75
	// items/s/machine = 0.75 / 0.5 * 1 = 1.5
	// For 90/min (1.5/s): need ceil(1.5 / 1.5) = 1 machine
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":90,"assembler_tier":"assembling-machine-2"}`)
	tree := getTree(data)

	machines := tree["machines"].(float64)
	if machines != 1 {
		t.Errorf("machines: got %.0f, want 1 (1.5 items/s/machine, need 1.5/s)", machines)
	}

	// Should produce exactly 90/min
	approx(t, "rate_per_min", tree["rate_per_min"].(float64), 90.0, 0.1)

	// Iron plate consumption: 1.5 crafts/s * 2 iron-plate/craft = 3 iron-plate/s
	// Need ceil(3.0 / (1.0/3.2)) = ceil(9.6) = 10 furnaces (stone-furnace, speed 1.0, 3.2s)
	// 10 furnaces produce 10 * 0.3125 = 3.125/s = 187.5/min (slight overproduction from ceiling)
	ironChild := findChild(tree, "iron-plate")
	if ironChild == nil {
		t.Fatal("expected iron-plate child")
	}
	approx(t, "iron-plate rate", ironChild["rate_per_min"].(float64), 187.5, 0.1)
}

func TestValidation_CopperCable_AM2(t *testing.T) {
	// copper-cable: 1 copper-plate → 2 cable, 0.5s craft time
	// AM2 speed = 0.75
	// items/s/machine = 0.75 / 0.5 * 2 = 3.0 cable/s
	// For 180/min (3/s): need ceil(3 / 3) = 1 machine
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"copper-cable","target_rate":180,"assembler_tier":"assembling-machine-2"}`)
	tree := getTree(data)

	machines := tree["machines"].(float64)
	if machines != 1 {
		t.Errorf("machines: got %.0f, want 1 (3.0 cable/s/machine, need 3/s)", machines)
	}
	approx(t, "rate_per_min", tree["rate_per_min"].(float64), 180.0, 0.1)
}

func TestValidation_ElectronicCircuit_RawMaterials(t *testing.T) {
	// electronic-circuit: 1 iron-plate + 3 copper-cable → 1 circuit, 0.5s
	// copper-cable: 1 copper-plate → 2 cable, 0.5s
	//
	// For 90 circuits/min (1.5/s) at AM2 (speed 0.75):
	//   Circuit machines: ceil(1.5 / (0.75/0.5)) = ceil(1.5/1.5) = 1
	//   Iron-plate consumption: 1.5 crafts/s * 1 = 1.5 iron-plate/s = 90/min
	//   Copper-cable consumption: 1.5 crafts/s * 3 = 4.5 cable/s = 270/min
	//   Cable machines: ceil(4.5 / (0.75/0.5*2)) = ceil(4.5/3.0) = 2
	//   Copper-plate for cable: 2 machines * 0.75/0.5 * 1 = 3.0 copper-plate/s = 180/min
	//
	// Smelting (iron-plate from iron-ore): 3.2s craft time, stone-furnace speed 1.0
	//   iron-plate/s/furnace = 1.0/3.2 = 0.3125
	//   Need 1.5/0.3125 = 4.8 → 5 furnaces
	//   iron-ore = 1.5/s = 90/min
	//
	// Smelting (copper-plate from copper-ore): same math
	//   Need 3.0/0.3125 = 9.6 → 10 furnaces
	//   copper-ore = 3.0/s = 180/min

	data := runRatio(t, `{"module":"ratio_calculator","target_item":"electronic-circuit","target_rate":90,"assembler_tier":"assembling-machine-2"}`)
	tree := getTree(data)

	// Top-level: 1 circuit machine
	approx(t, "circuit machines", tree["machines"].(float64), 1, 0)
	approx(t, "circuit rate", tree["rate_per_min"].(float64), 90.0, 0.1)

	// Copper cable child: 2 machines
	cableChild := findChild(tree, "copper-cable")
	if cableChild == nil {
		t.Fatal("expected copper-cable child")
	}
	approx(t, "cable machines", cableChild["machines"].(float64), 2, 0)

	// Raw materials: iron-ore and copper-ore
	// Due to ceiling on machine counts at each tree level, raw rates are slightly higher
	// than the theoretical minimum. The key assertion is that they're in the right ballpark
	// and copper-ore is roughly 2x iron-ore (circuits need 3 cable which needs 1.5 copper-plate
	// per circuit, vs 1 iron-plate per circuit).
	raws := getRawMaterials(data)
	if raws["iron-ore"] < 90.0 {
		t.Errorf("iron-ore raw = %.1f, should be >= 90.0 (theoretical minimum)", raws["iron-ore"])
	}
	if raws["copper-ore"] < 180.0 {
		t.Errorf("copper-ore raw = %.1f, should be >= 180.0 (theoretical minimum)", raws["copper-ore"])
	}
	// Copper should be roughly 1.5x iron: circuit needs 1 iron-plate + 3 copper-cable,
	// cable produces 2 per craft from 1 copper-plate, so 1.5 copper per circuit vs 1 iron.
	// Ceiling effects on furnace counts may shift this slightly.
	ratio := raws["copper-ore"] / raws["iron-ore"]
	approx(t, "copper:iron ore ratio", ratio, 1.5, 0.2)
}

func TestValidation_CablesToCircuits_MachineRatio(t *testing.T) {
	// The classic Factorio ratio: 3 cable machines feed 2 circuit machines.
	// Both recipes are 0.5s. Circuit needs 3 cable. Cable produces 2.
	//
	// At 180 circuits/min (3/s) with AM2:
	//   Circuit machines: ceil(3 / 1.5) = 2
	//   Cable consumption: 2 * 1.5 * 3 = 9 cable/s
	//   Cable machines: ceil(9 / 3.0) = 3
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"electronic-circuit","target_rate":180,"assembler_tier":"assembling-machine-2"}`)
	tree := getTree(data)

	circuitMachines := tree["machines"].(float64)
	approx(t, "circuit machines", circuitMachines, 2, 0)

	cableChild := findChild(tree, "copper-cable")
	if cableChild == nil {
		t.Fatal("expected copper-cable child")
	}
	cableMachines := cableChild["machines"].(float64)
	approx(t, "cable machines", cableMachines, 3, 0)

	// The ratio: 3 cable : 2 circuit
	ratio := cableMachines / circuitMachines
	approx(t, "cable:circuit ratio", ratio, 1.5, 0.01)
}

// ─── Module Effects ──────────────────────────────────────────────────────────

func TestValidation_ProductivityModules_AM3(t *testing.T) {
	// 4x productivity-module-3 in AM3 making iron-gear-wheel:
	//   Speed bonus: 4 * (-0.15) = -0.60
	//   Prod bonus: 4 * 0.10 = 0.40
	//   Effective speed: 1.25 * (1 + (-0.60)) = 1.25 * 0.40 = 0.50
	//   Output per craft: 1.0 * (1 + 0.40) = 1.40
	//   items/s/machine: (0.50 / 0.5) * 1.40 = 1.40
	//   For 84/min (1.4/s): need ceil(1.4 / 1.4) = 1 machine
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":84,
		"assembler_tier":"assembling-machine-3",
		"modules":["productivity-module-3","productivity-module-3","productivity-module-3","productivity-module-3"]
	}`)
	tree := getTree(data)

	approx(t, "machines", tree["machines"].(float64), 1, 0)
	approx(t, "rate_per_min", tree["rate_per_min"].(float64), 84.0, 0.1)

	// Productivity does NOT increase ingredient consumption.
	// Iron plate consumption: 1 machine * (0.50/0.5) * 2 = 2.0 iron-plate/s
	// (NOT 2.0 * 1.4 — productivity gives free output, ingredients stay the same)
	// Furnace ceiling: ceil(2.0 / 0.3125) = 7 furnaces → 7 * 0.3125 = 2.1875/s = 131.25/min
	ironChild := findChild(tree, "iron-plate")
	if ironChild == nil {
		t.Fatal("expected iron-plate child")
	}
	// The key assertion: ingredient rate should be based on crafts/s, NOT output/s
	// If productivity incorrectly multiplied inputs, we'd see 2.8/s (168/min) instead of ~2.0/s
	ironRate := ironChild["rate_per_min"].(float64)
	if ironRate > 140 {
		t.Errorf("iron-plate rate = %.1f, suspiciously high — productivity may be incorrectly multiplying inputs (expected ~131)", ironRate)
	}
	if ironRate < 120 {
		t.Errorf("iron-plate rate = %.1f, too low — should be at least 120/min (2.0 iron/s)", ironRate)
	}
}

func TestValidation_SpeedModules_AM3(t *testing.T) {
	// 4x speed-module-3 in AM3 making iron-gear-wheel:
	//   Speed bonus: 4 * 0.50 = 2.00
	//   Effective speed: 1.25 * (1 + 2.00) = 1.25 * 3.0 = 3.75
	//   items/s/machine: 3.75 / 0.5 * 1 = 7.5
	//   For 450/min (7.5/s): need 1 machine
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":450,
		"assembler_tier":"assembling-machine-3",
		"modules":["speed-module-3","speed-module-3","speed-module-3","speed-module-3"]
	}`)
	tree := getTree(data)

	approx(t, "machines", tree["machines"].(float64), 1, 0)
	approx(t, "rate_per_min", tree["rate_per_min"].(float64), 450.0, 0.1)
}

// ─── Beacon Effects ──────────────────────────────────────────────────────────

func TestValidation_BeaconSpeedFormula(t *testing.T) {
	// 8 beacons, each with 2x speed-module-3:
	//   Module speed per beacon: 2 * 0.50 = 1.0
	//   Beacon distribution effectivity: 1.5
	//   Beacon bonus = 8 * 1.0 * 1.5 / sqrt(8) = 12.0 / 2.8284 = 4.2426
	//
	// AM3 making iron-gear-wheel (0.5s, no machine modules):
	//   Effective speed: 1.25 * (1 + 4.2426) = 1.25 * 5.2426 = 6.5533
	//   items/s/machine: 6.5533 / 0.5 = 13.1066
	//   For 60/min (1/s): need ceil(1/13.1066) = 1 machine
	//   Actual rate = 1 * 13.1066 * 60 = 786.4/min
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"assembler_tier":"assembling-machine-3",
		"beacon_count":8,
		"beacon_modules":["speed-module-3","speed-module-3"]
	}`)
	tree := getTree(data)

	approx(t, "machines", tree["machines"].(float64), 1, 0)
	// 1 machine produces ~786/min, which is way more than 60/min needed
	rate := tree["rate_per_min"].(float64)
	approx(t, "rate_per_min", rate, 786.4, 1.0)
}

func TestValidation_BeaconWithProductivity(t *testing.T) {
	// Common endgame setup: 4x prod-3 in machine + 8 beacons with 2x speed-3
	//
	// Machine modules: speed=-0.60, prod=+0.40
	// Beacon bonus: 4.2426 (from test above)
	// Effective speed: 1.25 * (1 + (-0.60) + 4.2426) = 1.25 * 4.6426 = 5.8033
	// Output per craft: 1.0 * 1.40 = 1.40
	// items/s/machine: (5.8033 / 0.5) * 1.40 = 16.2492
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"assembler_tier":"assembling-machine-3",
		"modules":["productivity-module-3","productivity-module-3","productivity-module-3","productivity-module-3"],
		"beacon_count":8,
		"beacon_modules":["speed-module-3","speed-module-3"]
	}`)
	tree := getTree(data)

	approx(t, "machines", tree["machines"].(float64), 1, 0)
	// 1 machine produces ~974.95/min
	rate := tree["rate_per_min"].(float64)
	approx(t, "rate_per_min", rate, 974.9, 1.0)

	// Ingredient rate should NOT have productivity multiplier
	// crafts/s = 5.8033 / 0.5 = 11.6066
	// iron-plate consumption: 11.6066 * 2 = 23.2132/s = 1392.8/min (theoretical)
	// Furnace ceiling will push this slightly higher
	ironChild := findChild(tree, "iron-plate")
	if ironChild == nil {
		t.Fatal("expected iron-plate child")
	}
	ironRate := ironChild["rate_per_min"].(float64)
	// If productivity incorrectly multiplied inputs, we'd see ~1950/min (23.2 * 1.4)
	if ironRate > 1500 {
		t.Errorf("iron-plate rate = %.1f, suspiciously high — productivity may be incorrectly multiplying inputs", ironRate)
	}
	if ironRate < 1392 {
		t.Errorf("iron-plate rate = %.1f, too low — should be at least 1392/min (23.2 iron/s)", ironRate)
	}
}

// ─── Belt Tier Thresholds ────────────────────────────────────────────────────

func TestValidation_BeltTiers(t *testing.T) {
	tests := []struct {
		rate float64
		tier string
	}{
		{14.9, "yellow"},
		{15.0, "yellow"},
		{15.1, "red"},
		{30.0, "red"},
		{30.1, "blue"},
		{45.0, "blue"},
		{45.1, "turbo"},
	}
	for _, tc := range tests {
		got := beltTierForRate(tc.rate)
		if got != tc.tier {
			t.Errorf("beltTierForRate(%.1f) = %q, want %q", tc.rate, got, tc.tier)
		}
	}
}

// ─── Smelting Uses Correct Machine ───────────────────────────────────────────

func TestValidation_SmeltingUsesFurnace(t *testing.T) {
	// iron-plate is category "smelting" — should use a furnace, not an assembler.
	// stone-furnace: speed 1.0, craft time 3.2s
	// items/s/machine = 1.0 / 3.2 = 0.3125
	// For 18.75/min (0.3125/s): need 1 furnace
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-plate","target_rate":18.75}`)
	tree := getTree(data)

	// Should pick a furnace, not the assembler_tier
	machineType := tree["machine_type"].(string)
	validFurnaces := map[string]bool{"stone-furnace": true, "steel-furnace": true, "electric-furnace": true}
	if !validFurnaces[machineType] {
		t.Errorf("machine_type = %q, want a furnace (smelting category)", machineType)
	}

	approx(t, "machines", tree["machines"].(float64), 1, 0)
}

// ─── Unit test for internal helpers ──────────────────────────────────────────

func TestValidation_ResolveBeaconEffects(t *testing.T) {
	// 8 beacons, 2x speed-module-3 (each +0.5 speed)
	// Per beacon: 2 * 0.5 = 1.0 speed
	// Total: 8 * 1.0 * 1.5 / sqrt(8) = 12.0 / 2.8284 = 4.2426
	bonus := resolveBeaconEffects([]string{"speed-module-3", "speed-module-3"}, 8)
	approx(t, "beacon speed bonus", bonus, 4.2426, 0.001)
}

func TestValidation_ResolveBeaconEffects_SingleBeacon(t *testing.T) {
	// 1 beacon, 2x speed-module-3
	// Total: 1 * 1.0 * 1.5 / sqrt(1) = 1.5
	bonus := resolveBeaconEffects([]string{"speed-module-3", "speed-module-3"}, 1)
	approx(t, "single beacon bonus", bonus, 1.5, 0.001)
}

func TestValidation_ResolveModuleEffects(t *testing.T) {
	// 4x productivity-module-3
	speed, prod, consumption := resolveModuleEffects([]string{
		"productivity-module-3", "productivity-module-3",
		"productivity-module-3", "productivity-module-3",
	})
	approx(t, "speed", speed, -0.60, 0.001)
	approx(t, "prod", prod, 0.40, 0.001)
	approx(t, "consumption", consumption, 3.20, 0.001)
}

func TestValidation_ParsePowerKW(t *testing.T) {
	tests := []struct {
		input    string
		expected float64
	}{
		{"375kW", 375},
		{"150kW", 150},
		{"90kW", 90},
		{"180kW", 180},
	}
	for _, tc := range tests {
		m := &data.CraftingMachine{EnergyUsage: tc.input}
		got := parsePowerKW(m)
		if got != tc.expected {
			t.Errorf("parsePowerKW(%q) = %v, want %v", tc.input, got, tc.expected)
		}
	}
}
