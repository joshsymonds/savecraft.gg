package main

import (
	"strings"
	"testing"
)

func TestBuildingReferenceSchema(t *testing.T) {
	modules, _ := schema()["modules"].(map[string]any)
	mod, ok := modules["building_reference"].(map[string]any)
	if !ok {
		t.Fatal("building_reference missing from schema")
	}
	if desc, _ := mod["description"].(string); desc == "" {
		t.Error("building_reference has no description")
	}
	params, _ := mod["parameters"].(map[string]any)
	if _, ok := params["building"]; !ok {
		t.Error("building_reference schema missing 'building' parameter")
	}
}

func TestBuildingReferenceDepot(t *testing.T) {
	res, err := buildingReference(map[string]any{"building": "Dimensional Depot"})
	if err != nil {
		t.Fatalf("buildingReference: %v", err)
	}
	buildings, _ := res["buildings"].([]map[string]any)
	depot := findEntry(buildings, "className", "Build_CentralStorage_C")
	if depot == nil {
		t.Fatalf("Dimensional Depot not found: %v", buildings)
	}
	desc, _ := depot["description"].(string)
	if !strings.Contains(desc, "Build Gun") || !strings.Contains(desc, "Crafting Stations") {
		t.Errorf("depot description missing mechanics: %q", desc)
	}
	if _, ok := depot["dimensions"]; !ok {
		t.Error("depot should report dimensions (it ships a clearance box)")
	}
}

func TestBuildingReferenceBlueprintDesigner(t *testing.T) {
	res, err := buildingReference(map[string]any{"building": "Blueprint Designer Mk.3"})
	if err != nil {
		t.Fatalf("buildingReference: %v", err)
	}
	buildings, _ := res["buildings"].([]map[string]any)
	bp := findEntry(buildings, "className", "Build_BlueprintDesigner_Mk3_C")
	if bp == nil {
		t.Fatalf("Blueprint Designer Mk.3 not found: %v", buildings)
	}
	// Dimensions ride verbatim in the description; no clearance box ships.
	if desc, _ := bp["description"].(string); !strings.Contains(desc, "48") {
		t.Errorf("Mk.3 description should state 48 m: %q", desc)
	}
	if _, ok := bp["dimensions"]; ok {
		t.Errorf("Mk.3 has no clearance box; dimensions should be omitted: %v", bp["dimensions"])
	}
}

func TestBuildingReferenceManufacturer(t *testing.T) {
	res, err := buildingReference(map[string]any{"building": "Manufacturer"})
	if err != nil {
		t.Fatalf("buildingReference: %v", err)
	}
	buildings, _ := res["buildings"].([]map[string]any)
	m := findEntry(buildings, "className", "Build_ManufacturerMk1_C")
	if m == nil {
		t.Fatalf("Manufacturer not found: %v", buildings)
	}
	cost, _ := m["buildCost"].([]map[string]any)
	if findEntry(cost, "className", "Desc_Motor_C") == nil {
		t.Errorf("build cost should include Motor: %v", cost)
	}
	unlock, _ := m["unlock"].(map[string]any)
	if name, _ := unlock["schematic"].(string); name != "Industrial Manufacturing" {
		t.Errorf("unlock schematic = %v, want Industrial Manufacturing", unlock["schematic"])
	}
	if tier, _ := unlock["tier"].(int); tier != 6 {
		t.Errorf("unlock tier = %v, want 6", unlock["tier"])
	}
	dims, ok := m["dimensions"].(map[string]any)
	if !ok {
		t.Fatalf("manufacturer should have dimensions: %v", m)
	}
	if w, _ := dims["widthM"].(float64); w != 18 {
		t.Errorf("widthM = %v, want 18", dims["widthM"])
	}
	stats, _ := m["stats"].([]map[string]any)
	if findEntry(stats, "label", "Power draw") == nil {
		t.Errorf("stats should include Power draw: %v", stats)
	}
}

func TestBuildingReferenceCategory(t *testing.T) {
	res, err := buildingReference(map[string]any{"category": "production"})
	if err != nil {
		t.Fatalf("buildingReference: %v", err)
	}
	cat, _ := res["category"].(map[string]any)
	buildings, _ := cat["buildings"].([]map[string]any)
	m := findEntry(buildings, "className", "Build_ManufacturerMk1_C")
	if m == nil {
		t.Fatalf("production category should include Manufacturer: %v", buildings)
	}
	if name, _ := m["name"].(string); name == "" {
		t.Error("category entries should carry a display name")
	}
}

func TestBuildingReferenceRequiresParam(t *testing.T) {
	if _, err := buildingReference(map[string]any{}); err == nil {
		t.Error("expected error when neither building nor category is given")
	}
}
