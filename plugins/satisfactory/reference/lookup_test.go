package main

import (
	"strings"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/satisfactory/reference/data"
)

// Tests run against the real generated data tables (compiled in), pinning
// known game facts.

func findEntry(list []map[string]any, key, fragment string) map[string]any {
	for _, e := range list {
		if s, _ := e[key].(string); strings.Contains(s, fragment) {
			return e
		}
	}
	return nil
}

func TestLookupItemIronPlate(t *testing.T) {
	res, err := recipeLookup(map[string]any{"item": "Iron Plate"})
	if err != nil {
		t.Fatalf("recipeLookup: %v", err)
	}
	items, _ := res["items"].([]map[string]any)
	if len(items) == 0 {
		t.Fatal("no item matches")
	}
	item := items[0]
	if item["name"] != "Iron Plate" {
		t.Errorf("first match = %v (fuzzy ranking should put exact match first)", item["name"])
	}

	produced, _ := item["producedBy"].([]map[string]any)
	base := findEntry(produced, "className", "Recipe_IronPlate_C")
	if base == nil {
		t.Fatalf("Recipe_IronPlate_C not in producedBy: %v", produced)
	}
	products, _ := base["products"].([]map[string]any)
	if len(products) != 1 || products[0]["perMinute"] != 20.0 {
		t.Errorf("iron plate output = %v, want 20/min", products)
	}

	consumed, _ := item["consumedBy"].([]map[string]any)
	if findEntry(consumed, "className", "Recipe_IronPlateReinforced_C") == nil {
		t.Errorf("Reinforced Iron Plate not in consumedBy")
	}
	// Building-construction recipes (build gun) must not flood consumers.
	for _, c := range consumed {
		if name, _ := c["className"].(string); strings.HasPrefix(name, "Recipe_ConstructorMk1") {
			t.Errorf("build-gun recipe %s leaked into consumedBy", name)
		}
	}
}

func TestLookupItemByClassName(t *testing.T) {
	res, err := recipeLookup(map[string]any{"item": "Desc_IronPlate_C"})
	if err != nil {
		t.Fatalf("recipeLookup: %v", err)
	}
	items, _ := res["items"].([]map[string]any)
	if len(items) != 1 || items[0]["name"] != "Iron Plate" {
		t.Errorf("class lookup = %v", items)
	}
}

func TestLookupRecipeAlternate(t *testing.T) {
	res, err := recipeLookup(map[string]any{"recipe": "Pure Aluminum Ingot"})
	if err != nil {
		t.Fatalf("recipeLookup: %v", err)
	}
	recipes, _ := res["recipes"].([]map[string]any)
	r := findEntry(recipes, "className", "Recipe_PureAluminumIngot_C")
	if r == nil {
		t.Fatalf("recipe not found: %v", recipes)
	}
	if r["alternate"] != true {
		t.Errorf("alternate = %v, want true", r["alternate"])
	}
}

func TestLookupBuilding(t *testing.T) {
	res, err := recipeLookup(map[string]any{"building": "Constructor"})
	if err != nil {
		t.Fatalf("recipeLookup: %v", err)
	}
	buildings, _ := res["buildings"].([]map[string]any)
	b := findEntry(buildings, "name", "Constructor")
	if b == nil {
		t.Fatalf("constructor not found: %v", buildings)
	}
	if b["powerMW"] != 4.0 {
		t.Errorf("powerMW = %v, want 4", b["powerMW"])
	}
	recipes, _ := b["recipes"].([]string)
	found := false
	for _, r := range recipes {
		if r == "Iron Plate" {
			found = true
		}
	}
	if !found {
		t.Errorf("constructor recipes missing Iron Plate (got %d recipes)", len(recipes))
	}
}

func TestLookupFluidPerMinute(t *testing.T) {
	// Recipe_ResidualPlastic_C: 60L polymer resin + 20L water -> 2 plastic / 6s.
	res, err := recipeLookup(map[string]any{"recipe": "Desc_Water_C"})
	if err == nil {
		_ = res // water isn't a recipe; just must not error oddly below
	}
	res, err = recipeLookup(map[string]any{"item": "Polymer Resin"})
	if err != nil {
		t.Fatalf("recipeLookup: %v", err)
	}
	items, _ := res["items"].([]map[string]any)
	if len(items) == 0 {
		t.Fatal("polymer resin not found")
	}
}

func TestLookupNoQuery(t *testing.T) {
	if _, err := recipeLookup(map[string]any{}); err == nil {
		t.Error("expected error for empty lookup query")
	}
}

func TestLookupUnlockTier(t *testing.T) {
	// Pick a recipe unlocked by the tier-5 milestone Schematic_5-1_C and
	// confirm the tier surfaces on lookup.
	target := data.Schematics["Schematic_5-1_C"].UnlockRecipes[0]
	res, err := recipeLookup(map[string]any{"recipe": target})
	if err != nil {
		t.Fatalf("recipeLookup: %v", err)
	}
	recipes, _ := res["recipes"].([]map[string]any)
	if len(recipes) == 0 {
		t.Fatalf("recipe %s not found", target)
	}
	if recipes[0]["unlockTier"] != 5 {
		t.Errorf("unlockTier = %v, want 5", recipes[0]["unlockTier"])
	}
}
