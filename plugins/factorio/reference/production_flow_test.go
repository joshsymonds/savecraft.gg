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

// findBottleneck finds a bottleneck tree by root_item name.
func findBottleneck(data map[string]any, rootItem string) map[string]any {
	bns, ok := data["bottlenecks"].([]any)
	if !ok {
		return nil
	}
	for _, b := range bns {
		bn := b.(map[string]any)
		if bn["root_item"] == rootItem {
			return bn
		}
	}
	return nil
}

// findIndependent finds an independent problem by item name.
func findIndependent(data map[string]any, item string) map[string]any {
	indeps, ok := data["independent"].([]any)
	if !ok {
		return nil
	}
	for _, i := range indeps {
		ind := i.(map[string]any)
		if ind["item"] == item {
			return ind
		}
	}
	return nil
}

// findAnyDiagnosis searches both bottlenecks (by root_item) and independent (by item).
func findAnyDiagnosis(data map[string]any, item string) map[string]any {
	if bn := findBottleneck(data, item); bn != nil {
		return bn
	}
	if ind := findIndependent(data, item); ind != nil {
		return ind
	}
	// Also check if the item appears in any bottleneck's affected list
	bns, ok := data["bottlenecks"].([]any)
	if ok {
		for _, b := range bns {
			bn := b.(map[string]any)
			affected, ok := bn["affected"].([]any)
			if !ok {
				continue
			}
			for _, a := range affected {
				af := a.(map[string]any)
				if af["item"] == item {
					return af
				}
			}
		}
	}
	return nil
}

// ─── Output Shape ──────────────────────────────────────────────────────────

func TestProductionFlow_NoHealthScore(t *testing.T) {
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {"produced_per_min": 450.0, "consumed_per_min": 420.0}
			},
			"fluids": {},
			"top_deficits": [],
			"top_surpluses": []
		}
	}`)

	if _, ok := data["health_score"]; ok {
		t.Error("health_score should not be in output")
	}
	if _, ok := data["summary"]; !ok {
		t.Error("summary should be in output")
	}
}

func TestProductionFlow_NoOverproduction(t *testing.T) {
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"stone": {"produced_per_min": 300.0, "consumed_per_min": 50.0}
			},
			"fluids": {},
			"top_deficits": [],
			"top_surpluses": ["stone"]
		}
	}`)

	if _, ok := data["overproduction"]; ok {
		t.Error("overproduction should not be in output")
	}
	if _, ok := data["bottlenecks"]; !ok {
		t.Error("bottlenecks should be in output")
	}
}

