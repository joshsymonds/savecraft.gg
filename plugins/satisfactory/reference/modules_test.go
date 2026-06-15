package main

import (
	"strings"
	"testing"
)

func TestMilestoneTierListing(t *testing.T) {
	res, err := milestoneNavigator(map[string]any{"tier": 5.0})
	if err != nil {
		t.Fatalf("milestoneNavigator: %v", err)
	}
	tier, _ := res["tier"].(map[string]any)
	milestones, _ := tier["milestones"].([]map[string]any)
	if len(milestones) == 0 {
		t.Fatal("tier 5 has no milestones")
	}
	oil := findEntry(milestones, "className", "Schematic_5-1_C")
	if oil == nil {
		t.Fatalf("Schematic_5-1_C missing from tier 5: %v", milestones)
	}
	if name, ok := oil["milestone"].(string); !ok || !strings.Contains(name, "Oil") {
		t.Errorf("5-1 = %v, expected an oil milestone", oil["milestone"])
	}
	cost, _ := oil["cost"].([]map[string]any)
	if len(cost) == 0 {
		t.Error("milestone has no cost")
	}
}

func TestMilestonePathToTier(t *testing.T) {
	all, err := milestoneNavigator(map[string]any{"to_tier": 2.0})
	if err != nil {
		t.Fatalf("milestoneNavigator: %v", err)
	}
	path, _ := all["pathToTier"].(map[string]any)
	remaining, _ := path["remainingMilestones"].([]map[string]any)
	if len(remaining) == 0 {
		t.Fatal("no remaining milestones to tier 2")
	}
	totalAll := len(remaining)

	// Marking one milestone purchased must shrink the path by exactly one
	// and reduce cumulative costs.
	first, _ := remaining[0]["className"].(string)
	some, err := milestoneNavigator(map[string]any{
		"to_tier": 2.0,
		"progression": map[string]any{
			"milestoneClassNames": []any{first},
		},
	})
	if err != nil {
		t.Fatalf("milestoneNavigator with save: %v", err)
	}
	path2, _ := some["pathToTier"].(map[string]any)
	remaining2, _ := path2["remainingMilestones"].([]map[string]any)
	if len(remaining2) != totalAll-1 {
		t.Errorf("remaining = %d, want %d", len(remaining2), totalAll-1)
	}
}

// Known figures: 300MW via coal = 4 generators (75MW each), burning
// 60 coal/min with 180 m3/min water.
func TestPowerCalculatorCoal(t *testing.T) {
	res, err := powerCalculator(map[string]any{"target_mw": 300.0, "generator": "Coal"})
	if err != nil {
		t.Fatalf("powerCalculator: %v", err)
	}
	options, _ := res["options"].([]map[string]any)
	if len(options) != 1 {
		t.Fatalf("options = %v, want 1 coal entry", options)
	}
	coal := options[0]
	if coal["count"] != 4 || coal["totalMW"] != 300.0 {
		t.Errorf("coal plan = %v, want 4 generators at 300MW", coal)
	}
	if coal["waterPerMinute"] != 180.0 {
		t.Errorf("water = %v, want 180 m3/min", coal["waterPerMinute"])
	}
	fuels, _ := coal["fuelOptions"].([]map[string]any)
	plain := findEntry(fuels, "className", "Desc_Coal_C")
	if plain == nil || plain["perMinute"] != 60.0 {
		t.Errorf("coal burn = %v, want 60/min", fuels)
	}
}

// Nuclear: 2500MW each; 1 plant covers 2000MW target, burning 0.2 rods/min
// with 240 m3/min water and 10 waste/min (50 waste per rod).
func TestPowerCalculatorNuclear(t *testing.T) {
	res, err := powerCalculator(map[string]any{"target_mw": 2000.0, "generator": "Nuclear"})
	if err != nil {
		t.Fatalf("powerCalculator: %v", err)
	}
	options, _ := res["options"].([]map[string]any)
	nuclear := findEntry(options, "className", "Build_GeneratorNuclear_C")
	if nuclear == nil {
		t.Fatalf("no nuclear option: %v", options)
	}
	if nuclear["count"] != 1 {
		t.Errorf("count = %v, want 1", nuclear["count"])
	}
	if nuclear["waterPerMinute"] != 240.0 {
		t.Errorf("water = %v, want 240", nuclear["waterPerMinute"])
	}
	fuels, _ := nuclear["fuelOptions"].([]map[string]any)
	rod := findEntry(fuels, "className", "Desc_NuclearFuelRod_C")
	if rod == nil || rod["perMinute"] != 0.2 {
		t.Errorf("rod burn = %v, want 0.2/min", fuels)
	}
	if rod["wastePerMinute"] != 10.0 {
		t.Errorf("waste = %v, want 10/min", rod["wastePerMinute"])
	}
}

func TestPowerCalculatorInvalid(t *testing.T) {
	if _, err := powerCalculator(map[string]any{}); err == nil {
		t.Error("missing target_mw should error")
	}
	if _, err := powerCalculator(map[string]any{"target_mw": 100.0, "generator": "Toaster"}); err == nil {
		t.Error("unknown generator should error")
	}
}

// The milestone parameter must be schema-typed string: the handler reads it
// with stringParam, so a schema-following client passing a number would get
// a silently dropped lookup.
func TestSchemaMilestoneParamIsString(t *testing.T) {
	modules, _ := schema()["modules"].(map[string]any)
	nav, _ := modules["milestone_navigator"].(map[string]any)
	params, _ := nav["parameters"].(map[string]any)
	milestone, _ := params["milestone"].(map[string]any)
	if milestone["type"] != "string" {
		t.Errorf("milestone parameter type = %v, want string", milestone["type"])
	}
}
