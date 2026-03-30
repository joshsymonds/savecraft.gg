package main

import (
	"testing"
)

// ─── Backwards Compatibility ─────────────────────────────────────────────────

func TestExisting_NoSaveDataProducesIdenticalOutput(t *testing.T) {
	// Query without existing_machines or actual_flow must produce identical output
	data := runRatio(t, `{"module":"ratio_calculator","target_item":"iron-gear-wheel","target_rate":60}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	// No existing/delta/status fields should be present
	if _, ok := gearStage["existing"]; ok {
		t.Error("existing field should not be present without save data")
	}
	if _, ok := gearStage["deficit_rate"]; ok {
		t.Error("deficit_rate field should not be present without save data")
	}
	if _, ok := gearStage["status"]; ok {
		t.Error("status field should not be present without save data")
	}
	// No bottlenecks in output
	if _, ok := data["bottlenecks"]; ok {
		t.Error("bottlenecks should not be present without save data")
	}
}

// ─── Status Classification ───────────────────────────────────────────────────

func TestExisting_MissingMachines(t *testing.T) {
	// Player has NO machines for iron-gear-wheel recipe
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"existing_machines":{"by_recipe":{},"by_type":{},"beacon_count":0}
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	status, _ := gearStage["status"].(string)
	if status != "missing" {
		t.Errorf("status = %q, want 'missing'", status)
	}
}

func TestExisting_SufficientMachines(t *testing.T) {
	// iron-gear-wheel at 60/min with AM2: needs ceil(1/s / 1.5/s/machine) = 1 machine
	// Give player exactly 1 AM2 — should be sufficient (not surplus)
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"assembler_tier":"assembling-machine-2",
		"existing_machines":{
			"by_recipe":{
				"iron-gear-wheel":{"machine_type":"assembling-machine-2","count":1,"modules":{}}
			},
			"by_type":{"assembling-machine":1},
			"beacon_count":0
		}
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	status, _ := gearStage["status"].(string)
	if status != "sufficient" {
		t.Errorf("status = %q, want 'sufficient'", status)
	}
}

func TestExisting_DeficitMachines(t *testing.T) {
	// electronic-circuit at 120/min with AM2 needs multiple machines
	// Give player only 1 AM2 — should be deficit
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"electronic-circuit",
		"target_rate":120,
		"assembler_tier":"assembling-machine-2",
		"existing_machines":{
			"by_recipe":{
				"electronic-circuit":{"machine_type":"assembling-machine-2","count":1,"modules":{}}
			},
			"by_type":{"assembling-machine":1},
			"beacon_count":0
		}
	}`)
	stages := ratioGetStages(t, data)

	circuitStage := ratioFindStage(stages, "electronic-circuit")
	if circuitStage == nil {
		t.Fatal("missing electronic-circuit stage")
	}
	status, _ := circuitStage["status"].(string)
	if status != "deficit" {
		t.Errorf("status = %q, want 'deficit'", status)
	}
	deficitRate, _ := circuitStage["deficit_rate"].(float64)
	if deficitRate <= 0 {
		t.Errorf("deficit_rate = %v, want > 0", deficitRate)
	}
}

// ─── Effective Rate with Tier Mismatch ───────────────────────────────────────

func TestExisting_TierMismatch_AM2vsAM3(t *testing.T) {
	// Query assumes AM3 but player has AM2 — effective rate will be lower
	// AM2 speed=0.75, AM3 speed=1.25
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"assembler_tier":"assembling-machine-3",
		"existing_machines":{
			"by_recipe":{
				"iron-gear-wheel":{"machine_type":"assembling-machine-2","count":1,"modules":{}}
			},
			"by_type":{"assembling-machine":1},
			"beacon_count":0
		}
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	existing, ok := gearStage["existing"].(map[string]any)
	if !ok {
		t.Fatal("missing existing info")
	}
	effectiveRate, _ := existing["effective_rate"].(float64)
	if effectiveRate <= 0 {
		t.Errorf("effective_rate = %v, want > 0", effectiveRate)
	}
	// AM2 at 0.75 speed / 0.5s = 1.5 items/s = 90/min for 1 machine
	if effectiveRate > 100 {
		t.Errorf("effective_rate = %v, expected ~90/min for 1 AM2", effectiveRate)
	}
}

