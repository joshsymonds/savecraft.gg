package main

import (
	"fmt"
	"testing"
)

// ─── Backwards Compatibility ─────────────────────────────────────────────────

func TestOilExisting_NoSaveDataProducesIdenticalOutput(t *testing.T) {
	// Query without existing_setup or actual_flow must produce identical output.
	// No existing/deficit_rate/status fields on stages, no bottlenecks in result.
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 390}
	}`)

	stages := getStages(t, result)

	for _, s := range stages {
		stage := s.(map[string]any)
		recipe := stage["recipe"].(string)
		if _, ok := stage["existing"]; ok {
			t.Errorf("stage %q: existing field should not be present without save data", recipe)
		}
		if _, ok := stage["deficit_rate"]; ok {
			t.Errorf("stage %q: deficit_rate field should not be present without save data", recipe)
		}
		if _, ok := stage["status"]; ok {
			t.Errorf("stage %q: status field should not be present without save data", recipe)
		}
	}

	if _, ok := result["bottlenecks"]; ok {
		t.Error("bottlenecks should not be present without save data")
	}
}

func TestOilExisting_EmptyExistingSetupProducesValidOutput(t *testing.T) {
	// Empty existing_setup (player has no machines) — should still compute balancer
	// output and mark all stages as "missing".
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 390},
		"existing_setup": {"by_recipe": {}, "by_type": {}, "beacon_count": 0}
	}`)

	stages := getStages(t, result)

	// All stages should be marked "missing"
	for _, s := range stages {
		stage := s.(map[string]any)
		recipe := stage["recipe"].(string)
		status, ok := stage["status"].(string)
		if !ok {
			t.Errorf("stage %q: missing status field with empty existing_setup", recipe)
			continue
		}
		if status != "missing" {
			t.Errorf("stage %q: status = %q, want 'missing'", recipe, status)
		}
	}

	// Should have bottlenecks for every stage
	bottlenecks, ok := result["bottlenecks"].([]any)
	if !ok {
		t.Fatal("expected bottlenecks array with empty existing_setup")
	}
	if len(bottlenecks) == 0 {
		t.Error("expected at least one bottleneck with empty existing_setup")
	}
}

// ─── Status Classification ───────────────────────────────────────────────────

func TestOilExisting_SufficientMachines(t *testing.T) {
	// 390 petroleum/s with advanced-oil-processing → 20:5:17 (refinery:heavy:light).
	// Give player exactly 20 refineries, 5 heavy crackers, 17 light crackers
	// with matching machine types → all stages "sufficient".
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 390},
		"existing_setup": {
			"by_recipe": {
				"advanced-oil-processing": {"machine_type": "oil-refinery", "count": 20, "modules": {}},
				"heavy-oil-cracking": {"machine_type": "chemical-plant", "count": 5, "modules": {}},
				"light-oil-cracking": {"machine_type": "chemical-plant", "count": 17, "modules": {}}
			},
			"by_type": {"oil-refinery": 20, "chemical-plant": 22},
			"beacon_count": 0
		}
	}`)

	stages := getStages(t, result)

	for _, s := range stages {
		stage := s.(map[string]any)
		recipe := stage["recipe"].(string)
		status, ok := stage["status"].(string)
		if !ok {
			t.Errorf("stage %q: missing status field", recipe)
			continue
		}
		if status != "sufficient" {
			t.Errorf("stage %q: status = %q, want 'sufficient'", recipe, status)
		}
		// Should have existing info populated
		existing, ok := stage["existing"].(map[string]any)
		if !ok {
			t.Errorf("stage %q: missing existing info", recipe)
			continue
		}
		if existing["machine_type"] == nil {
			t.Errorf("stage %q: existing missing machine_type", recipe)
		}
		if existing["count"] == nil {
			t.Errorf("stage %q: existing missing count", recipe)
		}
	}

	// No bottlenecks when everything is sufficient
	if bns, ok := result["bottlenecks"].([]any); ok && len(bns) > 0 {
		t.Errorf("expected no bottlenecks when all stages sufficient, got %d", len(bns))
	}
}

func TestOilExisting_SurplusMachines(t *testing.T) {
	// Give player MORE machines than needed → "surplus".
	// Basic oil: 90 petroleum/s → 10 refineries needed.
	// Give 15 refineries.
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "basic-oil-processing",
		"targets": {"petroleum-gas": 90},
		"existing_setup": {
			"by_recipe": {
				"basic-oil-processing": {"machine_type": "oil-refinery", "count": 15, "modules": {}}
			},
			"by_type": {"oil-refinery": 15},
			"beacon_count": 0
		}
	}`)

	stages := getStages(t, result)
	refinery := findStage(stages, "basic-oil-processing")
	if refinery == nil {
		t.Fatal("missing refinery stage")
	}

	status, _ := refinery["status"].(string)
	if status != "surplus" {
		t.Errorf("status = %q, want 'surplus'", status)
	}
}