func TestProductionFlow_NoCascade(t *testing.T) {
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {"produced_per_min": 0.0, "consumed_per_min": 300.0}
			},
			"fluids": {},
			"top_deficits": ["iron-plate"],
			"top_surpluses": []
		}
	}`)

	// iron-plate with 0 produced, 300 consumed should appear in bottlenecks or independent
	iron := findAnyDiagnosis(data, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in bottlenecks or independent")
	}
	if iron["cascade"] != nil {
		t.Error("cascade should not be in output")
	}
	if iron["recycler_cascade"] != nil {
		t.Error("recycler_cascade should not be in output")
	}
}

func TestProductionFlow_FiltersZeroActivity(t *testing.T) {
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {"produced_per_min": 450.0, "consumed_per_min": 420.0},
				"nuclear-reactor": {"produced_per_min": 0.0, "consumed_per_min": 0.0},
				"beacon": {"produced_per_min": 0.0, "consumed_per_min": 0.0}
			},
			"fluids": {},
			"top_deficits": [],
			"top_surpluses": []
		}
	}`)

	summary := data["summary"].(map[string]any)
	activeCount := int(summary["active_count"].(float64))
	if activeCount != 1 {
		t.Errorf("expected active_count=1, got %d", activeCount)
	}
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

	// iron-plate: +30/min surplus → should NOT appear in bottlenecks or independent
	if iron := findAnyDiagnosis(data, "iron-plate"); iron != nil {
		// It's OK if it shows up as an affected item, but not as a bottleneck root or independent
		if findBottleneck(data, "iron-plate") != nil || findIndependent(data, "iron-plate") != nil {
			t.Error("iron-plate (surplus) should not be a bottleneck root or independent problem")
		}
	}

	// copper-plate: -180/min deficit → should appear somewhere
	copper := findAnyDiagnosis(data, "copper-plate")
	if copper == nil {
		t.Fatal("expected copper-plate in bottlenecks or independent")
	}
	approx(t, "copper net_rate", copper["net_rate"].(float64), -180.0, 0.1)
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

	// copper-plate: consumed but 0 produced → critical
	copper := findAnyDiagnosis(data, "copper-plate")
	if copper == nil {
		t.Fatal("expected copper-plate")
	}
	if copper["severity"] != "critical" {
		t.Errorf("copper severity = %v, want critical", copper["severity"])
	}

	// steel-plate: deficit > 50% of consumed → severe
	steel := findAnyDiagnosis(data, "steel-plate")
	if steel == nil {
		t.Fatal("expected steel-plate")
	}
	if steel["severity"] != "severe" {
		t.Errorf("steel severity = %v, want severe (deficit 70/120 = 58%%)", steel["severity"])
	}

	// iron-plate: small surplus → healthy (should not appear in bottlenecks/independent)
	if findBottleneck(data, "iron-plate") != nil || findIndependent(data, "iron-plate") != nil {
		t.Error("iron-plate (healthy) should not be in bottlenecks or independent")
	}

	// stone: large surplus → surplus (should not appear in bottlenecks/independent)
	if findBottleneck(data, "stone") != nil || findIndependent(data, "stone") != nil {
		t.Error("stone (surplus) should not be in bottlenecks or independent")
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

	ec := findAnyDiagnosis(data, "electronic-circuit")
	if ec == nil {
		t.Fatal("expected electronic-circuit in output")
	}

	// Without top_deficits boost, 60/200 = 30% deficit → moderate
	// With boost, should be severe
	if ec["severity"] != "severe" {
		t.Errorf("severity = %v, want severe (boosted from moderate by top_deficits)", ec["severity"])
	}
}

// ─── Recipe Fan-Out ─────────────────────────────────────────────────────────