// ─── Module Mismatch ─────────────────────────────────────────────────────────

func TestExisting_ModuleMismatch_SpeedVsProd(t *testing.T) {
	// Query assumes prod modules, player has speed modules
	// This changes effective rate significantly
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":120,
		"assembler_tier":"assembling-machine-3",
		"modules":["productivity-module-3","productivity-module-3"],
		"existing_machines":{
			"by_recipe":{
				"iron-gear-wheel":{"machine_type":"assembling-machine-3","count":1,"modules":{"speed-module-3":2}}
			},
			"by_type":{"assembling-machine":1},
			"beacon_count":0
		}
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	existing, ok := gearStage["existing"].(map[string]any)
	if !ok {
		t.Fatal("missing existing info")
	}
	// Speed modules give faster crafting but no prod bonus
	// The effective rate with speed modules should differ from the ideal rate
	// (which uses prod modules). This verifies module config actually affects the computation.
	effectiveRate, _ := existing["effective_rate"].(float64)
	if effectiveRate <= 0 {
		t.Fatal("effective_rate should be > 0")
	}
	// The ideal rate uses prod3 modules (slower crafting, bonus output).
	// The existing rate uses speed3 modules (faster crafting, no bonus output).
	// These must differ to prove module effects are computed from real config.
	idealRate := gearStage["rate_per_min"].(float64)
	if effectiveRate == idealRate {
		t.Errorf("effective_rate (%v) equals ideal rate (%v) — module config should cause a difference", effectiveRate, idealRate)
	}
}

// ─── Bottlenecks ─────────────────────────────────────────────────────────────

func TestExisting_BottlenecksSortedByDeficit(t *testing.T) {
	// electronic-circuit at high rate, player has very few machines
	// Should produce bottlenecks sorted by deficit magnitude
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"electronic-circuit",
		"target_rate":600,
		"assembler_tier":"assembling-machine-2",
		"existing_machines":{
			"by_recipe":{
				"electronic-circuit":{"machine_type":"assembling-machine-2","count":1,"modules":{}},
				"copper-cable":{"machine_type":"assembling-machine-2","count":1,"modules":{}}
			},
			"by_type":{"assembling-machine":2},
			"beacon_count":0
		}
	}`)

	bottlenecks, ok := data["bottlenecks"].([]any)
	if !ok || len(bottlenecks) == 0 {
		t.Fatal("expected non-empty bottlenecks array")
	}

	// Verify sorted by deficit magnitude (descending)
	var prevDeficit float64
	for i, b := range bottlenecks {
		bn := b.(map[string]any)
		needed, _ := bn["needed_rate"].(float64)
		existing, _ := bn["existing_rate"].(float64)
		deficit := needed - existing
		if i > 0 && deficit > prevDeficit {
			t.Errorf("bottlenecks not sorted: deficit[%d]=%v > deficit[%d]=%v", i, deficit, i-1, prevDeficit)
		}
		prevDeficit = deficit
	}
}

// ─── Diagnosis Categories ────────────────────────────────────────────────────

func TestExisting_DiagnosisUnderbuilt(t *testing.T) {
	// Player has machines but not enough
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"electronic-circuit",
		"target_rate":600,
		"assembler_tier":"assembling-machine-2",
		"existing_machines":{
			"by_recipe":{
				"electronic-circuit":{"machine_type":"assembling-machine-2","count":1,"modules":{}}
			},
			"by_type":{"assembling-machine":1},
			"beacon_count":0
		}
	}`)
	bottlenecks, ok := data["bottlenecks"].([]any)
	if !ok || len(bottlenecks) == 0 {
		t.Fatal("expected bottlenecks")
	}
	// Find electronic-circuit bottleneck
	for _, b := range bottlenecks {
		bn := b.(map[string]any)
		if bn["item"] == "electronic-circuit" {
			diagnosis, _ := bn["diagnosis"].(string)
			if diagnosis != "underbuilt" {
				t.Errorf("diagnosis = %q, want 'underbuilt'", diagnosis)
			}
			return
		}
	}
	t.Error("electronic-circuit not found in bottlenecks")
}

