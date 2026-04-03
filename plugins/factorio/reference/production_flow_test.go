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
