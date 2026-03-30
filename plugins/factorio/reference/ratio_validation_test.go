package main

import (
	"testing"
)

// These tests validate the ratio_calculator's FORMULAS against well-known
// Factorio production ratios. The recipe data comes from factorio --dump-data,
// so ingredients and craft times are correct. These tests verify the math
// that combines crafting speed, modules, beacons, and productivity.

// approx is defined in helpers_test.go

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

func getRawMaterials(data map[string]any) map[string]float64 {
	raws := make(map[string]float64)
	for _, r := range data["raw_materials"].([]any) {
		rm := r.(map[string]any)
		raws[rm["item"].(string)] = rm["rate_per_min"].(float64)
	}
	return raws
}

// ─── Base Ratios (no modules, no beacons) ────────────────────────────────────

func TestValidation_IronGearWheel_AM2(t *testing.T) {
	// iron-gear-wheel: 2 iron-plate → 1 gear, 0.5s craft time
	// AM2 speed = 0.75, items/s/machine = 0.75 / 0.5 * 1 = 1.5
	// For 90/min (1.5/s): need ceil(1.5 / 1.5) = 1 machine
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":90,"assembler_tier":"assembling-machine-2"}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	approx(t, "machines", gearStage["machine_count"].(float64), 1, 0)
	approx(t, "rate_per_min", gearStage["rate_per_min"].(float64), 90.0, 0.1)

	// Iron plate: 1.5 crafts/s * 2 = 3 iron-plate/s → ceil(3/0.3125) = 10 furnaces → 187.5/min
	ironStage := ratioFindStage(stages, "iron-plate")
	if ironStage == nil {
		t.Fatal("missing iron-plate stage")
	}
	approx(t, "iron-plate rate", ironStage["rate_per_min"].(float64), 187.5, 0.1)
}

func TestValidation_CopperCable_AM2(t *testing.T) {
	// copper-cable: 1 copper-plate → 2 cable, 0.5s craft time
	// AM2 speed = 0.75, items/s/machine = 0.75 / 0.5 * 2 = 3.0 cable/s
	// For 180/min (3/s): need ceil(3 / 3) = 1 machine
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"copper-cable","target_rate":180,"assembler_tier":"assembling-machine-2"}`)
	stages := ratioGetStages(t, data)

	cableStage := ratioFindStage(stages, "copper-cable")
	if cableStage == nil {
		t.Fatal("missing copper-cable stage")
	}
	approx(t, "machines", cableStage["machine_count"].(float64), 1, 0)
	approx(t, "rate_per_min", cableStage["rate_per_min"].(float64), 180.0, 0.1)
}

func TestValidation_ElectronicCircuit_RawMaterials(t *testing.T) {
	// electronic-circuit: 1 iron-plate + 3 copper-cable → 1 circuit, 0.5s
	// For 90 circuits/min at AM2: 1 circuit machine, 2 cable machines
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"electronic-circuit","target_rate":90,"assembler_tier":"assembling-machine-2"}`)
	stages := ratioGetStages(t, data)

	circuitStage := ratioFindStage(stages, "electronic-circuit")
	if circuitStage == nil {
		t.Fatal("missing electronic-circuit stage")
	}
	approx(t, "circuit machines", circuitStage["machine_count"].(float64), 1, 0)
	approx(t, "circuit rate", circuitStage["rate_per_min"].(float64), 90.0, 0.1)

	cableStage := ratioFindStage(stages, "copper-cable")
	if cableStage == nil {
		t.Fatal("missing copper-cable stage")
	}
	approx(t, "cable machines", cableStage["machine_count"].(float64), 2, 0)

	// Raw materials: copper-ore should be roughly 2x iron-ore
	raws := getRawMaterials(data)
	if raws["iron-ore"] < 90.0 {
		t.Errorf("iron-ore raw = %.1f, should be >= 90.0", raws["iron-ore"])
	}
	if raws["copper-ore"] < 180.0 {
		t.Errorf("copper-ore raw = %.1f, should be >= 180.0", raws["copper-ore"])
	}
	ratio := raws["copper-ore"] / raws["iron-ore"]
	if ratio < 1.4 || ratio > 2.1 {
		t.Errorf("copper:iron ore ratio = %.4f, expected between 1.5 and 2.0", ratio)
	}
}