func TestOilExisting_DeficitUnderbuilt(t *testing.T) {
	// Basic oil: 90 petroleum/s → 10 refineries needed.
	// Give player only 5 refineries → "deficit" with "underbuilt" diagnosis.
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "basic-oil-processing",
		"targets": {"petroleum-gas": 90},
		"existing_setup": {
			"by_recipe": {
				"basic-oil-processing": {"machine_type": "oil-refinery", "count": 5, "modules": {}}
			},
			"by_type": {"oil-refinery": 5},
			"beacon_count": 0
		}
	}`)

	stages := getStages(t, result)
	refinery := findStage(stages, "basic-oil-processing")
	if refinery == nil {
		t.Fatal("missing refinery stage")
	}

	status, _ := refinery["status"].(string)
	if status != "deficit" {
		t.Errorf("status = %q, want 'deficit'", status)
	}

	deficitRate, _ := refinery["deficit_rate"].(float64)
	if deficitRate <= 0 {
		t.Errorf("deficit_rate = %v, want > 0", deficitRate)
	}

	// Check bottleneck diagnosis
	bottlenecks, ok := result["bottlenecks"].([]any)
	if !ok || len(bottlenecks) == 0 {
		t.Fatal("expected bottlenecks")
	}
	bn := bottlenecks[0].(map[string]any)
	diagnosis, _ := bn["diagnosis"].(string)
	if diagnosis != "underbuilt" {
		t.Errorf("diagnosis = %q, want 'underbuilt'", diagnosis)
	}
}

func TestOilExisting_ProdModulesPlayerNoModules(t *testing.T) {
	// Query with prod-3 modules. Player has more machines but no modules.
	// Prod-3: speed -0.45 + prod +0.30 = net 0.715x output per machine.
	// No modules: 1.0x output per machine (higher).
	// Player with more machines and higher per-machine rate = surplus.
	resultIdeal := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 100},
		"modules": ["productivity-module-3", "productivity-module-3", "productivity-module-3"]
	}`)
	idealStages := getStages(t, resultIdeal)
	idealRef := findStage(idealStages, "advanced-oil-processing")
	if idealRef == nil {
		t.Fatal("missing refinery stage in ideal result")
	}
	playerCount := int(idealRef["machine_count"].(float64)) + 2 // ensure surplus regardless of rounding

	result := runOilBalancer(t, fmt.Sprintf(`{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 100},
		"modules": ["productivity-module-3", "productivity-module-3", "productivity-module-3"],
		"existing_setup": {
			"by_recipe": {
				"advanced-oil-processing": {"machine_type": "oil-refinery", "count": %d, "modules": {}}
			},
			"by_type": {"oil-refinery": %d},
			"beacon_count": 0
		}
	}`, playerCount, playerCount))

	stages := getStages(t, result)
	refinery := findStage(stages, "advanced-oil-processing")
	if refinery == nil {
		t.Fatal("missing refinery stage")
	}

	status, _ := refinery["status"].(string)
	if status != "surplus" {
		t.Errorf("status = %q, want 'surplus' (no modules = higher per-machine rate + extra machines)", status)
	}
}

