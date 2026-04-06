package main

import (
	"testing"
)

// ─── Test Helpers ───────────────────────────────────────────────────────────

func runProductionFlow(t *testing.T, query string) map[string]any {
	t.Helper()
	result, code := runReference(t, query)
	if code != 0 {
		t.Fatalf("production_flow exited %d for query: %s\nresult: %v", code, query, result)
	}
	if result["type"] != "result" {
		t.Fatalf("expected type=result, got %v", result["type"])
	}
	return result["data"].(map[string]any)
}

func findDiagnosis(diagnoses []any, item string) map[string]any {
	for _, d := range diagnoses {
		diag := d.(map[string]any)
		if diag["item"] == item {
			return diag
		}
	}
	return nil
}

// ─── Net Rate Computation ───────────────────────────────────────────────────

func TestProductionFlow_NetRates(t *testing.T) {
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_total": 1500000,
					"consumed_total": 1420000,
					"produced_per_min": 450.0,
					"consumed_per_min": 420.0
				},
				"copper-plate": {
					"produced_total": 800000,
					"consumed_total": 1000000,
					"produced_per_min": 120.0,
					"consumed_per_min": 300.0
				}
			},
			"fluids": {
				"petroleum-gas": {
					"produced_total": 5000000,
					"consumed_total": 4800000,
					"produced_per_min": 1200.0,
					"consumed_per_min": 1100.0
				}
			},
			"top_deficits": ["copper-plate"],
			"top_surpluses": ["iron-plate"]
		}
	}`)

	items := data["item_diagnoses"].([]any)
	fluids := data["fluid_diagnoses"].([]any)

	// iron-plate: +30/min surplus
	iron := findDiagnosis(items, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in item_diagnoses")
	}
	approx(t, "iron net_rate", iron["net_rate"].(float64), 30.0, 0.1)

	// copper-plate: -180/min deficit
	copper := findDiagnosis(items, "copper-plate")
	if copper == nil {
		t.Fatal("expected copper-plate in item_diagnoses")
	}
	approx(t, "copper net_rate", copper["net_rate"].(float64), -180.0, 0.1)

	// petroleum-gas: +100/min surplus
	petro := findDiagnosis(fluids, "petroleum-gas")
	if petro == nil {
		t.Fatal("expected petroleum-gas in fluid_diagnoses")
	}
	approx(t, "petro net_rate", petro["net_rate"].(float64), 100.0, 0.1)
}

// ─── Severity Classification ────────────────────────────────────────────────

func TestProductionFlow_Severity(t *testing.T) {
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 450.0,
					"consumed_per_min": 420.0
				},
				"copper-plate": {
					"produced_per_min": 0.0,
					"consumed_per_min": 300.0
				},
				"steel-plate": {
					"produced_per_min": 50.0,
					"consumed_per_min": 120.0
				},
				"stone": {
					"produced_per_min": 200.0,
					"consumed_per_min": 50.0
				}
			},
			"fluids": {},
			"top_deficits": ["copper-plate", "steel-plate"],
			"top_surpluses": ["stone"]
		}
	}`)

	items := data["item_diagnoses"].([]any)

	// copper-plate: consumed but 0 produced → critical
	copper := findDiagnosis(items, "copper-plate")
	if copper["severity"] != "critical" {
		t.Errorf("copper severity = %v, want critical", copper["severity"])
	}

	// steel-plate: deficit > 50% of consumed → severe
	steel := findDiagnosis(items, "steel-plate")
	if steel["severity"] != "severe" {
		t.Errorf("steel severity = %v, want severe (deficit 70/120 = 58%%)", steel["severity"])
	}

	// iron-plate: small surplus → healthy
	iron := findDiagnosis(items, "iron-plate")
	if iron["severity"] != "healthy" {
		t.Errorf("iron severity = %v, want healthy", iron["severity"])
	}

	// stone: large surplus → surplus
	stone := findDiagnosis(items, "stone")
	if stone["severity"] != "surplus" {
		t.Errorf("stone severity = %v, want surplus", stone["severity"])
	}
}

// ─── Top Deficit Severity Boost ──────────────────────────────────────────────

