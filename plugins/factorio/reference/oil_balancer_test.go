package main

import (
	"testing"
)

// ─── Advanced Oil Processing ────────────────────────────────────────────────

func TestOilBalancer_AdvancedAllPetroleum(t *testing.T) {
	// The classic scenario: crack everything to petroleum gas.
	// Exact ratio: 20:5:17 (refineries : heavy crackers : light crackers)
	//
	// Per refinery/s (speed 1.0, craft 5s): 5 heavy, 9 light, 11 petroleum
	// Per heavy cracker/s (speed 1.0, craft 2s): consumes 20 heavy, produces 15 light
	// Per light cracker/s (speed 1.0, craft 2s): consumes 15 light, produces 10 petroleum
	//
	// Balance heavy: 5R = 20H → H = R/4
	// Balance light: 9R + 15H = 15L → L = 0.85R
	// At R=20: H=5, L=17
	//
	// Request 390 petroleum/min (the natural output of 20 refineries at ratio):
	//   Direct: 20 * 11 = 220/s → 13200/min... no, per second.
	//   Actually: 20 refineries * 11 petroleum/s = 220 petroleum/s from refineries
	//   17 light crackers * 10 petroleum/s = 170 petroleum/s from cracking
	//   Total: 390 petroleum/s
	//
	// Let's request a smaller target and verify the ratio holds.
	// At 1 refinery: 11 petrol/s direct + (0.25 heavy crackers * ... ) — fractional.
	// Better: request target and verify ratio of machine counts.
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 390}
	}`)

	stages := getStages(t, result)
	flows := getFlows(t, result)

	// Find stage counts
	refineries := findStage(stages, "advanced-oil-processing")
	heavyCrackers := findStage(stages, "heavy-oil-cracking")
	lightCrackers := findStage(stages, "light-oil-cracking")

	if refineries == nil {
		t.Fatal("expected refinery stage")
	}
	if heavyCrackers == nil {
		t.Fatal("expected heavy oil cracking stage")
	}
	if lightCrackers == nil {
		t.Fatal("expected light oil cracking stage")
	}

	// Verify 20:5:17 ratio
	r := refineries["machine_count"].(float64)
	h := heavyCrackers["machine_count"].(float64)
	l := lightCrackers["machine_count"].(float64)

	// At 390 petroleum/s target, exact ratio gives R=20, H=5, L=17
	approx(t, "refineries", r, 20, 0)
	approx(t, "heavy crackers", h, 5, 0)
	approx(t, "light crackers", l, 17, 0)

	// Should have flows connecting stages
	if len(flows) < 3 {
		t.Errorf("expected at least 3 flows (crude→refinery, heavy→cracker, light→cracker), got %d", len(flows))
	}

	// Should report raw inputs
	rawInputs := result["raw_inputs"].(map[string]any)
	crudeRate := rawInputs["crude-oil"].(float64)
	if crudeRate <= 0 {
		t.Errorf("expected positive crude-oil input rate, got %v", crudeRate)
	}
	waterRate := rawInputs["water"].(float64)
	if waterRate <= 0 {
		t.Errorf("expected positive water input rate, got %v", waterRate)
	}

	// Should report total power
	totalPower := result["total_power_kw"].(float64)
	if totalPower <= 0 {
		t.Errorf("expected positive total_power_kw, got %v", totalPower)
	}
}

func TestOilBalancer_AdvancedWithLubricant(t *testing.T) {
	// Want lubricant AND high petroleum — enough petroleum that heavy cracking is needed.
	// Lubricant recipe: 10 heavy oil → 10 lubricant (1s, chemical plant)
	// At 390 petroleum/s (full-crack ratio), lubricant consumes some heavy oil,
	// so more refineries are needed to compensate, and heavy cracking still occurs.
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 390, "lubricant": 10}
	}`)

	stages := getStages(t, result)

	// Should have a lubricant stage
	lubStage := findStage(stages, "lubricant")
	if lubStage == nil {
		t.Fatal("expected lubricant production stage")
	}

	// With 390 petroleum target, heavy cracking is needed
	heavyCrackers := findStage(stages, "heavy-oil-cracking")
	if heavyCrackers == nil {
		t.Fatal("expected heavy oil cracking stage at high petroleum targets")
	}

	// Should need MORE refineries than the base 20 (since lubricant steals heavy oil)
	refineries := findStage(stages, "advanced-oil-processing")
	if refineries == nil {
		t.Fatal("expected refinery stage")
	}
	if refineries["machine_count"].(float64) <= 20 {
		t.Errorf("should need more than 20 refineries (lubricant consumes heavy oil), got %v",
			refineries["machine_count"])
	}
}

