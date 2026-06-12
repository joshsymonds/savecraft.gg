package main

import (
	"math"
	"strings"
	"testing"
)

func planQuery(t *testing.T, query map[string]any) map[string]any {
	t.Helper()
	res, err := productionPlanner(query)
	if err != nil {
		t.Fatalf("productionPlanner: %v", err)
	}
	return res
}

func machineEntry(t *testing.T, plan map[string]any, recipeFragment string) map[string]any {
	t.Helper()
	machines, _ := plan["machinesByRecipe"].([]map[string]any)
	e := findEntry(machines, "recipeClassName", recipeFragment)
	if e == nil {
		t.Fatalf("recipe %s not in plan: %v", recipeFragment, machines)
	}
	return e
}

func near(a, b float64) bool { return math.Abs(a-b) < 0.01 }

// num extracts a float64 field, failing the test on type mismatch.
func num(t *testing.T, m map[string]any, key string) float64 {
	t.Helper()
	f, ok := m[key].(float64)
	if !ok {
		t.Fatalf("%s = %v (%T), want float64", key, m[key], m[key])
	}
	return f
}

// Hand-verified: 10/min Iron Plate = 0.5 constructors (20/min each),
// 15/min iron ingots = 0.5 smelters (30/min each), 15/min iron ore raw.
// Power: 0.5*4MW + 0.5*4MW = 4MW.
func TestPlanIronPlate(t *testing.T) {
	plan := planQuery(t, map[string]any{"item": "Iron Plate", "rate": 10.0})

	plates := machineEntry(t, plan, "Recipe_IronPlate_C")
	if !near(num(t, plates, "machines"), 0.5) {
		t.Errorf("plate machines = %v, want 0.5", plates["machines"])
	}
	if plates["building"] != "Constructor" {
		t.Errorf("building = %v", plates["building"])
	}
	ingots := machineEntry(t, plan, "Recipe_IngotIron_C")
	if !near(num(t, ingots, "machines"), 0.5) {
		t.Errorf("ingot machines = %v, want 0.5", ingots["machines"])
	}

	raws, _ := plan["rawResources"].([]map[string]any)
	ore := findEntry(raws, "name", "Iron Ore")
	if ore == nil || !near(num(t, ore, "perMinute"), 15) {
		t.Errorf("raw ore = %v, want 15/min", raws)
	}
	if !near(num(t, plan, "totalPowerMW"), 4) {
		t.Errorf("totalPowerMW = %v, want 4", plan["totalPowerMW"])
	}
}

// Hand-verified: 5/min Reinforced Iron Plate (1 assembler at 15MW):
// 30/min plates (1.5 constructors), 60/min screws (1.5 constructors at
// 40/min), 15/min rods (1 constructor), ingots 45+15=60/min (2 smelters),
// ore 60/min. Shared ingot demand must aggregate across branches.
func TestPlanReinforcedIronPlateAggregatesSharedDemand(t *testing.T) {
	plan := planQuery(t, map[string]any{"item": "Reinforced Iron Plate", "rate": 5.0})

	ingots := machineEntry(t, plan, "Recipe_IngotIron_C")
	if !near(num(t, ingots, "machines"), 2.0) {
		t.Errorf("ingot machines = %v, want 2.0 (aggregated across plate+rod branches)", ingots["machines"])
	}
	raws, _ := plan["rawResources"].([]map[string]any)
	ore := findEntry(raws, "name", "Iron Ore")
	if ore == nil || !near(num(t, ore, "perMinute"), 60) {
		t.Errorf("ore = %v, want 60/min", raws)
	}
}

// Alternates excluded by default; allowed when use_alternates=all; and the
// explicit recipes override forces a specific recipe.
func TestPlanAlternateSelection(t *testing.T) {
	base := planQuery(t, map[string]any{"item": "Iron Plate", "rate": 10.0})
	machines, _ := base["machinesByRecipe"].([]map[string]any)
	for _, m := range machines {
		if m["alternate"] == true {
			t.Errorf("default plan used alternate %v", m["recipeClassName"])
		}
	}

	forced := planQuery(t, map[string]any{
		"item": "Iron Plate", "rate": 10.0,
		"recipes": map[string]any{"Desc_IronPlate_C": "Recipe_Alternate_CoatedIronPlate_C"},
	})
	coated := machineEntry(t, forced, "Recipe_Alternate_CoatedIronPlate_C")
	if coated == nil {
		t.Fatal("override not honored")
	}
}