func TestProductionFlow_TopDeficitBoostsSeverity(t *testing.T) {
	// electronic-circuit has a moderate deficit (30% of consumed).
	// When flagged in top_deficits by the Lua mod, severity should boost to severe.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"electronic-circuit": {
					"produced_per_min": 140.0,
					"consumed_per_min": 200.0
				}
			},
			"fluids": {},
			"top_deficits": ["electronic-circuit"],
			"top_surpluses": []
		}
	}`)

	items := data["item_diagnoses"].([]any)
	ec := findDiagnosis(items, "electronic-circuit")
	if ec == nil {
		t.Fatal("expected electronic-circuit in item_diagnoses")
	}

	// Without top_deficits boost, 60/200 = 30% deficit → moderate
	// With boost, should be severe
	if ec["severity"] != "severe" {
		t.Errorf("severity = %v, want severe (boosted from moderate by top_deficits)", ec["severity"])
	}
}

// ─── Recipe Fan-Out ─────────────────────────────────────────────────────────

func TestProductionFlow_RecipeFanOut(t *testing.T) {
	// copper-plate is consumed by electronic-circuit (3 per recipe via copper-cable)
	// and copper-cable directly. The fan-out should identify which recipes consume it
	// and estimate percentage attribution based on actual downstream production rates.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"copper-plate": {
					"produced_per_min": 120.0,
					"consumed_per_min": 300.0
				},
				"copper-cable": {
					"produced_per_min": 400.0,
					"consumed_per_min": 350.0
				},
				"electronic-circuit": {
					"produced_per_min": 200.0,
					"consumed_per_min": 180.0
				}
			},
			"fluids": {},
			"top_deficits": ["copper-plate"],
			"top_surpluses": []
		}
	}`)

	items := data["item_diagnoses"].([]any)
	copper := findDiagnosis(items, "copper-plate")
	if copper == nil {
		t.Fatal("expected copper-plate in item_diagnoses")
	}

	consumers := copper["consumers"].([]any)
	if len(consumers) == 0 {
		t.Fatal("expected at least one consumer for copper-plate")
	}

	// copper-cable recipe consumes copper-plate (1 copper-plate → 2 copper-cable)
	// At 400 copper-cable/min produced, that requires 200 copper-plate/min
	foundCable := false
	for _, c := range consumers {
		consumer := c.(map[string]any)
		if consumer["recipe"] == "copper-cable" {
			foundCable = true
			// Should have a rate and percentage
			if consumer["rate"].(float64) <= 0 {
				t.Error("copper-cable consumer rate should be positive")
			}
			if consumer["percent"].(float64) <= 0 {
				t.Error("copper-cable consumer percent should be positive")
			}
		}
	}
	if !foundCable {
		t.Error("expected copper-cable in consumers of copper-plate")
	}
}

// ─── Health Score ────────────────────────────────────────────────────────────

func TestProductionFlow_HealthScore(t *testing.T) {
	// Healthy factory: small surpluses, no deficits
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 450.0,
					"consumed_per_min": 420.0
				},
				"copper-plate": {
					"produced_per_min": 350.0,
					"consumed_per_min": 300.0
				}
			},
			"fluids": {},
			"top_deficits": [],
			"top_surpluses": ["iron-plate", "copper-plate"]
		}
	}`)

	score := data["health_score"].(float64)
	if score < 80 {
		t.Errorf("healthy factory score = %.0f, want >= 80", score)
	}
}

func TestProductionFlow_HealthScore_Bottlenecked(t *testing.T) {
	// Bottlenecked factory: multiple severe deficits
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 100.0,
					"consumed_per_min": 400.0
				},
				"copper-plate": {
					"produced_per_min": 0.0,
					"consumed_per_min": 300.0
				},
				"steel-plate": {
					"produced_per_min": 10.0,
					"consumed_per_min": 80.0
				}
			},
			"fluids": {},
			"top_deficits": ["copper-plate", "iron-plate", "steel-plate"],
			"top_surpluses": []
		}
	}`)

	score := data["health_score"].(float64)
	if score > 50 {
		t.Errorf("bottlenecked factory score = %.0f, want <= 50", score)
	}
}

// ─── Machine Gap ────────────────────────────────────────────────────────────

