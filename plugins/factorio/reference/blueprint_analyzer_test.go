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

func TestDecodeMissingBlueprintString(t *testing.T) {
	result, code := runReference(t, `{"module":"blueprint_analyzer"}`)
	if code != 1 {
		t.Fatalf("expected exit 1, got %d", code)
	}
	if result["type"] != "error" {
		t.Errorf("expected type=error, got %v", result["type"])
	}
}
