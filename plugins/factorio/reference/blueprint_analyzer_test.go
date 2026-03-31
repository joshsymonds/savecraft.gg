package main

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"encoding/json"
	"testing"
)

// --- Test helper: encode known data into a valid blueprint string ---

func encodeBlueprintString(t *testing.T, wrapper any) string {
	t.Helper()
	jsonBytes, err := json.Marshal(wrapper)
	if err != nil {
		t.Fatalf("marshal blueprint: %v", err)
	}
	var buf bytes.Buffer
	w, err := zlib.NewWriterLevel(&buf, 9)
	if err != nil {
		t.Fatalf("zlib writer: %v", err)
	}
	if _, err := w.Write(jsonBytes); err != nil {
		t.Fatalf("zlib write: %v", err)
	}
	w.Close()
	return "0" + base64.StdEncoding.EncodeToString(buf.Bytes())
}

func makeBlueprint(label string, entities []blueprintEntity) map[string]any {
	return map[string]any{
		"blueprint": map[string]any{
			"item":     "blueprint",
			"label":    label,
			"version":  562949954076673,
			"entities": entities,
		},
	}
}

type blueprintEntity struct {
	EntityNumber int            `json:"entity_number"`
	Name         string         `json:"name"`
	Position     map[string]any `json:"position"`
	Direction    int            `json:"direction,omitempty"`
	Recipe       string         `json:"recipe,omitempty"`
	Items        map[string]int `json:"items,omitempty"`
}

// --- Decoder tests ---

func TestDecodeSimpleBlueprint(t *testing.T) {
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-2", Position: map[string]any{"x": 1.0, "y": 1.0}, Recipe: "electronic-circuit"},
		{EntityNumber: 2, Name: "assembling-machine-2", Position: map[string]any{"x": 4.0, "y": 1.0}, Recipe: "electronic-circuit"},
		{EntityNumber: 3, Name: "assembling-machine-2", Position: map[string]any{"x": 7.0, "y": 1.0}, Recipe: "electronic-circuit"},
		{EntityNumber: 4, Name: "transport-belt", Position: map[string]any{"x": 0.0, "y": 3.0}, Direction: 2},
		{EntityNumber: 5, Name: "transport-belt", Position: map[string]any{"x": 1.0, "y": 3.0}, Direction: 2},
		{EntityNumber: 6, Name: "transport-belt", Position: map[string]any{"x": 2.0, "y": 3.0}, Direction: 2},
		{EntityNumber: 7, Name: "fast-inserter", Position: map[string]any{"x": 1.0, "y": 2.0}},
		{EntityNumber: 8, Name: "fast-inserter", Position: map[string]any{"x": 4.0, "y": 2.0}},
		{EntityNumber: 9, Name: "fast-inserter", Position: map[string]any{"x": 7.0, "y": 2.0}},
	}
	bp := makeBlueprint("Green Circuit Production", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)

	// Should decode all 9 entities
	entitiesOut := data["entities"].([]any)
	if len(entitiesOut) != 9 {
		t.Errorf("expected 9 entities, got %d", len(entitiesOut))
	}

	// Should have the label
	if data["label"] != "Green Circuit Production" {
		t.Errorf("label = %v, want Green Circuit Production", data["label"])
	}

	// Should report type=blueprint
	if data["type"] != "blueprint" {
		t.Errorf("type = %v, want blueprint", data["type"])
	}

	// Entity breakdown should have correct counts
	breakdown := data["entity_breakdown"].(map[string]any)
	production := breakdown["production"].(map[string]any)
	logistics := breakdown["logistics"].(map[string]any)

	if production["count"] != 3.0 {
		t.Errorf("production count = %v, want 3", production["count"])
	}
	if logistics["count"] != 6.0 {
		t.Errorf("logistics count = %v, want 6 (3 belts + 3 inserters)", logistics["count"])
	}
}

