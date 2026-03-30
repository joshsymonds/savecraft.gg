package main

import (
	"strings"
	"testing"
)

func TestRatioCalculatorSimpleRecipe(t *testing.T) {
	// iron-gear-wheel: 2 iron-plate → 1 gear, 0.5s craft time
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":60}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	if gearStage["machine_count"].(float64) < 1 {
		t.Errorf("machine_count = %v, want >= 1", gearStage["machine_count"])
	}

	// Should have iron-plate as a stage with a flow to iron-gear-wheel
	ironStage := ratioFindStage(stages, "iron-plate")
	if ironStage == nil {
		t.Fatal("missing iron-plate stage")
	}
	flows := ratioGetFlows(t, data)
	ironToGear := ratioFlowsFrom(flows, "iron-plate")
	if len(ironToGear) < 1 {
		t.Fatal("expected flow from iron-plate to iron-gear-wheel")
	}
}

func TestRatioCalculatorMultiLevel(t *testing.T) {
	// electronic-circuit needs copper-cable (which needs copper-plate) and iron-plate
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"electronic-circuit","target_rate":60}`)
	stages := ratioGetStages(t, data)

	if ratioFindStage(stages, "electronic-circuit") == nil {
		t.Error("missing electronic-circuit stage")
	}

	// Should have raw_materials summary with iron-ore and copper-ore
	raws := getRawMaterials(data)
	if raws["iron-ore"] == 0 {
		t.Error("expected iron-ore in raw materials")
	}
	if raws["copper-ore"] == 0 {
		t.Error("expected copper-ore in raw materials")
	}
}

func TestRatioCalculatorWithModules(t *testing.T) {
	baseData := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":120,"assembler_tier":"assembling-machine-3"}`)
	modData := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":120,"assembler_tier":"assembling-machine-3","modules":["productivity-module-3","productivity-module-3","productivity-module-3","productivity-module-3"]}`)

	baseStages := ratioGetStages(t, baseData)
	modStages := ratioGetStages(t, modData)

	baseGear := ratioFindStage(baseStages, "iron-gear-wheel")
	modGear := ratioFindStage(modStages, "iron-gear-wheel")

	baseMachines := baseGear["machine_count"].(float64)
	modMachines := modGear["machine_count"].(float64)

	if baseMachines < 1 || modMachines < 1 {
		t.Errorf("both should need at least 1 machine: base=%v, modded=%v", baseMachines, modMachines)
	}

	// Productivity modules change speed and output — machine counts or rates must differ
	baseRate := baseGear["rate_per_min"].(float64)
	modRate := modGear["rate_per_min"].(float64)
	if baseMachines == modMachines && baseRate == modRate {
		t.Errorf("modules should change output: base machines=%.0f rate=%.1f, modded machines=%.0f rate=%.1f",
			baseMachines, baseRate, modMachines, modRate)
	}
}

func TestRatioCalculatorWithBeacons(t *testing.T) {
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":120,
		"assembler_tier":"assembling-machine-3",
		"beacon_count":8,
		"beacon_modules":["speed-module-3","speed-module-3"]
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	if gearStage["machine_count"].(float64) < 1 {
		t.Errorf("expected at least 1 machine, got %v", gearStage["machine_count"])
	}

	config := data["config"].(map[string]any)
	if config["beacon_count"].(float64) != 8 {
		t.Errorf("config beacon_count = %v, want 8", config["beacon_count"])
	}
}