func TestOilExisting_WrongModulesDiagnosis(t *testing.T) {
	// For wrong_modules to trigger:
	// 1. Player's effective rate < needed rate (deficit)
	// 2. Player has count >= ceil(needed)
	// 3. Same count with query's modules would be sufficient
	//
	// Query with 2x speed-module-3 (+1.0 speed bonus):
	//   Effective speed = 1.0 * (1 + 1.0) = 2.0
	//   Per refinery: 45 * 1.0 * 2.0 / 5 = 18 petrol/s
	//   For 90 petrol/s: ceil(90/18) = 5 refineries
	//
	// Player has 5 refineries with 2x quality-module-3 (-0.10 speed):
	//   Effective speed = 1.0 * (1 - 0.10) = 0.90
	//   Per refinery: 45 * 1.0 * 0.90 / 5 = 8.1 petrol/s
	//   5 refineries: 40.5 petrol/s < 90 → deficit
	//   Hypothetical (5 refineries with speed-module-3): 5 * 18 = 90 ✓ → wrong_modules
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "basic-oil-processing",
		"targets": {"petroleum-gas": 90},
		"modules": ["speed-module-3", "speed-module-3"],
		"existing_setup": {
			"by_recipe": {
				"basic-oil-processing": {
					"machine_type": "oil-refinery",
					"count": 5,
					"modules": {"quality-module-3": 2}
				}
			},
			"by_type": {"oil-refinery": 5},
			"beacon_count": 0
		}
	}`)

	stages := getStages(t, result)
	refinery := findStage(stages, "basic-oil-processing")
	if refinery == nil {
		t.Fatal("missing refinery stage")
	}

	status, _ := refinery["status"].(string)
	if status != "deficit" {
		t.Errorf("status = %q, want 'deficit' (quality modules lack speed)", status)
	}

	bottlenecks, ok := result["bottlenecks"].([]any)
	if !ok || len(bottlenecks) == 0 {
		t.Fatal("expected bottlenecks for wrong_modules scenario")
	}
	bn := bottlenecks[0].(map[string]any)
	diagnosis, _ := bn["diagnosis"].(string)
	if diagnosis != "wrong_modules" {
		t.Errorf("diagnosis = %q, want 'wrong_modules'", diagnosis)
	}
}

func TestOilExisting_Underthroughput(t *testing.T) {
	// Player has enough machines and correct modules, but actual_flow shows
	// low production (e.g. supply bottleneck, not enough crude oil input).
	// Basic oil: 90 petrol/s → 10 refineries. Give 10 refineries, but
	// actual_flow shows only 30 petrol/s produced (< 70% of effective rate).
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "basic-oil-processing",
		"targets": {"petroleum-gas": 90},
		"existing_setup": {
			"by_recipe": {
				"basic-oil-processing": {"machine_type": "oil-refinery", "count": 10, "modules": {}}
			},
			"by_type": {"oil-refinery": 10},
			"beacon_count": 0
		},
		"actual_flow": {
			"items": {},
			"fluids": {
				"petroleum-gas": {"produced_per_min": 1800, "consumed_per_min": 0}
			}
		}
	}`)

	// 1800/min = 30/s, which is < 70% of effective rate (90/s) → underthroughput
	stages := getStages(t, result)
	refinery := findStage(stages, "basic-oil-processing")
	if refinery == nil {
		t.Fatal("missing refinery stage")
	}

	status, _ := refinery["status"].(string)
	if status != "deficit" {
		t.Errorf("status = %q, want 'deficit' (underthroughput)", status)
	}

	bottlenecks, ok := result["bottlenecks"].([]any)
	if !ok || len(bottlenecks) == 0 {
		t.Fatal("expected bottlenecks for underthroughput scenario")
	}
	bn := bottlenecks[0].(map[string]any)
	diagnosis, _ := bn["diagnosis"].(string)
	if diagnosis != "underthroughput" {
		t.Errorf("diagnosis = %q, want 'underthroughput'", diagnosis)
	}

	// Check existing info has actual_rate populated
	existing, ok := refinery["existing"].(map[string]any)
	if !ok {
		t.Fatal("missing existing info")
	}
	actualRate, _ := existing["actual_rate"].(float64)
	if actualRate <= 0 {
		t.Errorf("actual_rate = %v, want > 0", actualRate)
	}
}

// ─── Ceil Comparison ─────────────────────────────────────────────────────────