func TestProductionFlow_RecipeFanOut(t *testing.T) {
	// copper-plate is consumed by copper-cable. The fan-out should identify
	// which recipes consume it based on machines actually running.
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
		},
		"existing_machines": {
			"by_recipe": {
				"copper-cable": {
					"machine_type": "assembling-machine-3",
					"count": 10,
					"modules": {}
				}
			},
			"by_type": {"assembling-machine-3": 10},
			"beacon_count": 0
		}
	}`)

	// copper-plate should be a bottleneck root or independent — find it and check consumers
	copper := findBottleneck(data, "copper-plate")
	if copper == nil {
		copper = findIndependent(data, "copper-plate")
	}
	if copper == nil {
		t.Fatal("expected copper-plate in bottlenecks or independent")
	}

	// Consumers only appear on bottleneck roots, not independent problems
	if bn := findBottleneck(data, "copper-plate"); bn != nil {
		consumers := bn["consumers"].([]any)
		if len(consumers) == 0 {
			t.Fatal("expected at least one consumer for copper-plate")
		}

		foundCable := false
		for _, c := range consumers {
			consumer := c.(map[string]any)
			if consumer["recipe"] == "copper-cable" {
				foundCable = true
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
}

func TestProductionFlow_RecipeFanOut_ZeroProductionFallback(t *testing.T) {
	// stone is consumed by stone-brick (product has production) and concrete
	// (product has 0 produced_per_min — placed as terrain). The fan-out should
	// still account for concrete via machine-throughput fallback.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"stone": {
					"produced_per_min": 200.0,
					"consumed_per_min": 900.0
				},
				"stone-brick": {
					"produced_per_min": 60.0,
					"consumed_per_min": 50.0
				},
				"concrete": {
					"produced_per_min": 0.0,
					"consumed_per_min": 30.0
				}
			},
			"fluids": {},
			"top_deficits": ["stone"],
			"top_surpluses": []
		},
		"existing_machines": {
			"by_recipe": {
				"stone-brick": {
					"machine_type": "steel-furnace",
					"count": 14,
					"modules": {}
				},
				"concrete": {
					"machine_type": "assembling-machine-3",
					"count": 3,
					"modules": {}
				}
			},
			"by_type": {"steel-furnace": 14, "assembling-machine-3": 3},
			"beacon_count": 0
		}
	}`)

	// Stone should appear as a bottleneck or independent
	bn := findBottleneck(data, "stone")
	if bn == nil {
		bn = findIndependent(data, "stone")
	}
	if bn == nil {
		t.Fatal("expected stone in bottlenecks or independent")
	}

	// If it's a bottleneck root, check consumers include both stone-brick AND concrete
	if bnRoot := findBottleneck(data, "stone"); bnRoot != nil {
		consumers, ok := bnRoot["consumers"].([]any)
		if !ok || len(consumers) == 0 {
			t.Fatal("expected consumers for stone")
		}

		foundBrick := false
		foundConcrete := false
		for _, c := range consumers {
			consumer := c.(map[string]any)
			if consumer["recipe"] == "stone-brick" {
				foundBrick = true
			}
			if consumer["recipe"] == "concrete" {
				foundConcrete = true
				// Concrete has 0 production rate — rate must come from machine fallback
				if consumer["rate"].(float64) <= 0 {
					t.Error("concrete consumer rate should be positive (machine fallback)")
				}
			}
		}
		if !foundBrick {
			t.Error("expected stone-brick in consumers of stone")
		}
		if !foundConcrete {
			t.Error("expected concrete in consumers of stone (zero-production fallback)")
		}
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

	iron := findAnyDiagnosis(data, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in output")
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

	iron := findAnyDiagnosis(data, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in output")
	}
	if iron["machine_gap"] != nil {
		t.Error("machine_gap should not be present without existing_machines")
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

	// Tech may be folded into the bottleneck tree or remain top-level
	recs := data["tech_recommendations"]
	if recs == nil {
		t.Fatal("expected tech_recommendations in output")
	}
	techRecs := recs.([]any)

	// Also check if techs are inlined on the bottleneck
	bn := findBottleneck(data, "petroleum-gas")
	ind := findIndependent(data, "petroleum-gas")
	inlinedTechCount := 0
	if bn != nil {
		if techs, ok := bn["tech"].([]any); ok {
			inlinedTechCount = len(techs)
		}
	}

	totalTechs := len(techRecs) + inlinedTechCount
	if totalTechs == 0 {
		t.Error("expected at least one tech recommendation for petroleum-gas deficit")
	}

	// Verify structure of top-level tech recs
	for _, r := range techRecs {
		rec := r.(map[string]any)
		if rec["tech"] == nil || rec["tech"] == "" {
			t.Error("tech recommendation missing tech field")
		}
		if rec["recipes_unlocked"] == nil {
			t.Error("tech recommendation missing recipes_unlocked field")
		}
		if rec["deficit_items"] == nil {
			t.Error("tech recommendation missing deficit_items field")
		}
		if _, ok := rec["inputs_available"]; !ok {
			t.Error("tech recommendation missing inputs_available field")
		}
	}

	// Verify inlined tech structure if on bottleneck
	if bn != nil {
		if techs, ok := bn["tech"].([]any); ok {
			for _, t2 := range techs {
				tech := t2.(map[string]any)
				if tech["tech"] == nil || tech["tech"] == "" {
					t.Error("inlined tech missing tech field")
				}
				if tech["recipes_unlocked"] == nil {
					t.Error("inlined tech missing recipes_unlocked field")
				}
			}
		}
	}

	_ = ind // independent may also have the item
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

	// With recycler subtracted, real consumed ~0, produced 100 → healthy/surplus.
	// Healthy items don't appear in bottlenecks/independent at all.
	// If it does appear, verify severity isn't severe/critical.
	ec := findAnyDiagnosis(data, "electronic-circuit")
	if ec != nil {
		sev := ec["severity"].(string)
		if sev == "severe" || sev == "critical" {
			t.Errorf("severity = %v, want healthy or moderate (not severe/critical) when all consumption is recycler", sev)
		}
	}
	// If not found, it's healthy and correctly excluded — that's fine.
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

	// With recycler subtracted, real consumed ~50/min, produced 150/min → healthy or surplus.
	// Healthy/surplus items don't appear in bottlenecks/independent.
	steel := findAnyDiagnosis(data, "steel-plate")
	if steel != nil {
		sev := steel["severity"].(string)
		if sev == "severe" || sev == "critical" {
			t.Errorf("severity = %v, want healthy or surplus when recycler consumption is subtracted", sev)
		}
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

	ec := findAnyDiagnosis(data, "electronic-circuit")
	if ec == nil {
		t.Fatal("expected electronic-circuit in output")
	}

	// No machines → can't separate → severity should use total → critical
	if ec["severity"] != "critical" {
		t.Errorf("severity = %v, want critical (no machines data to estimate recycler share)", ec["severity"])
	}
}

func TestProductionFlow_ConsumerFanOut_IsRecycling(t *testing.T) {
	// Verify that consumer fan-out entries are tagged with is_recycling.
	// electronic-circuit-recycling produces iron-plate and is running on a recycler.
	// advanced-circuit recipe also consumes electronic-circuit and is running.
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
		},
		"existing_machines": {
			"by_recipe": {
				"electronic-circuit-recycling": {
					"machine_type": "recycler",
					"count": 1,
					"modules": {}
				},
				"advanced-circuit": {
					"machine_type": "assembling-machine-3",
					"count": 5,
					"modules": {}
				}
			},
			"by_type": {"recycler": 1, "assembling-machine-3": 5},
			"beacon_count": 0
		}
	}`)

	// electronic-circuit is a deficit item — find it as bottleneck root or independent
	bn := findBottleneck(data, "electronic-circuit")
	if bn == nil {
		// It might be independent — consumers only appear on bottleneck roots
		t.Skip("electronic-circuit is independent, consumers only on bottleneck roots")
	}

	consumers := bn["consumers"].([]any)

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

	iron := findAnyDiagnosis(data, "iron-plate")
	if iron == nil {
		// If iron-plate became healthy after recycler subtraction, that's fine
		return
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
			"completed": ["advanced-oil-processing", "oil-processing", "coal-liquefaction"]
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

	// Also check inlined techs on the bottleneck
	bn := findBottleneck(data, "petroleum-gas")
	if bn != nil {
		if techs, ok := bn["tech"].([]any); ok {
			for _, t2 := range techs {
				tech := t2.(map[string]any)
				techName := tech["tech"].(string)
				if techName == "advanced-oil-processing" || techName == "oil-processing" || techName == "coal-liquefaction" {
					t.Errorf("inlined tech %q should be filtered out (already researched)", techName)
				}
			}
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
			"completed": []
		}
	}`)

	recs := data["tech_recommendations"].([]any)
	// Also count inlined techs
	totalTechs := len(recs)
	bn := findBottleneck(data, "petroleum-gas")
	if bn != nil {
		if techs, ok := bn["tech"].([]any); ok {
			totalTechs += len(techs)
		}
	}
	if totalTechs == 0 {
		t.Error("expected tech recommendations when no research is completed")
	}
}