func TestRatioCalculatorBeltTier(t *testing.T) {
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":60}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	belt := gearStage["belt_tier"].(string)
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

func TestRatioCalculatorAmbiguousRecipeErrors(t *testing.T) {
	result, code := runReference(t, `{"module":"ratio_calculator","target_item":"solid-fuel","target_rate":60}`)
	if code != 1 {
		t.Fatalf("expected exit 1 for ambiguous recipe, got %d", code)
	}
	if result["type"] != "error" {
		t.Fatalf("expected error, got %v", result["type"])
	}
	msg := result["message"].(string)
	if !strings.Contains(msg, "ambiguous") && !strings.Contains(msg, "multiple") {
		t.Errorf("error message should mention ambiguity: %s", msg)
	}
}

func TestRatioCalculatorExplicitRecipe(t *testing.T) {
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"solid-fuel","target_rate":60,"recipe":"solid-fuel-from-light-oil"}`)
	stages := ratioGetStages(t, data)

	solidStage := ratioFindStage(stages, "solid-fuel")
	if solidStage == nil {
		t.Fatal("missing solid-fuel stage")
	}
	if solidStage["recipe"] != "solid-fuel-from-light-oil" {
		t.Errorf("recipe = %v, want solid-fuel-from-light-oil", solidStage["recipe"])
	}
}

func TestRatioCalculatorRecipeOverrides(t *testing.T) {
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"rocket-fuel",
		"target_rate":60,
		"recipe":"rocket-fuel",
		"recipe_overrides":{"solid-fuel":"solid-fuel-from-light-oil"}
	}`)
	stages := ratioGetStages(t, data)

	rocketStage := ratioFindStage(stages, "rocket-fuel")
	if rocketStage == nil {
		t.Fatal("missing rocket-fuel stage")
	}
	if rocketStage["recipe"] != "rocket-fuel" {
		t.Errorf("recipe = %v, want rocket-fuel", rocketStage["recipe"])
	}
}

func TestRatioCalculatorPowerEstimate(t *testing.T) {
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":60}`)
	power := data["total_power_kw"].(float64)
	if power <= 0 {
		t.Errorf("total_power_kw = %v, expected > 0", power)
	}
}

// ─── DAG Output Format ─────────────────────────────────────────────────────
//
// The ratio_calculator must output a DAG (stages + flows) instead of a tree.
// This prevents duplicate nodes when multiple recipes share common inputs.

// ratioGetStages extracts the stages array from ratio_calculator DAG output.
func ratioGetStages(t *testing.T, data map[string]any) []map[string]any {
	t.Helper()
	raw, ok := data["stages"].([]any)
	if !ok {
		t.Fatal("expected 'stages' array in output (got production_tree instead?)")
	}
	stages := make([]map[string]any, len(raw))
	for i, s := range raw {
		stages[i] = s.(map[string]any)
	}
	return stages
}

// ratioGetFlows extracts the flows array from ratio_calculator DAG output.
func ratioGetFlows(t *testing.T, data map[string]any) []map[string]any {
	t.Helper()
	raw, ok := data["flows"].([]any)
	if !ok {
		t.Fatal("expected 'flows' array in output")
	}
	flows := make([]map[string]any, len(raw))
	for i, f := range raw {
		flows[i] = f.(map[string]any)
	}
	return flows
}

// ratioFindStage finds a stage by item name, returns nil if not found.
func ratioFindStage(stages []map[string]any, item string) map[string]any {
	for _, s := range stages {
		if s["item"] == item {
			return s
		}
	}
	return nil
}

// ratioFlowsFrom returns all flows where source matches the given stage ID.
func ratioFlowsFrom(flows []map[string]any, source string) []map[string]any {
	var result []map[string]any
	for _, f := range flows {
		if f["source"] == source {
			result = append(result, f)
		}
	}
	return result
}

func TestDAG_OutputFormat(t *testing.T) {
	// Even a simple recipe should use stages+flows format, not production_tree.
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":60}`)

	// Must have stages and flows
	stages := ratioGetStages(t, data)
	flows := ratioGetFlows(t, data)

	if len(stages) < 2 {
		t.Errorf("expected at least 2 stages (gear + iron-plate + raw), got %d", len(stages))
	}
	if len(flows) < 1 {
		t.Errorf("expected at least 1 flow, got %d", len(flows))
	}

	// Must NOT have production_tree
	if _, ok := data["production_tree"]; ok {
		t.Error("output should not contain 'production_tree' — use stages+flows DAG format")
	}

	// Still has raw_materials, total_power_kw, config
	if data["raw_materials"] == nil {
		t.Error("missing raw_materials")
	}
	if data["total_power_kw"] == nil {
		t.Error("missing total_power_kw")
	}
	if data["config"] == nil {
		t.Error("missing config")
	}
}