func TestOilBalancer_AdvancedOnlyHeavyOil(t *testing.T) {
	// Want only heavy oil — no cracking needed.
	// Surplus light oil and petroleum gas should be reported.
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"heavy-oil": 10}
	}`)

	stages := getStages(t, result)

	refineries := findStage(stages, "advanced-oil-processing")
	if refineries == nil {
		t.Fatal("expected refinery stage")
	}

	// Should NOT have cracking stages
	if findStage(stages, "heavy-oil-cracking") != nil {
		t.Error("should not have heavy oil cracking when only heavy oil is requested")
	}
	if findStage(stages, "light-oil-cracking") != nil {
		t.Error("should not have light oil cracking when only heavy oil is requested")
	}

	// Should report surplus light oil and petroleum gas
	surplus := result["surplus"].(map[string]any)
	if surplus["light-oil"] == nil || surplus["light-oil"].(float64) <= 0 {
		t.Error("expected surplus light-oil when only heavy oil is targeted")
	}
	if surplus["petroleum-gas"] == nil || surplus["petroleum-gas"].(float64) <= 0 {
		t.Error("expected surplus petroleum-gas when only heavy oil is targeted")
	}
}

// ─── Basic Oil Processing ───────────────────────────────────────────────────

func TestOilBalancer_BasicOil(t *testing.T) {
	// Basic: 100 crude → 45 petroleum (5s)
	// Per refinery/s: 45/5 = 9 petroleum/s
	// For 90 petroleum/s: ceil(90/9) = 10 refineries
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "basic-oil-processing",
		"targets": {"petroleum-gas": 90}
	}`)

	stages := getStages(t, result)

	refineries := findStage(stages, "basic-oil-processing")
	if refineries == nil {
		t.Fatal("expected refinery stage")
	}
	approx(t, "refineries", refineries["machine_count"].(float64), 10, 0)

	// No cracking stages for basic processing
	if findStage(stages, "heavy-oil-cracking") != nil {
		t.Error("basic oil processing should not have heavy cracking")
	}
}

// ─── Coal Liquefaction ──────────────────────────────────────────────────────

func TestOilBalancer_CoalLiquefaction(t *testing.T) {
	// Coal liquefaction: 10 coal + 25 heavy + 50 steam → 90 heavy + 20 light + 10 petroleum (5s)
	// Net heavy per cycle: 90 - 25 = 65
	// Per refinery/s: 65/5 = 13 net heavy/s, 4 light/s, 2 petroleum/s
	//
	// Request heavy oil — should report net production (not gross)
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "coal-liquefaction",
		"targets": {"heavy-oil": 13}
	}`)

	stages := getStages(t, result)

	refineries := findStage(stages, "coal-liquefaction")
	if refineries == nil {
		t.Fatal("expected coal liquefaction stage")
	}
	approx(t, "refineries", refineries["machine_count"].(float64), 1, 0)

	// Should require coal and steam as raw inputs
	rawInputs := result["raw_inputs"].(map[string]any)
	if rawInputs["coal"] == nil || rawInputs["coal"].(float64) <= 0 {
		t.Error("expected coal in raw inputs")
	}
	if rawInputs["steam"] == nil || rawInputs["steam"].(float64) <= 0 {
		t.Error("expected steam in raw inputs")
	}
}

// ─── Simple Coal Liquefaction (Space Age) ───────────────────────────────────

func TestOilBalancer_SimpleCoalLiquefaction(t *testing.T) {
	// Simple: 10 coal + 2 calcite + 25 sulfuric-acid → 50 heavy (5s)
	// Per refinery/s: 50/5 = 10 heavy/s
	// For 10 heavy/s: 1 refinery
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "simple-coal-liquefaction",
		"targets": {"heavy-oil": 10}
	}`)

	stages := getStages(t, result)

	refineries := findStage(stages, "simple-coal-liquefaction")
	if refineries == nil {
		t.Fatal("expected simple coal liquefaction stage")
	}
	approx(t, "refineries", refineries["machine_count"].(float64), 1, 0)

	// No cracking since only heavy oil
	if findStage(stages, "heavy-oil-cracking") != nil {
		t.Error("should not have cracking when only heavy oil targeted from simple coal liquefaction")
	}
}

// ─── Module Effects ─────────────────────────────────────────────────────────

func TestOilBalancer_WithProductivityModules(t *testing.T) {
	// 3x productivity-module-3 in refineries:
	//   Prod bonus: 3 * 0.10 = 0.30
	//   Speed penalty: 3 * (-0.15) = -0.45
	//   Effective speed: 1.0 * (1 - 0.45) = 0.55
	//   Output multiplier: 1.30
	//
	// Per refinery/s (advanced):
	//   Heavy: 25 * 1.30 * 0.55 / 5 = 3.575/s
	//   Light: 45 * 1.30 * 0.55 / 5 = 6.435/s
	//   Petrol: 55 * 1.30 * 0.55 / 5 = 7.865/s
	//
	// More output per refinery means fewer refineries for same target.
	resultBase := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 100}
	}`)
	resultMod := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 100},
		"modules": ["productivity-module-3", "productivity-module-3", "productivity-module-3"]
	}`)

	baseStages := getStages(t, resultBase)
	modStages := getStages(t, resultMod)

	baseRef := findStage(baseStages, "advanced-oil-processing")
	modRef := findStage(modStages, "advanced-oil-processing")

	// With productivity, more output per machine → fewer refineries needed
	// (despite speed penalty, the prod bonus increases fluid output)
	baseCount := baseRef["machine_count"].(float64)
	modCount := modRef["machine_count"].(float64)

	// Both should be valid (>0)
	if baseCount < 1 || modCount < 1 {
		t.Errorf("both should need at least 1 refinery: base=%v, modded=%v", baseCount, modCount)
	}

	// Productivity modules change the math — counts must differ
	if baseCount == modCount {
		t.Errorf("productivity modules should change refinery count: base=%v, modded=%v", baseCount, modCount)
	}
}