// ─── Root Cause Chains ─────────────────────────────────────────────────────

func TestProductionFlow_RootCause_NotBuilt(t *testing.T) {
	// steel-plate in deficit, no machines for steel-plate recipe → not_built
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"steel-plate": {
					"produced_per_min": 0.0,
					"consumed_per_min": 100.0
				},
				"iron-plate": {
					"produced_per_min": 500.0,
					"consumed_per_min": 200.0
				}
			},
			"fluids": {},
			"top_deficits": ["steel-plate"],
			"top_surpluses": []
		},
		"existing_machines": {
			"by_recipe": {},
			"by_type": {},
			"beacon_count": 0
		}
	}`)

	// steel-plate should be a bottleneck or independent with bottleneck_type = not_built
	steel := findAnyDiagnosis(data, "steel-plate")
	if steel == nil {
		t.Fatal("expected steel-plate in output")
	}

	// Check bottleneck_type — on bottleneck trees it's a direct field,
	// on independent problems it's also a direct field
	if bnType, ok := steel["bottleneck_type"]; ok {
		if bnType != "not_built" {
			t.Errorf("bottleneck_type = %v, want not_built", bnType)
		}
	} else {
		t.Error("expected bottleneck_type on steel-plate diagnosis")
	}
}

func TestProductionFlow_RootCause_InputStarvation(t *testing.T) {
	// engine-unit in deficit, machines exist, but steel-plate (ingredient) is also in deficit
	// → engine-unit's root cause traces to steel-plate
	// → steel-plate should be a bottleneck root with engine-unit in its affected list
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"engine-unit": {
					"produced_per_min": 5.0,
					"consumed_per_min": 30.0
				},
				"steel-plate": {
					"produced_per_min": 10.0,
					"consumed_per_min": 50.0
				},
				"iron-gear-wheel": {
					"produced_per_min": 100.0,
					"consumed_per_min": 80.0
				},
				"pipe": {
					"produced_per_min": 60.0,
					"consumed_per_min": 40.0
				},
				"iron-plate": {
					"produced_per_min": 500.0,
					"consumed_per_min": 400.0
				}
			},
			"fluids": {},
			"top_deficits": ["engine-unit", "steel-plate"],
			"top_surpluses": []
		},
		"existing_machines": {
			"by_recipe": {
				"engine-unit": {
					"machine_type": "assembling-machine-2",
					"count": 10,
					"modules": {}
				},
				"steel-plate": {
					"machine_type": "electric-furnace",
					"count": 5,
					"modules": {}
				}
			},
			"by_type": {"assembling-machine-2": 10, "electric-furnace": 5},
			"beacon_count": 0
		}
	}`)

	// steel-plate should be a bottleneck root (engine-unit traces to it)
	steel := findBottleneck(data, "steel-plate")
	if steel == nil {
		// steel-plate might be independent if engine-unit traces to something else
		// In that case, just verify engine-unit exists somewhere
		engine := findAnyDiagnosis(data, "engine-unit")
		if engine == nil {
			t.Fatal("expected engine-unit in output")
		}
		return
	}

	// engine-unit should be in steel-plate's affected list
	affected := steel["affected"].([]any)
	foundEngine := false
	for _, a := range affected {
		af := a.(map[string]any)
		if af["item"] == "engine-unit" {
			foundEngine = true
		}
	}
	if !foundEngine {
		t.Error("expected engine-unit in steel-plate's affected list (input starvation)")
	}
}