func TestValidation_CablesToCircuits_MachineRatio(t *testing.T) {
	// The classic 3:2 cable:circuit ratio.
	// At 180 circuits/min with AM2: 2 circuit machines, 3 cable machines.
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"electronic-circuit","target_rate":180,"assembler_tier":"assembling-machine-2"}`)
	stages := ratioGetStages(t, data)

	circuitStage := ratioFindStage(stages, "electronic-circuit")
	if circuitStage == nil {
		t.Fatal("missing electronic-circuit stage")
	}
	circuitMachines := circuitStage["machine_count"].(float64)
	approx(t, "circuit machines", circuitMachines, 2, 0)

	cableStage := ratioFindStage(stages, "copper-cable")
	if cableStage == nil {
		t.Fatal("missing copper-cable stage")
	}
	cableMachines := cableStage["machine_count"].(float64)
	approx(t, "cable machines", cableMachines, 3, 0)

	ratio := cableMachines / circuitMachines
	approx(t, "cable:circuit ratio", ratio, 1.5, 0.01)
}

// ─── Module Effects ──────────────────────────────────────────────────────────

func TestValidation_ProductivityModules_AM3(t *testing.T) {
	// 4x productivity-module-3 in AM3: speed=-0.60, prod=+0.40
	// Effective speed: 1.25 * 0.40 = 0.50, output/craft: 1.40
	// items/s/machine: (0.50/0.5) * 1.40 = 1.40 → 1 machine for 84/min
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":84,
		"assembler_tier":"assembling-machine-3",
		"modules":["productivity-module-3","productivity-module-3","productivity-module-3","productivity-module-3"]
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	approx(t, "machines", gearStage["machine_count"].(float64), 1, 0)
	approx(t, "rate_per_min", gearStage["rate_per_min"].(float64), 84.0, 0.1)

	// Productivity does NOT increase ingredient consumption.
	// Iron-plate consumption flow should be ~120/min, not ~168/min.
	ironStage := ratioFindStage(stages, "iron-plate")
	if ironStage == nil {
		t.Fatal("missing iron-plate stage")
	}
	ironRate := ironStage["rate_per_min"].(float64)
	if ironRate > 140 {
		t.Errorf("iron-plate rate = %.1f, suspiciously high — productivity may be incorrectly multiplying inputs (expected ~131)", ironRate)
	}
	if ironRate < 120 {
		t.Errorf("iron-plate rate = %.1f, too low — should be at least 120/min", ironRate)
	}
}

func TestValidation_SpeedModules_AM3(t *testing.T) {
	// 4x speed-module-3 in AM3: speed bonus = 2.00
	// Effective speed: 1.25 * 3.0 = 3.75, items/s/machine = 7.5
	// For 450/min: need 1 machine
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":450,
		"assembler_tier":"assembling-machine-3",
		"modules":["speed-module-3","speed-module-3","speed-module-3","speed-module-3"]
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	approx(t, "machines", gearStage["machine_count"].(float64), 1, 0)
	approx(t, "rate_per_min", gearStage["rate_per_min"].(float64), 450.0, 0.1)
}

// ─── Beacon Effects ──────────────────────────────────────────────────────────

func TestValidation_BeaconSpeedFormula(t *testing.T) {
	// 8 beacons × 2 speed-module-3: beacon bonus = 4.2426
	// AM3 gear: effective speed = 6.5533, items/s = 13.1066
	// 1 machine → actual rate = 786.4/min
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"assembler_tier":"assembling-machine-3",
		"beacon_count":8,
		"beacon_modules":["speed-module-3","speed-module-3"]
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	approx(t, "machines", gearStage["machine_count"].(float64), 1, 0)
	approx(t, "rate_per_min", gearStage["rate_per_min"].(float64), 786.4, 1.0)
}

func TestValidation_BeaconWithProductivity(t *testing.T) {
	// 4x prod-3 + 8 beacons × 2 speed-3
	// Effective speed: 5.8033, output/craft: 1.40
	// items/s/machine: 16.2492 → 1 machine → ~974.9/min
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"assembler_tier":"assembling-machine-3",
		"modules":["productivity-module-3","productivity-module-3","productivity-module-3","productivity-module-3"],
		"beacon_count":8,
		"beacon_modules":["speed-module-3","speed-module-3"]
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	approx(t, "machines", gearStage["machine_count"].(float64), 1, 0)
	approx(t, "rate_per_min", gearStage["rate_per_min"].(float64), 974.9, 1.0)

	// Ingredient rate should NOT have productivity multiplier
	// iron-plate flow should be ~1392.8/min (based on crafts/s, not output/s)
	ironStage := ratioFindStage(stages, "iron-plate")
	if ironStage == nil {
		t.Fatal("missing iron-plate stage")
	}
	ironRate := ironStage["rate_per_min"].(float64)
	if ironRate > 1500 {
		t.Errorf("iron-plate rate = %.1f, suspiciously high — productivity may be incorrectly multiplying inputs", ironRate)
	}
	if ironRate < 1392 {
		t.Errorf("iron-plate rate = %.1f, too low — should be at least 1392/min", ironRate)
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
	// iron-plate smelting should use a furnace, not an assembler.
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-plate","target_rate":18.75}`)
	stages := ratioGetStages(t, data)

	ironStage := ratioFindStage(stages, "iron-plate")
	if ironStage == nil {
		t.Fatal("missing iron-plate stage")
	}

	machineType := ironStage["machine_type"].(string)
	validFurnaces := map[string]bool{"stone-furnace": true, "steel-furnace": true, "electric-furnace": true}
	if !validFurnaces[machineType] {
		t.Errorf("machine_type = %q, want a furnace (smelting category)", machineType)
	}

	approx(t, "machines", ironStage["machine_count"].(float64), 1, 0)
}

// Unit tests for shared helpers (resolveModuleEffects, resolveBeaconEffects,
// parsePowerKW, beltTierForRate, roundTo) are in helpers_test.go.

func TestValidation_CaseInsensitiveRecipeLookup(t *testing.T) {
	// recipe_lookup should fall back to case-insensitive match
	result, code := runReference(t, `{"module":"recipe_lookup","name":"Electronic-Circuit"}`)
	if code != 0 {
		t.Fatalf("expected exit 0 for case-insensitive lookup, got %d", code)
	}
	d := result["data"].(map[string]any)
	recipe := d["recipe"].(map[string]any)
	if recipe["name"] != "electronic-circuit" {
		t.Errorf("name = %v, want electronic-circuit", recipe["name"])
	}
}

func TestValidation_CaseInsensitiveMachineLookup(t *testing.T) {
	result, code := runReference(t, `{"module":"recipe_lookup","machine":"Assembling-Machine-3"}`)
	if code != 0 {
		t.Fatalf("expected exit 0 for case-insensitive machine lookup, got %d", code)
	}
	d := result["data"].(map[string]any)
	machine := d["machine"].(map[string]any)
	if machine["name"] != "assembling-machine-3" {
		t.Errorf("name = %v, want assembling-machine-3", machine["name"])
	}
}