func TestOilBalancer_WithBeacons(t *testing.T) {
	// Beacons increase speed → fewer machines for same output
	resultBase := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 100}
	}`)
	resultBeacon := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 100},
		"beacon_count": 8,
		"beacon_modules": ["speed-module-3", "speed-module-3"]
	}`)

	baseStages := getStages(t, resultBase)
	beaconStages := getStages(t, resultBeacon)

	baseRef := findStage(baseStages, "advanced-oil-processing")
	beaconRef := findStage(beaconStages, "advanced-oil-processing")

	// With 8 beacons of speed-3, should need far fewer machines
	if beaconRef["machine_count"].(float64) >= baseRef["machine_count"].(float64) {
		t.Errorf("beaconed setup should need fewer refineries: base=%v, beaconed=%v",
			baseRef["machine_count"], beaconRef["machine_count"])
	}
}

// ─── Error Cases ────────────────────────────────────────────────────────────

func TestOilBalancer_UnknownProcessingType(t *testing.T) {
	_, code := runReference(t, `{
		"module": "oil_balancer",
		"processing_type": "nonexistent-processing",
		"targets": {"petroleum-gas": 100}
	}`)
	if code != 1 {
		t.Fatalf("expected exit 1 for unknown processing type, got %d", code)
	}
}

func TestOilBalancer_MissingTargets(t *testing.T) {
	_, code := runReference(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing"
	}`)
	if code != 1 {
		t.Fatalf("expected exit 1 for missing targets, got %d", code)
	}
}

func TestOilBalancer_EmptyTargets(t *testing.T) {
	_, code := runReference(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {}
	}`)
	if code != 1 {
		t.Fatalf("expected exit 1 for empty targets, got %d", code)
	}
}

// ─── Flow Graph Structure ───────────────────────────────────────────────────

func TestOilBalancer_FlowGraphStructure(t *testing.T) {
	// Verify the output is a proper flow graph with stages and flows
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 100}
	}`)

	stages := getStages(t, result)
	flows := getFlows(t, result)

	// Each stage should have required fields
	for _, s := range stages {
		stage := s.(map[string]any)
		if stage["id"] == nil {
			t.Error("stage missing id")
		}
		if stage["recipe"] == nil {
			t.Error("stage missing recipe")
		}
		if stage["machine_type"] == nil {
			t.Error("stage missing machine_type")
		}
		if stage["machine_count"] == nil {
			t.Error("stage missing machine_count")
		}
	}

	// Each flow should have required fields
	for _, f := range flows {
		flow := f.(map[string]any)
		if flow["source"] == nil {
			t.Error("flow missing source")
		}
		if flow["target"] == nil {
			t.Error("flow missing target")
		}
		if flow["fluid"] == nil {
			t.Error("flow missing fluid")
		}
		if flow["rate"] == nil {
			t.Error("flow missing rate")
		}
	}

	// Flow sources and targets should reference valid stage IDs
	stageIDs := make(map[string]bool)
	for _, s := range stages {
		stage := s.(map[string]any)
		stageIDs[stage["id"].(string)] = true
	}
	for _, f := range flows {
		flow := f.(map[string]any)
		src := flow["source"].(string)
		tgt := flow["target"].(string)
		// Sources can be "input" (raw materials) and targets can be "output" (final products)
		if src != "input" && !stageIDs[src] {
			t.Errorf("flow source %q not a valid stage ID", src)
		}
		if tgt != "output" && !stageIDs[tgt] {
			t.Errorf("flow target %q not a valid stage ID", tgt)
		}
	}
}

// ─── Test Helpers ───────────────────────────────────────────────────────────

func runOilBalancer(t *testing.T, query string) map[string]any {
	t.Helper()
	result, code := runReference(t, query)
	if code != 0 {
		t.Fatalf("oil_balancer exited %d for query: %s\nresult: %v", code, query, result)
	}
	if result["type"] != "result" {
		t.Fatalf("expected type=result, got %v", result["type"])
	}
	return result["data"].(map[string]any)
}

func getStages(t *testing.T, data map[string]any) []any {
	t.Helper()
	stages, ok := data["stages"].([]any)
	if !ok {
		t.Fatal("missing or invalid stages array in result data")
	}
	return stages
}

func getFlows(t *testing.T, data map[string]any) []any {
	t.Helper()
	flows, ok := data["flows"].([]any)
	if !ok {
		t.Fatal("missing or invalid flows array in result data")
	}
	return flows
}

func findStage(stages []any, recipe string) map[string]any {
	for _, s := range stages {
		stage := s.(map[string]any)
		if stage["recipe"] == recipe {
			return stage
		}
	}
	return nil
}