func TestProductionFlow_RootCause_Throughput(t *testing.T) {
	// iron-plate in deficit, machines exist, all inputs (iron-ore) healthy → throughput
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 200.0,
					"consumed_per_min": 400.0
				},
				"iron-ore": {
					"produced_per_min": 500.0,
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
					"machine_type": "electric-furnace",
					"count": 10,
					"modules": {}
				}
			},
			"by_type": {"electric-furnace": 10},
			"beacon_count": 0
		}
	}`)

	iron := findAnyDiagnosis(data, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in output")
	}

	if bnType, ok := iron["bottleneck_type"]; ok {
		if bnType != "throughput" {
			t.Errorf("bottleneck_type = %v, want throughput", bnType)
		}
	} else {
		t.Error("expected bottleneck_type on iron-plate")
	}
}

func TestProductionFlow_RootCause_NoMachinesData(t *testing.T) {
	// Without machines data, can still detect not_built (no recipe) vs unknown
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 100.0,
					"consumed_per_min": 400.0
				}
			},
			"fluids": {},
			"top_deficits": ["iron-plate"],
			"top_surpluses": []
		}
	}`)

	iron := findAnyDiagnosis(data, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in output")
	}

	// Should have a bottleneck_type (can reason about recipes without machines)
	if _, ok := iron["bottleneck_type"]; !ok {
		t.Error("expected bottleneck_type even without machines data")
	}
}

// ─── Surplus Connections (now fixable_from on bottleneck trees) ─────────────