func TestDecodeWithModules(t *testing.T) {
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-3", Position: map[string]any{"x": 1.0, "y": 1.0},
			Recipe: "automation-science-pack", Items: map[string]int{"productivity-module-3": 4}},
		{EntityNumber: 2, Name: "assembling-machine-3", Position: map[string]any{"x": 4.0, "y": 1.0},
			Recipe: "automation-science-pack", Items: map[string]int{"productivity-module-3": 4}},
		{EntityNumber: 3, Name: "beacon", Position: map[string]any{"x": 1.0, "y": 4.0},
			Items: map[string]int{"speed-module-3": 2}},
		{EntityNumber: 4, Name: "beacon", Position: map[string]any{"x": 4.0, "y": 4.0},
			Items: map[string]int{"speed-module-3": 2}},
	}
	bp := makeBlueprint("Beaconed Red Science", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)

	// Should extract module information
	breakdown := data["entity_breakdown"].(map[string]any)
	production := breakdown["production"].(map[string]any)
	if production["count"] != 2.0 {
		t.Errorf("production count = %v, want 2", production["count"])
	}

	// Modules should be reported
	modules := data["module_summary"].(map[string]any)
	if modules["productivity-module-3"] != 8.0 {
		t.Errorf("productivity-module-3 count = %v, want 8", modules["productivity-module-3"])
	}
	if modules["speed-module-3"] != 4.0 {
		t.Errorf("speed-module-3 count = %v, want 4", modules["speed-module-3"])
	}
}

func TestDecodeBlueprintBook(t *testing.T) {
	bp1Entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-2", Position: map[string]any{"x": 1.0, "y": 1.0}, Recipe: "electronic-circuit"},
	}
	bp2Entities := []blueprintEntity{
		{EntityNumber: 1, Name: "oil-refinery", Position: map[string]any{"x": 2.0, "y": 2.0}, Recipe: "advanced-oil-processing"},
	}

	book := map[string]any{
		"blueprint_book": map[string]any{
			"item":         "blueprint-book",
			"label":        "Starter Kit",
			"active_index": 0,
			"version":      562949954076673,
			"blueprints": []map[string]any{
				{"index": 0, "blueprint": map[string]any{
					"item": "blueprint", "label": "Green Circuits", "version": 562949954076673, "entities": bp1Entities,
				}},
				{"index": 1, "blueprint": map[string]any{
					"item": "blueprint", "label": "Oil Setup", "version": 562949954076673, "entities": bp2Entities,
				}},
			},
		},
	}
	s := encodeBlueprintString(t, book)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)

	// Should report type=blueprint_book
	if data["type"] != "blueprint_book" {
		t.Errorf("type = %v, want blueprint_book", data["type"])
	}

	// Should have the book label
	if data["label"] != "Starter Kit" {
		t.Errorf("label = %v, want Starter Kit", data["label"])
	}

	// Should contain 2 blueprints
	blueprints := data["blueprints"].([]any)
	if len(blueprints) != 2 {
		t.Fatalf("expected 2 blueprints in book, got %d", len(blueprints))
	}

	// First blueprint should have 1 entity
	bp1 := blueprints[0].(map[string]any)
	if bp1["label"] != "Green Circuits" {
		t.Errorf("bp1 label = %v, want Green Circuits", bp1["label"])
	}
	bp1Ents := bp1["entities"].([]any)
	if len(bp1Ents) != 1 {
		t.Errorf("bp1 entities = %d, want 1", len(bp1Ents))
	}
}