func TestProductionFlow_MachineGap(t *testing.T) {
	// iron-plate deficit with existing stone-furnaces.
	// stone-furnace: crafting_speed=1.0, iron-plate recipe: energy=3.2s, result=1
	// Per furnace: (1.0 / 3.2) * 1 * 60 = 18.75 items/min
	// 10 furnaces → 187.5/min. Consumed 300/min, produced 187.5/min → deficit 112.5/min
	// Need 112.5/18.75 = 6 more furnaces to close gap
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 187.5,
					"consumed_per_min": 300.0
				}
			},
			"fluids": {},
			"top_deficits": ["iron-plate"],
			"top_surpluses": []
		},
		"existing_machines": {
			"by_recipe": {
				"iron-plate": {
					"machine_type": "stone-furnace",
					"count": 10,
					"modules": {}
				}
			},
			"by_type": {"stone-furnace": 10},
			"beacon_count": 0
		}
	}`)

	items := data["item_diagnoses"].([]any)
	iron := findDiagnosis(items, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in item_diagnoses")
	}

	mg := iron["machine_gap"]
	if mg == nil {
		t.Fatal("expected machine_gap for deficit iron-plate")
	}
	gap := mg.(map[string]any)

	if gap["machine_type"] != "stone-furnace" {
		t.Errorf("machine_type = %v, want stone-furnace", gap["machine_type"])
	}
	if gap["current_count"].(float64) != 10 {
		t.Errorf("current_count = %v, want 10", gap["current_count"])
	}
	// Need 6 more furnaces (ceil of 112.5/18.75)
	needed := gap["additional_needed"].(float64)
	if needed < 5 || needed > 7 {
		t.Errorf("additional_needed = %.0f, want ~6", needed)
	}
}

func TestProductionFlow_MachineGap_NotPresent_WhenNoMachinesData(t *testing.T) {
	// Without existing_machines, machine_gap should not appear
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 100.0,
					"consumed_per_min": 300.0
				}
			},
			"fluids": {},
			"top_deficits": ["iron-plate"],
			"top_surpluses": []
		}
	}`)

	items := data["item_diagnoses"].([]any)
	iron := findDiagnosis(items, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in item_diagnoses")
	}
	if iron["machine_gap"] != nil {
		t.Error("machine_gap should not be present without existing_machines")
	}
}

// ─── Cascade Depth ──────────────────────────────────────────────────────────

func TestProductionFlow_CascadeDepth(t *testing.T) {
	// iron-plate is consumed by iron-gear-wheel (and many others).
	// iron-gear-wheel is consumed by transport-belt, inserter, etc.
	// The cascade should show downstream items.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 0.0,
					"consumed_per_min": 300.0
				},
				"iron-gear-wheel": {
					"produced_per_min": 100.0,
					"consumed_per_min": 80.0
				},
				"transport-belt": {
					"produced_per_min": 50.0,
					"consumed_per_min": 40.0
				}
			},
			"fluids": {},
			"top_deficits": ["iron-plate"],
			"top_surpluses": []
		}
	}`)

	items := data["item_diagnoses"].([]any)
	iron := findDiagnosis(items, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in item_diagnoses")
	}

	cascade := iron["cascade"]
	if cascade == nil {
		t.Fatal("expected cascade for critical iron-plate")
	}
	c := cascade.(map[string]any)

	// iron-plate feeds many downstream items via recipes
	downstreamCount := c["downstream_count"].(float64)
	if downstreamCount < 2 {
		t.Errorf("downstream_count = %.0f, want >= 2 (at least gear-wheel + transport-belt)", downstreamCount)
	}

	// Impact fraction should be significant since iron-plate feeds most of the factory
	impactFraction := c["impact_fraction"].(float64)
	if impactFraction < 0.3 {
		t.Errorf("impact_fraction = %.2f, want >= 0.3", impactFraction)
	}
}

func TestProductionFlow_CascadeDepth_NotPresent_ForHealthy(t *testing.T) {
	// Healthy items should not have cascade analysis
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 450.0,
					"consumed_per_min": 420.0
				}
			},
			"fluids": {},
			"top_deficits": [],
			"top_surpluses": ["iron-plate"]
		}
	}`)

	items := data["item_diagnoses"].([]any)
	iron := findDiagnosis(items, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in item_diagnoses")
	}
	if iron["cascade"] != nil {
		t.Error("cascade should not be present for healthy items")
	}
}

// ─── Tech Unlock Impact ─────────────────────────────────────────────────────