// With save data injected, unlocked alternates are listed as options on
// matching nodes but the base recipe still plans by default.
func TestPlanUnlockedAlternatesListed(t *testing.T) {
	plan := planQuery(t, map[string]any{
		"item": "Iron Plate", "rate": 10.0,
		"progression": map[string]any{
			"alternateRecipes": map[string]any{
				"schematicClassNames": []any{"Schematic_Alternate_CoatedIronPlate_C"},
			},
		},
	})
	plates := machineEntry(t, plan, "Recipe_IronPlate_C")
	alts, _ := plates["unlockedAlternates"].([]string)
	found := false
	for _, a := range alts {
		if strings.Contains(a, "Coated Iron Plate") {
			found = true
		}
	}
	if !found {
		t.Errorf("unlockedAlternates = %v, want Coated Iron Plate listed", alts)
	}
}

// Existing machines from the production_summary section are credited.
func TestPlanExistingMachinesCredit(t *testing.T) {
	plan := planQuery(t, map[string]any{
		"item": "Iron Plate", "rate": 100.0,
		"production_summary": map[string]any{
			"byRecipe": []any{
				map[string]any{
					"recipeClassPath": "/Game/X/Recipe_IronPlate.Recipe_IronPlate_C",
					"machines":        float64(3),
					"totalClock":      float64(3),
				},
			},
		},
	})
	plates := machineEntry(t, plan, "Recipe_IronPlate_C")
	if plates["existingMachines"] != 3.0 {
		t.Errorf("existingMachines = %v, want 3", plates["existingMachines"])
	}
}

func TestPlanFluidChain(t *testing.T) {
	// Plastic: 30/min needs Residual... base recipe is Recipe_Plastic_C:
	// 3 m3 crude oil -> 2 plastic / 6s = 20/min plastic, 30 m3/min oil per
	// refinery. 30/min plastic = 1.5 refineries, 45 m3/min crude oil.
	plan := planQuery(t, map[string]any{"item": "Desc_Plastic_C", "rate": 30.0})
	raws, _ := plan["rawResources"].([]map[string]any)
	oil := findEntry(raws, "name", "Crude Oil")
	if oil == nil || !near(num(t, oil, "perMinute"), 45) {
		t.Errorf("crude oil = %v, want 45 m3/min", raws)
	}
	byproducts, _ := plan["byproducts"].([]map[string]any)
	if findEntry(byproducts, "name", "Heavy Oil Residue") == nil {
		t.Errorf("byproducts = %v, want Heavy Oil Residue listed", byproducts)
	}
}

// Deep endgame chain: items re-enter the worklist many times; the plan must
// complete and bottom out in raw ores.
func TestPlanDeepChain(t *testing.T) {
	plan := planQuery(t, map[string]any{"item": "Thermal Propulsion Rocket", "rate": 1.0})
	machines, _ := plan["machinesByRecipe"].([]map[string]any)
	if len(machines) < 10 {
		t.Errorf("deep chain planned only %d recipes", len(machines))
	}
	raws, _ := plan["rawResources"].([]map[string]any)
	if len(raws) < 3 {
		t.Errorf("deep chain raws = %v", raws)
	}
}

func TestPlanInvalidQueries(t *testing.T) {
	if _, err := productionPlanner(map[string]any{"rate": 10.0}); err == nil {
		t.Error("missing item should error")
	}
	if _, err := productionPlanner(map[string]any{"item": "Iron Plate"}); err == nil {
		t.Error("missing rate should error")
	}
	if _, err := productionPlanner(map[string]any{"item": "Unobtainium", "rate": 1.0}); err == nil {
		t.Error("unknown item should error")
	}
}