func TestProductionFlow_SurplusConnections(t *testing.T) {
	// iron-plate is surplus. iron-gear-wheel recipe consumes iron-plate and is running.
	// iron-gear-wheel is in deficit. Should show fixable_from on iron-gear-wheel's tree.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 500.0,
					"consumed_per_min": 200.0
				},
				"iron-gear-wheel": {
					"produced_per_min": 50.0,
					"consumed_per_min": 100.0
				}
			},
			"fluids": {},
			"top_deficits": ["iron-gear-wheel"],
			"top_surpluses": ["iron-plate"]
		},
		"existing_machines": {
			"by_recipe": {
				"iron-gear-wheel": {
					"machine_type": "assembling-machine-2",
					"count": 5,
					"modules": {}
				}
			},
			"by_type": {"assembling-machine-2": 5},
			"beacon_count": 0
		}
	}`)

	// iron-gear-wheel should be in bottlenecks or independent
	gearBn := findBottleneck(data, "iron-gear-wheel")
	if gearBn != nil {
		fixable := gearBn["fixable_from"].([]any)
		found := false
		for _, f := range fixable {
			ff := f.(map[string]any)
			if ff["item"] == "iron-plate" {
				found = true
			}
		}
		if !found {
			t.Error("expected fixable_from entry for iron-plate on iron-gear-wheel bottleneck")
		}
		return
	}

	// If iron-gear-wheel is independent, fixable_from isn't available (only on bottleneck trees)
	ind := findIndependent(data, "iron-gear-wheel")
	if ind == nil {
		t.Fatal("expected iron-gear-wheel in bottlenecks or independent")
	}
}

func TestProductionFlow_SurplusConnections_NoRunningRecipe(t *testing.T) {
	// iron-plate surplus but no running recipes consume it → no fixable_from connections
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 500.0,
					"consumed_per_min": 200.0
				}
			},
			"fluids": {},
			"top_deficits": [],
			"top_surpluses": ["iron-plate"]
		},
		"existing_machines": {
			"by_recipe": {},
			"by_type": {},
			"beacon_count": 0
		}
	}`)

	// No deficit items → no bottlenecks or independent at all
	bns := data["bottlenecks"].([]any)
	for _, b := range bns {
		bn := b.(map[string]any)
		fixable := bn["fixable_from"].([]any)
		if len(fixable) != 0 {
			t.Errorf("expected 0 fixable_from with no running recipes, got %d", len(fixable))
		}
	}
}

// ─── Edge Cases ────────────────────────────────────────────────────────────

func TestProductionFlow_RootCause_CycleDetection(t *testing.T) {
	// Two items mutually in deficit that consume each other's products.
	// kovarex-enrichment-process: u-235 + u-238 → more u-235 + u-238
	// Both in deficit → cycle. visited set should prevent infinite loop.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"uranium-235": {
					"produced_per_min": 1.0,
					"consumed_per_min": 5.0
				},
				"uranium-238": {
					"produced_per_min": 10.0,
					"consumed_per_min": 50.0
				}
			},
			"fluids": {},
			"top_deficits": ["uranium-235", "uranium-238"],
			"top_surpluses": []
		},
		"existing_machines": {
			"by_recipe": {
				"kovarex-enrichment-process": {
					"machine_type": "centrifuge",
					"count": 5,
					"modules": {}
				}
			},
			"by_type": {"centrifuge": 5},
			"beacon_count": 0
		}
	}`)

	u235 := findAnyDiagnosis(data, "uranium-235")
	if u235 == nil {
		t.Fatal("expected uranium-235 in output (cycle should terminate)")
	}
}

func TestProductionFlow_SurplusConnections_CrossType(t *testing.T) {
	// sulfuric-acid (fluid) is surplus. processing-unit recipe consumes it and is running.
	// processing-unit (item) is in deficit. Should show fixable_from on processing-unit's tree.
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"processing-unit": {
					"produced_per_min": 2.0,
					"consumed_per_min": 10.0
				},
				"electronic-circuit": {
					"produced_per_min": 100.0,
					"consumed_per_min": 80.0
				},
				"advanced-circuit": {
					"produced_per_min": 50.0,
					"consumed_per_min": 40.0
				}
			},
			"fluids": {
				"sulfuric-acid": {
					"produced_per_min": 500.0,
					"consumed_per_min": 50.0
				}
			},
			"top_deficits": ["processing-unit"],
			"top_surpluses": ["sulfuric-acid"]
		},
		"existing_machines": {
			"by_recipe": {
				"processing-unit": {
					"machine_type": "assembling-machine-3",
					"count": 5,
					"modules": {}
				}
			},
			"by_type": {"assembling-machine-3": 5},
			"beacon_count": 0
		}
	}`)

	// processing-unit should be in bottlenecks or independent
	bn := findBottleneck(data, "processing-unit")
	if bn != nil {
		fixable := bn["fixable_from"].([]any)
		found := false
		for _, f := range fixable {
			ff := f.(map[string]any)
			if ff["item"] == "sulfuric-acid" {
				found = true
			}
		}
		if !found {
			t.Error("expected cross-type fixable_from: sulfuric-acid (fluid) on processing-unit bottleneck")
		}
		return
	}

	ind := findIndependent(data, "processing-unit")
	if ind == nil {
		t.Fatal("expected processing-unit in bottlenecks or independent")
	}
	// If independent, fixable_from isn't available — the connection still exists internally
}