func TestExisting_DiagnosisMissing(t *testing.T) {
	// Player has no machines at all — items in DAG should be diagnosed as "missing"
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"existing_machines":{"by_recipe":{},"by_type":{},"beacon_count":0}
	}`)
	bottlenecks, ok := data["bottlenecks"].([]any)
	if !ok || len(bottlenecks) == 0 {
		t.Fatal("expected bottlenecks")
	}
	for _, b := range bottlenecks {
		bn := b.(map[string]any)
		if bn["item"] == "iron-gear-wheel" {
			diagnosis, _ := bn["diagnosis"].(string)
			if diagnosis != "missing" {
				t.Errorf("diagnosis = %q, want 'missing'", diagnosis)
			}
			return
		}
	}
	t.Error("iron-gear-wheel not found in bottlenecks")
}

func TestExisting_DiagnosisUnderthroughput(t *testing.T) {
	// Player has enough machines (effective rate >= needed) but actual flow is much lower
	// This means machines are starved or blocked
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"assembler_tier":"assembling-machine-2",
		"existing_machines":{
			"by_recipe":{
				"iron-gear-wheel":{"machine_type":"assembling-machine-2","count":2,"modules":{}}
			},
			"by_type":{"assembling-machine":2},
			"beacon_count":0
		},
		"actual_flow":{
			"items":{
				"iron-gear-wheel":{"produced_per_min":20,"consumed_per_min":15}
			},
			"fluids":{}
		}
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	existing, ok := gearStage["existing"].(map[string]any)
	if !ok {
		t.Fatal("missing existing info")
	}
	actualRate, _ := existing["actual_rate"].(float64)
	if actualRate != 20 {
		t.Errorf("actual_rate = %v, want 20", actualRate)
	}

	// Check bottleneck diagnosis
	bottlenecks, ok := data["bottlenecks"].([]any)
	if !ok || len(bottlenecks) == 0 {
		t.Fatal("expected bottlenecks")
	}
	for _, b := range bottlenecks {
		bn := b.(map[string]any)
		if bn["item"] == "iron-gear-wheel" {
			diagnosis, _ := bn["diagnosis"].(string)
			if diagnosis != "underthroughput" {
				t.Errorf("diagnosis = %q, want 'underthroughput'", diagnosis)
			}
			return
		}
	}
	t.Error("iron-gear-wheel not found in bottlenecks")
}

// ─── Production Flow Integration ─────────────────────────────────────────────

func TestExisting_ActualFlowPopulated(t *testing.T) {
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"assembler_tier":"assembling-machine-2",
		"existing_machines":{
			"by_recipe":{
				"iron-gear-wheel":{"machine_type":"assembling-machine-2","count":1,"modules":{}}
			},
			"by_type":{"assembling-machine":1},
			"beacon_count":0
		},
		"actual_flow":{
			"items":{
				"iron-gear-wheel":{"produced_per_min":85,"consumed_per_min":80}
			},
			"fluids":{}
		}
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	existing, ok := gearStage["existing"].(map[string]any)
	if !ok {
		t.Fatal("missing existing info")
	}
	actualRate, _ := existing["actual_rate"].(float64)
	if actualRate != 85 {
		t.Errorf("actual_rate = %v, want 85", actualRate)
	}
}

// ─── Full Factory Snapshot (all stages get compared) ─────────────────────────

func TestExisting_FullFactorySnapshot(t *testing.T) {
	// electronic-circuit: needs copper-cable + iron-plate
	// Provide machines for electronic-circuit AND copper-cable but NOT iron-plate smelting
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"electronic-circuit",
		"target_rate":60,
		"assembler_tier":"assembling-machine-2",
		"existing_machines":{
			"by_recipe":{
				"electronic-circuit":{"machine_type":"assembling-machine-2","count":5,"modules":{}},
				"copper-cable":{"machine_type":"assembling-machine-2","count":3,"modules":{}}
			},
			"by_type":{"assembling-machine":8},
			"beacon_count":0
		}
	}`)
	stages := ratioGetStages(t, data)

	// electronic-circuit and copper-cable should have existing info
	ecStage := ratioFindStage(stages, "electronic-circuit")
	if ecStage == nil {
		t.Fatal("missing electronic-circuit stage")
	}
	if _, ok := ecStage["existing"].(map[string]any); !ok {
		t.Error("electronic-circuit should have existing info")
	}

	cableStage := ratioFindStage(stages, "copper-cable")
	if cableStage == nil {
		t.Fatal("missing copper-cable stage")
	}
	if _, ok := cableStage["existing"].(map[string]any); !ok {
		t.Error("copper-cable should have existing info")
	}

	// iron-plate is smelted (furnace recipe) — if player has no furnaces listed, it's "missing"
	ironStage := ratioFindStage(stages, "iron-plate")
	if ironStage == nil {
		t.Fatal("missing iron-plate stage")
	}
	status, _ := ironStage["status"].(string)
	if status != "missing" {
		t.Errorf("iron-plate status = %q, want 'missing' (no smelting machines provided)", status)
	}
}

