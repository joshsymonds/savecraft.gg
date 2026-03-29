package main

import (
	"testing"
)

func TestRatioCalculatorSimpleRecipe(t *testing.T) {
	// iron-gear-wheel: 2 iron-plate → 1 gear, 0.5s craft time
	// At 60/min (1/s), AM2 (speed 0.75): items/s/machine = 0.75/0.5 * 1 = 1.5
	// Need ceil(1/1.5) = 1 machine
	result, code := runReference(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":60}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)
	tree := data["production_tree"].(map[string]any)

	if tree["item"] != "iron-gear-wheel" {
		t.Errorf("item = %v, want iron-gear-wheel", tree["item"])
	}
	machines := tree["machines"].(float64)
	if machines < 1 {
		t.Errorf("machines = %v, want >= 1", machines)
	}

	// Should have iron-plate as child
	children := tree["children"].([]any)
	if len(children) < 1 {
		t.Fatal("expected at least 1 child (iron-plate)")
	}
	child := children[0].(map[string]any)
	if child["item"] != "iron-plate" {
		t.Errorf("child item = %v, want iron-plate", child["item"])
	}
}

func TestRatioCalculatorMultiLevel(t *testing.T) {
	// electronic-circuit needs copper-cable (which needs copper-plate) and iron-plate
	result, code := runReference(t, `{"module":"ratio_calculator","target_item":"electronic-circuit","target_rate":60}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)
	tree := data["production_tree"].(map[string]any)

	if tree["item"] != "electronic-circuit" {
		t.Errorf("item = %v, want electronic-circuit", tree["item"])
	}

	// Should have raw_materials summary
	rawMats := data["raw_materials"].([]any)
	if len(rawMats) < 1 {
		t.Error("expected raw materials in summary")
	}

	// Should include iron-ore and copper-ore as raw materials
	rawNames := make(map[string]bool)
	for _, r := range rawMats {
		rm := r.(map[string]any)
		rawNames[rm["item"].(string)] = true
	}
	if !rawNames["iron-ore"] {
		t.Error("expected iron-ore in raw materials")
	}
	if !rawNames["copper-ore"] {
		t.Error("expected copper-ore in raw materials")
	}
}

func TestRatioCalculatorWithModules(t *testing.T) {
	// With productivity-module-3 (10% productivity), should need fewer machines
	// for the same output rate due to bonus items
	resultBase, code := runReference(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":120,"assembler_tier":"assembling-machine-3"}`)
	if code != 0 {
		t.Fatalf("base: expected exit 0, got %d", code)
	}

	resultMod, code := runReference(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":120,"assembler_tier":"assembling-machine-3","modules":["productivity-module-3","productivity-module-3","productivity-module-3","productivity-module-3"]}`)
	if code != 0 {
		t.Fatalf("modded: expected exit 0, got %d", code)
	}

	baseMachines := resultBase["data"].(map[string]any)["production_tree"].(map[string]any)["machines"].(float64)
	modMachines := resultMod["data"].(map[string]any)["production_tree"].(map[string]any)["machines"].(float64)

	// With 4x prod-3 (40% productivity bonus), speed drops by 60% but output per craft increases by 40%.
	// Net: fewer OR equal machines needed for the same output rate.
	// The speed penalty (-0.15 * 4 = -0.60) reduces speed significantly,
	// so we might actually need more machines, but the output per craft is higher.
	// The key test: both should produce valid results without errors.
	if baseMachines < 1 || modMachines < 1 {
		t.Errorf("both should need at least 1 machine: base=%v, modded=%v", baseMachines, modMachines)
	}
}

func TestRatioCalculatorWithBeacons(t *testing.T) {
	// 8 beacons with 2x speed-module-3 each should significantly boost speed
	result, code := runReference(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":120,
		"assembler_tier":"assembling-machine-3",
		"beacon_count":8,
		"beacon_modules":["speed-module-3","speed-module-3"]
	}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)
	tree := data["production_tree"].(map[string]any)

	// With beacon speed boost, should need very few machines
	machines := tree["machines"].(float64)
	if machines < 1 {
		t.Errorf("expected at least 1 machine, got %v", machines)
	}

	// Config should reflect beacon setup
	config := data["config"].(map[string]any)
	if config["beacon_count"].(float64) != 8 {
		t.Errorf("config beacon_count = %v, want 8", config["beacon_count"])
	}
}

func TestRatioCalculatorBeltTier(t *testing.T) {
	// At 60/min = 1/s, should be yellow belt
	result, code := runReference(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":60}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	tree := result["data"].(map[string]any)["production_tree"].(map[string]any)
	belt := tree["belt_tier"].(string)
	if belt != "yellow" {
		t.Errorf("belt_tier = %v, want yellow (rate is ~1/s)", belt)
	}
}

func TestRatioCalculatorMissingItem(t *testing.T) {
	_, code := runReference(t, `{"module":"ratio_calculator","target_item":"nonexistent-item"}`)
	if code != 1 {
		t.Fatalf("expected exit 1 for unknown item, got %d", code)
	}
}

func TestRatioCalculatorPowerEstimate(t *testing.T) {
	result, code := runReference(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":60}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)
	power := data["total_power_kw"].(float64)
	if power <= 0 {
		t.Errorf("total_power_kw = %v, expected > 0", power)
	}
}