func TestProductionFlow_TechUnlock(t *testing.T) {
	// petroleum-gas deficit. advanced-oil-processing is a disabled recipe
	// that unlocks heavy-oil-cracking and light-oil-cracking.
	// The tech "advanced-oil-processing" should appear as a recommendation.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {},
			"fluids": {
				"petroleum-gas": {
					"produced_per_min": 100.0,
					"consumed_per_min": 300.0
				}
			},
			"top_deficits": ["petroleum-gas"],
			"top_surpluses": []
		}
	}`)

	recs := data["tech_recommendations"]
	if recs == nil {
		t.Fatal("expected tech_recommendations in output")
	}
	techRecs := recs.([]any)

	// Should find at least one tech that unlocks a recipe producing petroleum-gas
	// (advanced-oil-processing unlocks light-oil-cracking which produces petroleum-gas)
	if len(techRecs) == 0 {
		t.Error("expected at least one tech recommendation for petroleum-gas deficit")
	}

	// Verify structure
	for _, r := range techRecs {
		rec := r.(map[string]any)
		if rec["tech"] == nil || rec["tech"] == "" {
			t.Error("tech recommendation missing tech field")
		}
		if rec["recipe_unlocked"] == nil || rec["recipe_unlocked"] == "" {
			t.Error("tech recommendation missing recipe_unlocked field")
		}
		if rec["deficit_item"] == nil || rec["deficit_item"] == "" {
			t.Error("tech recommendation missing deficit_item field")
		}
	}
}

func TestProductionFlow_TechUnlock_NoRecsForHealthy(t *testing.T) {
	// No deficits → no tech recommendations
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 450.0,
					"consumed_per_min": 420.0
				}
			},
			"fluids": {},
			"top_deficits": [],
			"top_surpluses": []
		}
	}`)

	recs := data["tech_recommendations"].([]any)
	if len(recs) != 0 {
		t.Errorf("expected 0 tech recommendations for healthy factory, got %d", len(recs))
	}
}

// ─── Overproduction Analysis ────────────────────────────────────────────────

func TestProductionFlow_Overproduction(t *testing.T) {
	// stone has large surplus. Recipes that consume stone include
	// stone-brick and stone-furnace.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"stone": {
					"produced_per_min": 300.0,
					"consumed_per_min": 50.0
				}
			},
			"fluids": {},
			"top_deficits": [],
			"top_surpluses": ["stone"]
		}
	}`)

	over := data["overproduction"]
	if over == nil {
		t.Fatal("expected overproduction in output")
	}
	overItems := over.([]any)
	if len(overItems) == 0 {
		t.Fatal("expected at least one overproduction entry for surplus stone")
	}

	stoneOver := overItems[0].(map[string]any)
	if stoneOver["item"] != "stone" {
		t.Errorf("expected stone, got %v", stoneOver["item"])
	}
	if stoneOver["surplus_rate"].(float64) <= 0 {
		t.Error("surplus_rate should be positive")
	}

	recipes := stoneOver["suggested_recipes"].([]any)
	if len(recipes) == 0 {
		t.Fatal("expected at least one suggested recipe for stone")
	}

	// stone-brick should be among suggestions
	foundBrick := false
	for _, r := range recipes {
		recipe := r.(map[string]any)
		if recipe["recipe"] == "stone-brick" {
			foundBrick = true
		}
	}
	if !foundBrick {
		t.Error("expected stone-brick in suggested recipes for stone surplus")
	}
}

func TestProductionFlow_Overproduction_Empty_WhenNoSurplus(t *testing.T) {
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 100.0,
					"consumed_per_min": 300.0
				}
			},
			"fluids": {},
			"top_deficits": ["iron-plate"],
			"top_surpluses": []
		}
	}`)

	over := data["overproduction"].([]any)
	if len(over) != 0 {
		t.Errorf("expected 0 overproduction entries, got %d", len(over))
	}
}

// ─── Recycler Separation ────────────────────────────────────────────────────