func TestDAG_BlueScienceUniqueStages(t *testing.T) {
	// Blue science (chemical-science-pack) has a deep tree where iron-plate
	// feeds into 4 different recipes (steel-plate, iron-gear-wheel, pipe,
	// electronic-circuit). Each item must appear exactly once in stages.
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"chemical-science-pack","target_rate":60}`)
	stages := ratioGetStages(t, data)

	// Count occurrences of each item
	itemCounts := make(map[string]int)
	for _, s := range stages {
		item := s["item"].(string)
		itemCounts[item]++
	}

	// Every item must appear exactly once
	for item, count := range itemCounts {
		if count != 1 {
			t.Errorf("%s appears %d times in stages, want exactly 1", item, count)
		}
	}

	// Specifically verify the items that were duplicated in the tree format
	for _, item := range []string{"iron-plate", "copper-cable", "copper-plate", "iron-ore", "copper-ore"} {
		if itemCounts[item] != 1 {
			t.Errorf("critical: %s appears %d times (was duplicated in tree format)", item, itemCounts[item])
		}
	}
}

func TestDAG_MultiConsumerFlows(t *testing.T) {
	// Iron-plate in blue science feeds steel-plate, iron-gear-wheel, pipe,
	// and electronic-circuit. The DAG must have separate flows for each consumer.
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"chemical-science-pack","target_rate":60}`)
	flows := ratioGetFlows(t, data)

	ironFlows := ratioFlowsFrom(flows, "iron-plate")
	if len(ironFlows) < 4 {
		targets := make([]string, len(ironFlows))
		for i, f := range ironFlows {
			targets[i] = f["target"].(string)
		}
		t.Errorf("iron-plate has %d outgoing flows %v, want >= 4 (steel-plate, iron-gear-wheel, pipe, electronic-circuit)", len(ironFlows), targets)
	}

	// Copper-cable feeds both electronic-circuit and advanced-circuit
	cableFlows := ratioFlowsFrom(flows, "copper-cable")
	if len(cableFlows) < 2 {
		t.Errorf("copper-cable has %d outgoing flows, want >= 2 (electronic-circuit, advanced-circuit)", len(cableFlows))
	}

	// Copper-plate feeds copper-cable (single consumer, but should still be a flow)
	copperPlateFlows := ratioFlowsFrom(flows, "copper-plate")
	if len(copperPlateFlows) < 1 {
		t.Errorf("copper-plate has %d outgoing flows, want >= 1", len(copperPlateFlows))
	}
}

func TestDAG_FlowRatesSumToStageRate(t *testing.T) {
	// For each non-root stage, the sum of outgoing flow rates should equal
	// the stage's total production rate (what it produces for its consumers).
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"chemical-science-pack","target_rate":60}`)
	stages := ratioGetStages(t, data)
	flows := ratioGetFlows(t, data)

	for _, stage := range stages {
		item := stage["item"].(string)
		if item == "chemical-science-pack" {
			continue // root has no outgoing flows
		}
		recipe := stage["recipe"].(string)
		if recipe == "(raw)" || recipe == "(no recipe)" || strings.HasPrefix(recipe, "(ambiguous") {
			continue // raw materials flow to consumers but rate accounting differs
		}

		outFlows := ratioFlowsFrom(flows, item)
		if len(outFlows) == 0 {
			continue // leaf nodes consumed directly
		}

		var flowSum float64
		for _, f := range outFlows {
			flowSum += f["rate_per_min"].(float64)
		}

		stageRate := stage["rate_per_min"].(float64)
		// Stage rate (actual production with ceiling) should be >= sum of consumer demands
		if flowSum > stageRate*1.01 { // 1% tolerance for rounding
			t.Errorf("%s: outgoing flow sum %.1f exceeds stage rate %.1f", item, flowSum, stageRate)
		}
	}
}

func TestDAG_MergedMachineCount(t *testing.T) {
	// When iron-plate feeds 4 consumers, the merged stage should have the
	// machine count computed from TOTAL demand, not the sum of individual ceils.
	// ceil(total) <= sum(ceil(individual)) — merging should be at least as efficient.
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"chemical-science-pack","target_rate":60}`)
	stages := ratioGetStages(t, data)

	ironStage := ratioFindStage(stages, "iron-plate")
	if ironStage == nil {
		t.Fatal("missing iron-plate stage")
	}

	machines := ironStage["machine_count"].(float64)
	if machines < 1 {
		t.Errorf("iron-plate machine_count = %.0f, want >= 1", machines)
	}

	// In the old tree, iron-plate appeared 4 times with machines: 9, 5, 5, 5 = 24 total.
	// Merged should be <= 24 (recalculated from combined demand may need fewer due to ceiling).
	if machines > 24 {
		t.Errorf("iron-plate machine_count = %.0f, should be <= 24 (sum of individual ceils)", machines)
	}
}