func TestOilExisting_CeilComparison(t *testing.T) {
	// Advanced oil with a target that produces a fractional refinery count.
	// 50 petroleum/s: exact is ~2.56 refineries → ceil = 3.
	// Player with 3 refineries → sufficient.
	// Player with 2 refineries → deficit.

	// First verify the ideal count is fractional and ceils to a known value
	resultIdeal := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "basic-oil-processing",
		"targets": {"petroleum-gas": 20}
	}`)
	idealStages := getStages(t, resultIdeal)
	idealRef := findStage(idealStages, "basic-oil-processing")
	idealCount := idealRef["machine_count"].(float64)
	t.Logf("Ideal refinery count for 20 petrol/s: %v", idealCount)

	// With basic oil: 9 petrol/s per refinery → 20/9 = 2.22 → ceil = 3
	if idealCount != 3 {
		t.Fatalf("expected 3 refineries for 20 petrol/s basic oil, got %v", idealCount)
	}

	// Player with 3 → sufficient
	result3 := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "basic-oil-processing",
		"targets": {"petroleum-gas": 20},
		"existing_setup": {
			"by_recipe": {
				"basic-oil-processing": {"machine_type": "oil-refinery", "count": 3, "modules": {}}
			},
			"by_type": {"oil-refinery": 3},
			"beacon_count": 0
		}
	}`)
	stages3 := getStages(t, result3)
	ref3 := findStage(stages3, "basic-oil-processing")
	status3, _ := ref3["status"].(string)
	if status3 != "sufficient" {
		t.Errorf("3 refineries (= ceil(2.22)): status = %q, want 'sufficient'", status3)
	}

	// Player with 2 → deficit (2 < ceil(2.22) = 3)
	result2 := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "basic-oil-processing",
		"targets": {"petroleum-gas": 20},
		"existing_setup": {
			"by_recipe": {
				"basic-oil-processing": {"machine_type": "oil-refinery", "count": 2, "modules": {}}
			},
			"by_type": {"oil-refinery": 2},
			"beacon_count": 0
		}
	}`)
	stages2 := getStages(t, result2)
	ref2 := findStage(stages2, "basic-oil-processing")
	status2, _ := ref2["status"].(string)
	if status2 != "deficit" {
		t.Errorf("2 refineries (< ceil(2.22) = 3): status = %q, want 'deficit'", status2)
	}
}

// ─── Bottleneck Sorting ──────────────────────────────────────────────────────

func TestOilExisting_BottlenecksSortedByDeficit(t *testing.T) {
	// Advanced oil 390 petroleum: 20:5:17 ratio.
	// Give player: 10 refineries (deficit 10), 2 heavy crackers (deficit 3), 17 light crackers (sufficient).
	// Bottlenecks should be sorted by deficit magnitude: refineries first (larger deficit).
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 390},
		"existing_setup": {
			"by_recipe": {
				"advanced-oil-processing": {"machine_type": "oil-refinery", "count": 10, "modules": {}},
				"heavy-oil-cracking": {"machine_type": "chemical-plant", "count": 2, "modules": {}},
				"light-oil-cracking": {"machine_type": "chemical-plant", "count": 17, "modules": {}}
			},
			"by_type": {"oil-refinery": 10, "chemical-plant": 19},
			"beacon_count": 0
		}
	}`)

	bottlenecks, ok := result["bottlenecks"].([]any)
	if !ok || len(bottlenecks) < 2 {
		t.Fatalf("expected at least 2 bottlenecks, got %v", result["bottlenecks"])
	}

	// First bottleneck should have larger deficit than second
	bn0 := bottlenecks[0].(map[string]any)
	bn1 := bottlenecks[1].(map[string]any)

	deficit0 := bn0["needed_rate"].(float64) - bn0["existing_rate"].(float64)
	deficit1 := bn1["needed_rate"].(float64) - bn1["existing_rate"].(float64)

	if deficit0 < deficit1 {
		t.Errorf("bottlenecks not sorted by deficit: first=%v (deficit %.1f), second=%v (deficit %.1f)",
			bn0["recipe"], deficit0, bn1["recipe"], deficit1)
	}

	// Verify the refinery bottleneck comes first (larger deficit from 10 missing machines)
	if bn0["recipe"] != "advanced-oil-processing" {
		t.Errorf("expected refinery bottleneck first (largest deficit), got %q", bn0["recipe"])
	}
}

// ─── Beacon Limitation ───────────────────────────────────────────────────────

func TestOilExisting_BeaconCountIgnoredInComparison(t *testing.T) {
	// Beacon data from saves is currently a no-op in comparison — the save only
	// provides a total beacon count, not per-recipe assignments. This test
	// documents the limitation so it breaks when beacon support is added.
	//
	// Basic oil: 90 petrol/s → 10 refineries. Give 10 refineries with beacon_count=8.
	// Result should be identical to beacon_count=0 (beacons are ignored).
	resultNoBeacons := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "basic-oil-processing",
		"targets": {"petroleum-gas": 90},
		"existing_setup": {
			"by_recipe": {
				"basic-oil-processing": {"machine_type": "oil-refinery", "count": 10, "modules": {}}
			},
			"by_type": {"oil-refinery": 10},
			"beacon_count": 0
		}
	}`)
	resultWithBeacons := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "basic-oil-processing",
		"targets": {"petroleum-gas": 90},
		"existing_setup": {
			"by_recipe": {
				"basic-oil-processing": {"machine_type": "oil-refinery", "count": 10, "modules": {}}
			},
			"by_type": {"oil-refinery": 10},
			"beacon_count": 8
		}
	}`)

	stagesNo := getStages(t, resultNoBeacons)
	stagesWith := getStages(t, resultWithBeacons)

	refNo := findStage(stagesNo, "basic-oil-processing")
	refWith := findStage(stagesWith, "basic-oil-processing")

	// Both should have identical status — beacons are ignored
	if refNo["status"] != refWith["status"] {
		t.Errorf("beacon_count should not affect comparison: no_beacons=%v, with_beacons=%v",
			refNo["status"], refWith["status"])
	}
}