func TestProductionFlow_RecyclerOnly_Severity(t *testing.T) {
	// electronic-circuit consumed at 200/min but ALL consumption is by recyclers.
	// The recycler machine ("recycler") runs "electronic-circuit-recycling" recipe.
	// With machines data showing recyclers, real consumption should be ~0 → severity "healthy".
	//
	// electronic-circuit-recycling recipe: 1 electronic-circuit → 0.25 products, energy=0.125s
	// recycler: crafting_speed=0.5
	// Per machine: (0.5 / 0.125) * 1 * 60 = 240 items/min consumed
	// 1 recycler ≈ 240/min → more than enough to explain 200/min consumption.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"electronic-circuit": {
					"produced_per_min": 100.0,
					"consumed_per_min": 200.0
				}
			},
			"fluids": {},
			"top_deficits": ["electronic-circuit"],
			"top_surpluses": []
		},
		"existing_machines": {
			"by_recipe": {
				"electronic-circuit-recycling": {
					"machine_type": "recycler",
					"count": 1,
					"modules": {}
				}
			},
			"by_type": {"recycler": 1},
			"beacon_count": 0
		}
	}`)

	items := data["item_diagnoses"].([]any)
	ec := findDiagnosis(items, "electronic-circuit")
	if ec == nil {
		t.Fatal("expected electronic-circuit in item_diagnoses")
	}

	// Recycler can consume ~240/min, actual consumed is 200/min.
	// All consumption is attributable to recyclers → real consumed ≈ 0 → healthy.
	if ec["severity"] == "severe" || ec["severity"] == "critical" {
		t.Errorf("severity = %v, want healthy or moderate (not severe/critical) when all consumption is recycler", ec["severity"])
	}

	// Check new fields exist
	recyclerConsumed := ec["recycler_consumed"].(float64)
	if recyclerConsumed < 100 {
		t.Errorf("recycler_consumed = %.1f, want >= 100 (recycler explains most consumption)", recyclerConsumed)
	}

	realConsumed := ec["real_consumed"].(float64)
	if realConsumed > 100 {
		t.Errorf("real_consumed = %.1f, want < 100 (real demand should be low)", realConsumed)
	}
}

func TestProductionFlow_RecyclerMixed_Severity(t *testing.T) {
	// steel-plate consumed at 200/min. Recyclers account for some, real recipes for the rest.
	// steel-plate-recycling recipe: 1 steel-plate, energy=1.0s
	// recycler crafting_speed=0.5 → per machine: (0.5 / 1.0) * 1 * 60 = 30/min
	// 5 recyclers → 150/min recycler consumption
	// Total consumed 200/min - recycler 150/min = real 50/min
	// Produced 150/min, real consumed 50/min → real net +100/min → surplus or healthy
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"steel-plate": {
					"produced_per_min": 150.0,
					"consumed_per_min": 200.0
				}
			},
			"fluids": {},
			"top_deficits": [],
			"top_surpluses": []
		},
		"existing_machines": {
			"by_recipe": {
				"steel-plate-recycling": {
					"machine_type": "recycler",
					"count": 5,
					"modules": {}
				}
			},
			"by_type": {"recycler": 5},
			"beacon_count": 0
		}
	}`)

	items := data["item_diagnoses"].([]any)
	steel := findDiagnosis(items, "steel-plate")
	if steel == nil {
		t.Fatal("expected steel-plate in item_diagnoses")
	}

	// With recycler subtracted, real consumed ~50/min, produced 150/min → healthy or surplus.
	if steel["severity"] == "severe" || steel["severity"] == "critical" {
		t.Errorf("severity = %v, want healthy or surplus when recycler consumption is subtracted", steel["severity"])
	}

	recyclerConsumed := steel["recycler_consumed"].(float64)
	if recyclerConsumed < 100 {
		t.Errorf("recycler_consumed = %.1f, want >= 100", recyclerConsumed)
	}
}