// ─── Surplus Status ──────────────────────────────────────────────────────────

func TestExisting_SurplusMachines(t *testing.T) {
	// iron-gear-wheel at 60/min with AM2: needs 1 machine
	// Give player 5 AM2s — clearly surplus
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"assembler_tier":"assembling-machine-2",
		"existing_machines":{
			"by_recipe":{
				"iron-gear-wheel":{"machine_type":"assembling-machine-2","count":5,"modules":{}}
			},
			"by_type":{"assembling-machine":5},
			"beacon_count":0
		}
	}`)
	stages := ratioGetStages(t, data)

	gearStage := ratioFindStage(stages, "iron-gear-wheel")
	if gearStage == nil {
		t.Fatal("missing iron-gear-wheel stage")
	}
	status, _ := gearStage["status"].(string)
	if status != "surplus" {
		t.Errorf("status = %q, want 'surplus'", status)
	}
}

func TestExisting_SurplusNotInBottlenecks(t *testing.T) {
	// Surplus stages should NOT appear in bottlenecks
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":60,
		"assembler_tier":"assembling-machine-2",
		"existing_machines":{
			"by_recipe":{
				"iron-gear-wheel":{"machine_type":"assembling-machine-2","count":5,"modules":{}}
			},
			"by_type":{"assembling-machine":5},
			"beacon_count":0
		}
	}`)
	bottlenecks, ok := data["bottlenecks"].([]any)
	if ok {
		for _, b := range bottlenecks {
			bn := b.(map[string]any)
			if bn["item"] == "iron-gear-wheel" {
				t.Error("surplus item iron-gear-wheel should not appear in bottlenecks")
			}
		}
	}
}

// ─── Wrong Modules Diagnosis ─────────────────────────────────────────────────

func TestExisting_DiagnosisWrongModules(t *testing.T) {
	// Query assumes AM3 (no modules), player has AM2 (no modules)
	// AM3 crafting speed=1.25, AM2 speed=0.75
	// iron-gear-wheel: 0.5s craft time
	// AM3: 1.25/0.5 = 2.5 items/s/machine = 150/min/machine
	// AM2: 0.75/0.5 = 1.5 items/s/machine = 90/min/machine
	// At 120/min: AM3 needs ceil(2/2.5)=1, AM2 at 1 machine gives 90 → deficit
	// But 1 machine at AM3 config gives 150 >= 120 → same count would work → wrong_modules
	data := runRatio(t, `{
		"module":"ratio_calculator",
		"target_item":"iron-gear-wheel",
		"target_rate":120,
		"assembler_tier":"assembling-machine-3",
		"existing_machines":{
			"by_recipe":{
				"iron-gear-wheel":{"machine_type":"assembling-machine-2","count":1,"modules":{}}
			},
			"by_type":{"assembling-machine":1},
			"beacon_count":0
		}
	}`)
	bottlenecks, ok := data["bottlenecks"].([]any)
	if !ok || len(bottlenecks) == 0 {
		t.Fatal("expected bottlenecks")
	}
	for _, b := range bottlenecks {
		bn := b.(map[string]any)
		if bn["item"] == "iron-gear-wheel" {
			diagnosis, _ := bn["diagnosis"].(string)
			if diagnosis != "wrong_modules" {
				t.Errorf("diagnosis = %q, want 'wrong_modules'", diagnosis)
			}
			return
		}
	}
	t.Error("iron-gear-wheel not found in bottlenecks")
}