func TestDecodeInvalidString(t *testing.T) {
	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"not-a-valid-blueprint"}`)
	if code != 1 {
		t.Fatalf("expected exit 1, got %d", code)
	}
	if result["type"] != "error" {
		t.Errorf("expected type=error, got %v", result["type"])
	}
}

func TestDecodeEmptyBlueprint(t *testing.T) {
	bp := map[string]any{
		"blueprint": map[string]any{
			"item":     "blueprint",
			"label":    "Empty",
			"version":  562949954076673,
			"entities": []blueprintEntity{},
		},
	}
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	entitiesOut := data["entities"].([]any)
	if len(entitiesOut) != 0 {
		t.Errorf("expected 0 entities, got %d", len(entitiesOut))
	}
	if data["entity_count"] != 0.0 {
		t.Errorf("entity_count = %v, want 0", data["entity_count"])
	}
}

func TestDecodeOilProcessing(t *testing.T) {
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "oil-refinery", Position: map[string]any{"x": 2.0, "y": 2.0}, Recipe: "advanced-oil-processing"},
		{EntityNumber: 2, Name: "oil-refinery", Position: map[string]any{"x": 7.0, "y": 2.0}, Recipe: "advanced-oil-processing"},
		{EntityNumber: 3, Name: "chemical-plant", Position: map[string]any{"x": 2.0, "y": 7.0}, Recipe: "heavy-oil-cracking"},
		{EntityNumber: 4, Name: "chemical-plant", Position: map[string]any{"x": 5.0, "y": 7.0}, Recipe: "light-oil-cracking"},
		{EntityNumber: 5, Name: "chemical-plant", Position: map[string]any{"x": 8.0, "y": 7.0}, Recipe: "light-oil-cracking"},
		{EntityNumber: 6, Name: "storage-tank", Position: map[string]any{"x": 12.0, "y": 2.0}},
		{EntityNumber: 7, Name: "pipe", Position: map[string]any{"x": 10.0, "y": 3.0}},
		{EntityNumber: 8, Name: "pump", Position: map[string]any{"x": 10.0, "y": 5.0}},
	}
	bp := makeBlueprint("Oil Processing", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	breakdown := data["entity_breakdown"].(map[string]any)
	production := breakdown["production"].(map[string]any)

	// 2 refineries + 3 chemical plants = 5 production entities
	if production["count"] != 5.0 {
		t.Errorf("production count = %v, want 5", production["count"])
	}

	// Recipes should be extracted
	recipes := data["recipe_summary"].(map[string]any)
	if recipes["advanced-oil-processing"] != 2.0 {
		t.Errorf("advanced-oil-processing count = %v, want 2", recipes["advanced-oil-processing"])
	}
	if recipes["heavy-oil-cracking"] != 1.0 {
		t.Errorf("heavy-oil-cracking count = %v, want 1", recipes["heavy-oil-cracking"])
	}
	if recipes["light-oil-cracking"] != 2.0 {
		t.Errorf("light-oil-cracking count = %v, want 2", recipes["light-oil-cracking"])
	}
}

func TestDecodePowerBlueprint(t *testing.T) {
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "nuclear-reactor", Position: map[string]any{"x": 2.0, "y": 2.0}},
		{EntityNumber: 2, Name: "nuclear-reactor", Position: map[string]any{"x": 7.0, "y": 2.0}},
		{EntityNumber: 3, Name: "heat-exchanger", Position: map[string]any{"x": 0.0, "y": 10.0}},
		{EntityNumber: 4, Name: "heat-exchanger", Position: map[string]any{"x": 3.0, "y": 10.0}},
		{EntityNumber: 5, Name: "steam-turbine", Position: map[string]any{"x": 0.0, "y": 13.0}},
		{EntityNumber: 6, Name: "steam-turbine", Position: map[string]any{"x": 3.0, "y": 13.0}},
		{EntityNumber: 7, Name: "steam-turbine", Position: map[string]any{"x": 6.0, "y": 13.0}},
		{EntityNumber: 8, Name: "offshore-pump", Position: map[string]any{"x": -2.0, "y": 10.0}},
		{EntityNumber: 9, Name: "heat-pipe", Position: map[string]any{"x": 0.0, "y": 9.0}},
	}
	bp := makeBlueprint("Nuclear Power", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	breakdown := data["entity_breakdown"].(map[string]any)
	power := breakdown["power"].(map[string]any)

	// 2 reactors + 2 HX + 3 turbines + 1 offshore pump + 1 heat pipe = 9 power entities
	if power["count"] != 9.0 {
		t.Errorf("power count = %v, want 9", power["count"])
	}
}

func TestDecodeDefenseBlueprint(t *testing.T) {
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "gun-turret", Position: map[string]any{"x": 2.0, "y": 0.0}},
		{EntityNumber: 2, Name: "gun-turret", Position: map[string]any{"x": 5.0, "y": 0.0}},
		{EntityNumber: 3, Name: "laser-turret", Position: map[string]any{"x": 8.0, "y": 0.0}},
		{EntityNumber: 4, Name: "stone-wall", Position: map[string]any{"x": 0.0, "y": -1.0}},
		{EntityNumber: 5, Name: "stone-wall", Position: map[string]any{"x": 1.0, "y": -1.0}},
		{EntityNumber: 6, Name: "stone-wall", Position: map[string]any{"x": 2.0, "y": -1.0}},
		{EntityNumber: 7, Name: "gate", Position: map[string]any{"x": 5.0, "y": -1.0}},
		{EntityNumber: 8, Name: "radar", Position: map[string]any{"x": 10.0, "y": 0.0}},
	}
	bp := makeBlueprint("Defense Wall", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	breakdown := data["entity_breakdown"].(map[string]any)
	defense := breakdown["defense"].(map[string]any)

	// 2 gun turrets + 1 laser turret + 3 walls + 1 gate + 1 radar = 8 defense entities
	if defense["count"] != 8.0 {
		t.Errorf("defense count = %v, want 8", defense["count"])
	}
}

// --- Recipe analysis tests ---

func TestRecipeAnalysisGreenCircuits(t *testing.T) {
	// 3 AM2s making electronic-circuit, no modules
	// AM2 speed: 0.75, recipe energy: 0.5, output: 1 item
	// Per machine: 0.75/0.5 * 1 * 60 = 90 items/min
	// Total: 3 * 90 = 270 items/min
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-2", Position: map[string]any{"x": 1.0, "y": 1.0}, Recipe: "electronic-circuit"},
		{EntityNumber: 2, Name: "assembling-machine-2", Position: map[string]any{"x": 4.0, "y": 1.0}, Recipe: "electronic-circuit"},
		{EntityNumber: 3, Name: "assembling-machine-2", Position: map[string]any{"x": 7.0, "y": 1.0}, Recipe: "electronic-circuit"},
	}
	bp := makeBlueprint("Green Circuits", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	analysis := data["recipe_analysis"].([]any)

	if len(analysis) != 1 {
		t.Fatalf("expected 1 recipe analysis entry, got %d", len(analysis))
	}

	entry := analysis[0].(map[string]any)
	if entry["recipe"] != "electronic-circuit" {
		t.Errorf("recipe = %v, want electronic-circuit", entry["recipe"])
	}
	if entry["machine_count"] != 3.0 {
		t.Errorf("machine_count = %v, want 3", entry["machine_count"])
	}
	if entry["machine_type"] != "assembling-machine-2" {
		t.Errorf("machine_type = %v, want assembling-machine-2", entry["machine_type"])
	}

	// 90 items/min per machine * 3 = 270
	totalRate := entry["items_per_min"].(float64)
	if totalRate < 269.9 || totalRate > 270.1 {
		t.Errorf("items_per_min = %v, want ~270", totalRate)
	}
}

func TestRecipeAnalysisWithModules(t *testing.T) {
	// 2 AM3s with 4x prod3 making automation-science-pack
	// AM3 speed: 1.25, prod3: speed=-0.15, prod=0.1
	// 4 modules: speedBonus=-0.6, prodBonus=0.4
	// effective_speed = 1.25 * (1 + (-0.6)) = 0.5
	// crafts/sec = 0.5 / 5 = 0.1
	// items/min per machine = 0.1 * 1 * (1+0.4) * 60 = 8.4
	// Total: 2 * 8.4 = 16.8
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-3", Position: map[string]any{"x": 1.0, "y": 1.0},
			Recipe: "automation-science-pack", Items: map[string]int{"productivity-module-3": 4}},
		{EntityNumber: 2, Name: "assembling-machine-3", Position: map[string]any{"x": 4.0, "y": 1.0},
			Recipe: "automation-science-pack", Items: map[string]int{"productivity-module-3": 4}},
	}
	bp := makeBlueprint("Beaconed Science", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	analysis := data["recipe_analysis"].([]any)

	if len(analysis) != 1 {
		t.Fatalf("expected 1 recipe analysis entry, got %d", len(analysis))
	}

	entry := analysis[0].(map[string]any)
	totalRate := entry["items_per_min"].(float64)
	if totalRate < 16.7 || totalRate > 16.9 {
		t.Errorf("items_per_min = %v, want ~16.8", totalRate)
	}

	// Should report productivity bonus
	prodBonus := entry["productivity_bonus"].(float64)
	if prodBonus < 0.39 || prodBonus > 0.41 {
		t.Errorf("productivity_bonus = %v, want ~0.4", prodBonus)
	}
}

func TestRecipeAnalysisMixedRecipes(t *testing.T) {
	// Oil setup: 2 refineries (advanced-oil-processing) + 3 chem plants (2 recipes)
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "oil-refinery", Position: map[string]any{"x": 2.0, "y": 2.0}, Recipe: "advanced-oil-processing"},
		{EntityNumber: 2, Name: "oil-refinery", Position: map[string]any{"x": 7.0, "y": 2.0}, Recipe: "advanced-oil-processing"},
		{EntityNumber: 3, Name: "chemical-plant", Position: map[string]any{"x": 2.0, "y": 7.0}, Recipe: "heavy-oil-cracking"},
		{EntityNumber: 4, Name: "chemical-plant", Position: map[string]any{"x": 5.0, "y": 7.0}, Recipe: "light-oil-cracking"},
		{EntityNumber: 5, Name: "chemical-plant", Position: map[string]any{"x": 8.0, "y": 7.0}, Recipe: "light-oil-cracking"},
	}
	bp := makeBlueprint("Oil Processing", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	analysis := data["recipe_analysis"].([]any)

	// 3 distinct recipes
	if len(analysis) != 3 {
		t.Fatalf("expected 3 recipe analysis entries, got %d", len(analysis))
	}

	// Find each recipe by name
	recipes := map[string]map[string]any{}
	for _, a := range analysis {
		entry := a.(map[string]any)
		recipes[entry["recipe"].(string)] = entry
	}

	if recipes["advanced-oil-processing"]["machine_count"] != 2.0 {
		t.Errorf("advanced-oil-processing count = %v, want 2", recipes["advanced-oil-processing"]["machine_count"])
	}
	if recipes["heavy-oil-cracking"]["machine_count"] != 1.0 {
		t.Errorf("heavy-oil-cracking count = %v, want 1", recipes["heavy-oil-cracking"]["machine_count"])
	}
	if recipes["light-oil-cracking"]["machine_count"] != 2.0 {
		t.Errorf("light-oil-cracking count = %v, want 2", recipes["light-oil-cracking"]["machine_count"])
	}
}

func TestRecipeAnalysisUnknownRecipe(t *testing.T) {
	// Modded recipe not in baked-in data
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-2", Position: map[string]any{"x": 1.0, "y": 1.0}, Recipe: "modded-super-item"},
	}
	bp := makeBlueprint("Modded Blueprint", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)

	// Should still succeed, but report unknown recipes
	unknownRecipes := data["unknown_recipes"].([]any)
	if len(unknownRecipes) != 1 {
		t.Fatalf("expected 1 unknown recipe, got %d", len(unknownRecipes))
	}
	if unknownRecipes[0] != "modded-super-item" {
		t.Errorf("unknown recipe = %v, want modded-super-item", unknownRecipes[0])
	}
}

// --- Beacon association tests ---

func TestBeaconAssociation(t *testing.T) {
	// 2 AM3s with 4x prod3 + 2 beacons with 2x speed3, beacons within range
	// Beacon at (1,4), machines at (1,1) and (4,1) — distance 3.0 and ~4.2, both within 6.0
	// resolveBeaconEffects(["speed-module-3","speed-module-3"], 2) = 2 * 1.0 * 1.5 / sqrt(2) ≈ 2.121
	// effective_speed = 1.25 * (1 + (-0.6) + 2.121) ≈ 3.15
	// crafts/sec = 3.15 / 5 = 0.630, items/min/machine = 0.630 * 1.4 * 60 ≈ 52.94
	// Total: 2 * 52.94 ≈ 105.88
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-3", Position: map[string]any{"x": 1.0, "y": 1.0},
			Recipe: "automation-science-pack", Items: map[string]int{"productivity-module-3": 4}},
		{EntityNumber: 2, Name: "assembling-machine-3", Position: map[string]any{"x": 4.0, "y": 1.0},
			Recipe: "automation-science-pack", Items: map[string]int{"productivity-module-3": 4}},
		{EntityNumber: 3, Name: "beacon", Position: map[string]any{"x": 1.0, "y": 4.0},
			Items: map[string]int{"speed-module-3": 2}},
		{EntityNumber: 4, Name: "beacon", Position: map[string]any{"x": 4.0, "y": 4.0},
			Items: map[string]int{"speed-module-3": 2}},
	}
	bp := makeBlueprint("Beaconed Science", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	analysis := data["recipe_analysis"].([]any)
	entry := analysis[0].(map[string]any)

	// With beacons, rate should be much higher than without (16.8 without beacons)
	totalRate := entry["items_per_min"].(float64)
	if totalRate < 100 || totalRate > 112 {
		t.Errorf("items_per_min = %v, want ~105.88 (with beacon effects)", totalRate)
	}

	// Should report beacon count
	beaconCount := entry["beacon_count"]
	if beaconCount == nil || beaconCount == 0.0 {
		t.Errorf("beacon_count = %v, want > 0", beaconCount)
	}
}

func TestBeaconOutOfRange(t *testing.T) {
	// AM3 at (1,1), beacon at (50,50) — way out of SupplyAreaDistance
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-3", Position: map[string]any{"x": 1.0, "y": 1.0},
			Recipe: "automation-science-pack", Items: map[string]int{"productivity-module-3": 4}},
		{EntityNumber: 2, Name: "beacon", Position: map[string]any{"x": 50.0, "y": 50.0},
			Items: map[string]int{"speed-module-3": 2}},
	}
	bp := makeBlueprint("Far Beacon", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	analysis := data["recipe_analysis"].([]any)
	entry := analysis[0].(map[string]any)

	// Without beacon effects: same as TestRecipeAnalysisWithModules = 8.4/machine
	totalRate := entry["items_per_min"].(float64)
	if totalRate < 8.3 || totalRate > 8.5 {
		t.Errorf("items_per_min = %v, want ~8.4 (no beacon effects)", totalRate)
	}

	// Beacon count should be 0 for this machine
	beaconCount := entry["beacon_count"].(float64)
	if beaconCount != 0 {
		t.Errorf("beacon_count = %v, want 0", beaconCount)
	}
}

// --- Module audit tests ---

func TestModuleAuditEmptySlots(t *testing.T) {
	// AM3 has 4 module slots, only 2 prod3 inserted
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-3", Position: map[string]any{"x": 1.0, "y": 1.0},
			Recipe: "electronic-circuit", Items: map[string]int{"productivity-module-3": 2}},
	}
	bp := makeBlueprint("Partial Modules", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	moduleAudit := data["module_audit"].(map[string]any)

	emptySlots := moduleAudit["total_empty_slots"].(float64)
	if emptySlots != 2.0 {
		t.Errorf("total_empty_slots = %v, want 2", emptySlots)
	}

	utilization := moduleAudit["utilization_pct"].(float64)
	if utilization < 49.9 || utilization > 50.1 {
		t.Errorf("utilization_pct = %v, want ~50", utilization)
	}
}

func TestModuleAuditNoModules(t *testing.T) {
	// AM2 has 2 module slots, no modules inserted
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-2", Position: map[string]any{"x": 1.0, "y": 1.0},
			Recipe: "electronic-circuit"},
	}
	bp := makeBlueprint("No Modules", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	moduleAudit := data["module_audit"].(map[string]any)

	emptySlots := moduleAudit["total_empty_slots"].(float64)
	if emptySlots != 2.0 {
		t.Errorf("total_empty_slots = %v, want 2", emptySlots)
	}

	utilization := moduleAudit["utilization_pct"].(float64)
	if utilization != 0 {
		t.Errorf("utilization_pct = %v, want 0", utilization)
	}
}

func TestModuleAuditFullyUtilized(t *testing.T) {
	// AM3 has 4 module slots, all 4 filled with prod3
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-3", Position: map[string]any{"x": 1.0, "y": 1.0},
			Recipe: "electronic-circuit", Items: map[string]int{"productivity-module-3": 4}},
	}
	bp := makeBlueprint("Full Modules", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	moduleAudit := data["module_audit"].(map[string]any)

	emptySlots := moduleAudit["total_empty_slots"].(float64)
	if emptySlots != 0 {
		t.Errorf("total_empty_slots = %v, want 0", emptySlots)
	}

	utilization := moduleAudit["utilization_pct"].(float64)
	if utilization != 100.0 {
		t.Errorf("utilization_pct = %v, want 100", utilization)
	}
}

// --- Scoring + recommendations tests ---

func TestRecommendations(t *testing.T) {
	// AM3 with empty module slots should generate a recommendation
	entities := []blueprintEntity{
		{EntityNumber: 1, Name: "assembling-machine-3", Position: map[string]any{"x": 1.0, "y": 1.0},
			Recipe: "electronic-circuit"},
		{EntityNumber: 2, Name: "assembling-machine-3", Position: map[string]any{"x": 4.0, "y": 1.0},
			Recipe: "electronic-circuit", Items: map[string]int{"productivity-module-3": 2}},
	}
	bp := makeBlueprint("Needs Modules", entities)
	s := encodeBlueprintString(t, bp)

	result, code := runReference(t, `{"module":"blueprint_analyzer","blueprint_string":"`+s+`"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d: %v", code, result)
	}

	data := result["data"].(map[string]any)
	recommendations := data["recommendations"].([]any)

	if len(recommendations) == 0 {
		t.Error("expected at least 1 recommendation for empty module slots")
	}
}

func TestDecodeMissingBlueprintString(t *testing.T) {
	result, code := runReference(t, `{"module":"blueprint_analyzer"}`)
	if code != 1 {
		t.Fatalf("expected exit 1, got %d", code)
	}
	if result["type"] != "error" {
		t.Errorf("expected type=error, got %v", result["type"])
	}
}