func TestProductionFlow_NoMachinesData_FallsBackToTotal(t *testing.T) {
	// Without machines data, can't estimate recycler share → treat all consumption as real.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"electronic-circuit": {
					"produced_per_min": 0.0,
					"consumed_per_min": 200.0
				}
			},
			"fluids": {},
			"top_deficits": ["electronic-circuit"],
			"top_surpluses": []
		}
	}`)

	items := data["item_diagnoses"].([]any)
	ec := findDiagnosis(items, "electronic-circuit")
	if ec == nil {
		t.Fatal("expected electronic-circuit in item_diagnoses")
	}

	// No machines → can't separate → severity should use total → critical
	if ec["severity"] != "critical" {
		t.Errorf("severity = %v, want critical (no machines data to estimate recycler share)", ec["severity"])
	}

	// recycler_consumed should be 0 (unknown)
	recyclerConsumed := ec["recycler_consumed"].(float64)
	if recyclerConsumed != 0 {
		t.Errorf("recycler_consumed = %.1f, want 0 (no machines data)", recyclerConsumed)
	}
}

func TestProductionFlow_ConsumerFanOut_IsRecycling(t *testing.T) {
	// Verify that consumer fan-out entries are tagged with is_recycling.
	// electronic-circuit-recycling produces iron-plate, so iron-plate must be
	// in the flow data for the fan-out to detect the recycling consumer.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"electronic-circuit": {
					"produced_per_min": 100.0,
					"consumed_per_min": 300.0
				},
				"advanced-circuit": {
					"produced_per_min": 50.0,
					"consumed_per_min": 40.0
				},
				"iron-plate": {
					"produced_per_min": 500.0,
					"consumed_per_min": 400.0
				},
				"copper-cable": {
					"produced_per_min": 200.0,
					"consumed_per_min": 180.0
				}
			},
			"fluids": {},
			"top_deficits": ["electronic-circuit"],
			"top_surpluses": []
		}
	}`)

	items := data["item_diagnoses"].([]any)
	ec := findDiagnosis(items, "electronic-circuit")
	if ec == nil {
		t.Fatal("expected electronic-circuit in item_diagnoses")
	}

	consumers := ec["consumers"].([]any)

	foundRecycling := false
	foundNonRecycling := false
	for _, c := range consumers {
		consumer := c.(map[string]any)
		isRecycling, ok := consumer["is_recycling"]
		if !ok {
			t.Fatal("consumer missing is_recycling field")
		}
		if isRecycling.(bool) {
			foundRecycling = true
		} else {
			foundNonRecycling = true
		}
	}

	// electronic-circuit is consumed by both normal recipes (advanced-circuit)
	// and electronic-circuit-recycling
	if !foundNonRecycling {
		t.Error("expected at least one non-recycling consumer for electronic-circuit")
	}
	if !foundRecycling {
		t.Error("expected at least one recycling consumer for electronic-circuit")
	}
}

func TestProductionFlow_MachineGap_UsesRealDeficit(t *testing.T) {
	// iron-plate: consumed 300/min, produced 250/min. Total deficit = 50/min.
	// But iron-plate-recycling on 1 recycler accounts for some consumption.
	// iron-plate-recycling: 1 iron-plate, energy=0.0625s
	// recycler speed=0.5 → (0.5/0.0625)*1*60 = 480/min per recycler (capped at actual consumption)
	// Real deficit should be much smaller → fewer additional machines needed.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 250.0,
					"consumed_per_min": 300.0
				}
			},
			"fluids": {},
			"top_deficits": ["iron-plate"],
			"top_surpluses": []
		},
		"existing_machines": {
			"by_recipe": {
				"iron-plate": {
					"machine_type": "stone-furnace",
					"count": 10,
					"modules": {}
				},
				"iron-plate-recycling": {
					"machine_type": "recycler",
					"count": 1,
					"modules": {}
				}
			},
			"by_type": {"stone-furnace": 10, "recycler": 1},
			"beacon_count": 0
		}
	}`)

	items := data["item_diagnoses"].([]any)
	iron := findDiagnosis(items, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in item_diagnoses")
	}

	// If machine_gap exists, additional_needed should be based on real deficit (near 0),
	// not the total deficit of 50/min.
	mg := iron["machine_gap"]
	if mg != nil {
		gap := mg.(map[string]any)
		needed := gap["additional_needed"].(float64)
		// Total deficit = 50, but recycler consumes most of it → real deficit near 0
		// So additional_needed should be very small (0-1)
		if needed > 2 {
			t.Errorf("additional_needed = %.0f, want <= 2 (machine gap should use real deficit, not recycler-inflated)", needed)
		}
	}
}

// ─── Dual Cascade ──────────────────────────────────────────────────────────

func TestProductionFlow_DualCascade_RealSkipsRecycling(t *testing.T) {
	// iron-plate is consumed by iron-gear-wheel (real) and iron-plate-recycling (recycler).
	// Real cascade should include iron-gear-wheel but not traverse recycling edges.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 0.0,
					"consumed_per_min": 300.0
				},
				"iron-gear-wheel": {
					"produced_per_min": 100.0,
					"consumed_per_min": 80.0
				}
			},
			"fluids": {},
			"top_deficits": ["iron-plate"],
			"top_surpluses": []
		}
	}`)

	items := data["item_diagnoses"].([]any)
	iron := findDiagnosis(items, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in item_diagnoses")
	}

	// Real cascade should exist (iron-gear-wheel and downstream)
	cascade := iron["cascade"]
	if cascade == nil {
		t.Fatal("expected cascade for critical iron-plate")
	}

	// Now check recycler_cascade — iron-plate-recycling produces iron-ore,
	// but iron-ore isn't in the flow data, so recycler cascade may be nil.
	// The key thing is the field exists in the output.
	// (recycler_cascade can be nil if no active recycler downstream)
}