func TestProductionFlow_Severity_Moderate(t *testing.T) {
	// Item with small deficit (< 50% of consumed) → moderate severity
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 350.0,
					"consumed_per_min": 420.0
				}
			},
			"fluids": {},
			"top_deficits": [],
			"top_surpluses": []
		}
	}`)

	iron := findAnyDiagnosis(data, "iron-plate")
	if iron == nil {
		t.Fatal("expected iron-plate in output")
	}
	// deficit 70/420 = 16.7% < 50% → moderate
	if iron["severity"] != "moderate" {
		t.Errorf("severity = %v, want moderate (deficit 16.7%% of consumed)", iron["severity"])
	}
}

// ─── Summary ───────────────────────────────────────────────────────────────

func TestProductionFlow_Summary(t *testing.T) {
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {
				"iron-plate": {
					"produced_per_min": 200.0,
					"consumed_per_min": 400.0
				},
				"copper-plate": {
					"produced_per_min": 0.0,
					"consumed_per_min": 300.0
				},
				"stone": {
					"produced_per_min": 100.0,
					"consumed_per_min": 50.0
				}
			},
			"fluids": {},
			"top_deficits": ["iron-plate", "copper-plate"],
			"top_surpluses": []
		},
		"existing_machines": {
			"by_recipe": {
				"iron-plate": {
					"machine_type": "electric-furnace",
					"count": 10,
					"modules": {}
				}
			},
			"by_type": {"electric-furnace": 10},
			"beacon_count": 0
		}
	}`)

	summary := data["summary"].(map[string]any)

	// 3 active items
	activeCount := int(summary["active_count"].(float64))
	if activeCount != 3 {
		t.Errorf("active_count = %d, want 3", activeCount)
	}

	// copper-plate is critical (0 produced, 300 consumed)
	criticalCount := int(summary["critical_count"].(float64))
	if criticalCount < 1 {
		t.Errorf("critical_count = %d, want >= 1", criticalCount)
	}

	// Verify bottleneck_count + independent_count covers all deficit items
	bnCount := int(summary["bottleneck_count"].(float64))
	indCount := int(summary["independent_count"].(float64))
	if bnCount+indCount < 1 {
		t.Errorf("bottleneck_count(%d) + independent_count(%d) should be >= 1", bnCount, indCount)
	}
}

func TestProductionFlow_EmptyFlowData(t *testing.T) {
	data := runProductionFlow(t, `{
		"module": "production_flow",
		"flow_data": {
			"items": {},
			"fluids": {},
			"top_deficits": [],
			"top_surpluses": []
		}
	}`)

	summary := data["summary"].(map[string]any)
	if int(summary["active_count"].(float64)) != 0 {
		t.Errorf("active_count = %v, want 0", summary["active_count"])
	}
	if int(summary["bottleneck_count"].(float64)) != 0 {
		t.Errorf("bottleneck_count = %v, want 0", summary["bottleneck_count"])
	}
	if int(summary["independent_count"].(float64)) != 0 {
		t.Errorf("independent_count = %v, want 0", summary["independent_count"])
	}
	if int(summary["critical_count"].(float64)) != 0 {
		t.Errorf("critical_count = %v, want 0", summary["critical_count"])
	}

	bottlenecks := data["bottlenecks"].([]any)
	if len(bottlenecks) != 0 {
		t.Errorf("expected empty bottlenecks, got %d", len(bottlenecks))
	}
	independent := data["independent"].([]any)
	if len(independent) != 0 {
		t.Errorf("expected empty independent, got %d", len(independent))
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