func TestDAG_ElectronicCircuitPreservesRatios(t *testing.T) {
	// The classic 3:2 cable-to-circuit ratio must still hold in DAG format.
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"electronic-circuit","target_rate":180,"assembler_tier":"assembling-machine-2"}`)
	stages := ratioGetStages(t, data)

	circuitStage := ratioFindStage(stages, "electronic-circuit")
	if circuitStage == nil {
		t.Fatal("missing electronic-circuit stage")
	}
	cableStage := ratioFindStage(stages, "copper-cable")
	if cableStage == nil {
		t.Fatal("missing copper-cable stage")
	}

	circuitMachines := circuitStage["machine_count"].(float64)
	cableMachines := cableStage["machine_count"].(float64)

	approx(t, "circuit machines", circuitMachines, 2, 0)
	approx(t, "cable machines", cableMachines, 3, 0)

	ratio := cableMachines / circuitMachines
	approx(t, "cable:circuit ratio", ratio, 1.5, 0.01)
}

func TestDAG_RecipeOverridesStillWork(t *testing.T) {
	// recipe_overrides should still resolve ambiguous recipes in DAG format.
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"rocket-fuel",
		"target_rate":60,
		"recipe":"rocket-fuel",
		"recipe_overrides":{"solid-fuel":"solid-fuel-from-light-oil"}
	}`)
	stages := ratioGetStages(t, data)

	rocketStage := ratioFindStage(stages, "rocket-fuel")
	if rocketStage == nil {
		t.Fatal("missing rocket-fuel stage")
	}
	if rocketStage["recipe"] != "rocket-fuel" {
		t.Errorf("rocket-fuel recipe = %v, want rocket-fuel", rocketStage["recipe"])
	}

	solidStage := ratioFindStage(stages, "solid-fuel")
	if solidStage == nil {
		t.Fatal("missing solid-fuel stage")
	}
	if solidStage["recipe"] != "solid-fuel-from-light-oil" {
		t.Errorf("solid-fuel recipe = %v, want solid-fuel-from-light-oil", solidStage["recipe"])
	}
}

func TestDAG_StageFields(t *testing.T) {
	// Each stage must have the required fields matching the oil_balancer pattern.
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":60}`)
	stages := ratioGetStages(t, data)

	for _, stage := range stages {
		item := stage["item"].(string)
		recipe := stage["recipe"].(string)
		if stage["id"] == nil {
			t.Errorf("stage %s missing 'id'", item)
		}
		if stage["recipe"] == nil {
			t.Errorf("stage %s missing 'recipe'", item)
		}
		if stage["rate_per_min"] == nil {
			t.Errorf("stage %s missing 'rate_per_min'", item)
		}

		// Non-raw stages must have meaningful machine fields
		isRaw := strings.HasPrefix(recipe, "(")
		if !isRaw {
			mt := stage["machine_type"].(string)
			if mt == "" {
				t.Errorf("stage %s missing 'machine_type'", item)
			}
			mc := stage["machine_count"].(float64)
			if mc < 1 {
				t.Errorf("stage %s has machine_count %.0f, want >= 1", item, mc)
			}
			pw := stage["power_kw"].(float64)
			if pw <= 0 {
				t.Errorf("stage %s has power_kw %.1f, want > 0", item, pw)
			}
		}
	}
}

func TestDAG_FlowFields(t *testing.T) {
	// Each flow must have source, target, item, and rate_per_min.
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"electronic-circuit","target_rate":60}`)
	flows := ratioGetFlows(t, data)

	for i, flow := range flows {
		if flow["source"] == nil {
			t.Errorf("flow[%d] missing 'source'", i)
		}
		if flow["target"] == nil {
			t.Errorf("flow[%d] missing 'target'", i)
		}
		if flow["item"] == nil {
			t.Errorf("flow[%d] missing 'item'", i)
		}
		if flow["rate_per_min"] == nil {
			t.Errorf("flow[%d] missing 'rate_per_min'", i)
		}
	}
}