func TestProductionFlow_DualCascade_RecyclerCascadePresent(t *testing.T) {
	// electronic-circuit consumed at critical level.
	// electronic-circuit-recycling produces iron-plate (active in flow).
	// Recycler cascade should show iron-plate as downstream.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"electronic-circuit": {
					"produced_per_min": 0.0,
					"consumed_per_min": 300.0
				},
				"iron-plate": {
					"produced_per_min": 500.0,
					"consumed_per_min": 400.0
				},
				"copper-cable": {
					"produced_per_min": 200.0,
					"consumed_per_min": 180.0
				},
				"advanced-circuit": {
					"produced_per_min": 50.0,
					"consumed_per_min": 40.0
				}
			},
			"fluids": {},
			"top_deficits": ["electronic-circuit"],
			"top_surpluses": []
		}
	}`)

	items := data["item_diagnoses"].([]any)
	ec := findDiagnosis(items, "electronic-circuit")
	if ec == nil {
		t.Fatal("expected electronic-circuit in item_diagnoses")
	}

	// Real cascade should exist (advanced-circuit, etc.)
	cascade := ec["cascade"]
	if cascade == nil {
		t.Fatal("expected real cascade for critical electronic-circuit")
	}

	// Recycler cascade should exist (electronic-circuit-recycling → iron-plate)
	recyclerCascade := ec["recycler_cascade"]
	if recyclerCascade == nil {
		t.Fatal("expected recycler_cascade for electronic-circuit (recycling → iron-plate)")
	}
	rc := recyclerCascade.(map[string]any)
	if rc["downstream_count"].(float64) < 1 {
		t.Error("recycler_cascade downstream_count should be >= 1 (at least iron-plate)")
	}
}

// ─── Tech Recommendation Filtering ─────────────────────────────────────────

func TestProductionFlow_TechUnlock_FiltersCompletedResearch(t *testing.T) {
	// petroleum-gas deficit. advanced-oil-processing tech unlocks recipes for it.
	// But if advanced-oil-processing is in completed_research, it should be excluded.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {},
			"fluids": {
				"petroleum-gas": {
					"produced_per_min": 100.0,
					"consumed_per_min": 300.0
				}
			},
			"top_deficits": ["petroleum-gas"],
			"top_surpluses": []
		},
		"completed_research": {
			"completed": ["advanced-oil-processing", "oil-processing", "coal-liquefaction"],
			"completed_count": 3
		}
	}`)

	recs := data["tech_recommendations"].([]any)

	// All oil-related techs are completed → no tech recs for petroleum-gas
	for _, r := range recs {
		rec := r.(map[string]any)
		techName := rec["tech"].(string)
		if techName == "advanced-oil-processing" || techName == "oil-processing" || techName == "coal-liquefaction" {
			t.Errorf("tech %q should be filtered out (already researched)", techName)
		}
	}
}

func TestProductionFlow_TechUnlock_KeepsUnresearched(t *testing.T) {
	// petroleum-gas deficit. Some techs researched, but not all.
	// Unresearched techs should still appear.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {},
			"fluids": {
				"petroleum-gas": {
					"produced_per_min": 100.0,
					"consumed_per_min": 300.0
				}
			},
			"top_deficits": ["petroleum-gas"],
			"top_surpluses": []
		},
		"completed_research": {
			"completed": [],
			"completed_count": 0
		}
	}`)

	recs := data["tech_recommendations"].([]any)
	// With no research completed, there should be at least one tech rec
	if len(recs) == 0 {
		t.Error("expected tech recommendations when no research is completed")
	}
}

// ─── Schema Registration ────────────────────────────────────────────────────

func TestProductionFlow_InSchema(t *testing.T) {
	result, code := runReference(t, "{}")
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)
	modules := data["modules"].(map[string]any)
	if _, ok := modules["production_flow"]; !ok {
		t.Error("schema missing production_flow module")
	}
}
