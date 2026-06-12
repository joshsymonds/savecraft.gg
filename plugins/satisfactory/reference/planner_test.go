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

// The 1.2 "Recipe Parts Cost Multiplier" scales ingredient amounts only,
// rounded half-up per ingredient (in-game observed: 1.5x Iron Plate needs
// 5 ingots for 4.5; 1.5x Iron Ingot needs 2 ore for 1.5). Products and
// durations are untouched. For 20 plates/min at 1.5x:
//
//	1 plate constructor consumes 5*60/6 = 50 ingots/min (vanilla 30)
//	ingot smelters consume 2*60/2 = 60 ore/min each (vanilla 30)
//	-> ore = 50/30 machines * 60 = 100/min (vanilla 30)
func TestPlanPartsCostMultiplier(t *testing.T) {
	plan := planQuery(t, map[string]any{
		"item": "Desc_IronPlate_C", "rate": 20.0,
		"game_overview": map[string]any{
			"gameMode": map[string]any{"partsCostMultiplier": 1.5},
		},
	})
	raws, _ := plan["rawResources"].([]map[string]any)
	ore := findEntry(raws, "className", "Desc_OreIron_C")
	if ore == nil || !near(num(t, ore, "perMinute"), 100) {
		t.Errorf("iron ore = %v, want 100/min", raws)
	}
	// Products are not scaled: 20 plates/min is still exactly one machine.
	plates := machineEntry(t, plan, "Recipe_IronPlate_C")
	if !near(num(t, plates, "machines"), 1) {
		t.Errorf("plate machines = %v, want 1", plates["machines"])
	}
	gm, _ := plan["gameMode"].(map[string]any)
	if gm == nil || gm["partsCostMultiplier"] != 1.5 {
		t.Errorf("plan should echo applied multipliers, got %v", plan["gameMode"])
	}
}

// Fluid ingredients scale too (1.2.3.0 patch note); amounts are liters so
// integer rounding is a no-op. Plastic at 1.5x: 4500 L oil per cycle ->
// 45 m3/min per refinery, 30 plastic/min = 1.5 refineries = 67.5 m3/min.
func TestPlanPartsCostMultiplierFluids(t *testing.T) {
	plan := planQuery(t, map[string]any{
		"item": "Desc_Plastic_C", "rate": 30.0,
		"game_overview": map[string]any{
			"gameMode": map[string]any{"partsCostMultiplier": 1.5},
		},
	})
	raws, _ := plan["rawResources"].([]map[string]any)
	oil := findEntry(raws, "name", "Crude Oil")
	if oil == nil || !near(num(t, oil, "perMinute"), 67.5) {
		t.Errorf("crude oil = %v, want 67.5 m3/min", raws)
	}
}

// The "Power Consumption Multiplier" scales building draw only. Iron Plate
// 20/min vanilla: 1 constructor (4MW) + 1 smelter (4MW) = 8MW; at 0.5x -> 4.
func TestPlanEnergyCostMultiplier(t *testing.T) {
	plan := planQuery(t, map[string]any{
		"item": "Desc_IronPlate_C", "rate": 20.0,
		"game_overview": map[string]any{
			"gameMode": map[string]any{"energyCostMultiplier": 0.5},
		},
	})
	if !near(num(t, plan, "totalPowerMW"), 4) {
		t.Errorf("totalPowerMW = %v, want 4", plan["totalPowerMW"])
	}
	plates := machineEntry(t, plan, "Recipe_IronPlate_C")
	if !near(num(t, plates, "powerMW"), 2) {
		t.Errorf("plate powerMW = %v, want 2", plates["powerMW"])
	}
}

// Without an injected save the plan assumes vanilla and echoes nothing.
func TestPlanNoGameModeEcho(t *testing.T) {
	plan := planQuery(t, map[string]any{"item": "Desc_IronPlate_C", "rate": 20.0})
	if _, ok := plan["gameMode"]; ok {
		t.Errorf("vanilla plan should not echo gameMode: %v", plan["gameMode"])
	}
	raws, _ := plan["rawResources"].([]map[string]any)
	ore := findEntry(raws, "className", "Desc_OreIron_C")
	if ore == nil || !near(num(t, ore, "perMinute"), 30) {
		t.Errorf("vanilla iron ore = %v, want 30/min", raws)
	}
}

// Existing capacity from the production_summary section is credited in
// 100%-clock machine equivalents (clock × somersloop boost), not raw
// machine count: 3 machines at 150% clock = 4.5.
func TestPlanExistingCapacityCredit(t *testing.T) {
	plan := planQuery(t, map[string]any{
		"item": "Iron Plate", "rate": 100.0,
		"production_summary": map[string]any{
			"byRecipe": []any{
				map[string]any{
					"recipeClassPath":   "/Game/X/Recipe_IronPlate.Recipe_IronPlate_C",
					"machines":          float64(3),
					"effectiveCapacity": float64(4.5),
				},
			},
		},
	})
	plates := machineEntry(t, plan, "Recipe_IronPlate_C")
	if plates["existingCapacity"] != 4.5 {
		t.Errorf("existingCapacity = %v, want 4.5", plates["existingCapacity"])
	}
	if _, ok := plates["existingMachines"]; ok {
		t.Errorf("existingMachines should be replaced by existingCapacity: %v", plates)
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
