package main

import "testing"

func TestHardDriveRecipeLookup(t *testing.T) {
	res, err := hardDriveTiers(map[string]any{"recipe": "Copper Alloy Ingot"})
	if err != nil {
		t.Fatalf("hardDriveTiers: %v", err)
	}
	recipes, _ := res["recipes"].([]map[string]any)
	e := findEntry(recipes, "name", "Copper Alloy Ingot")
	if e == nil {
		t.Fatalf("Copper Alloy Ingot not found in %v", recipes)
	}
	effort, _ := e["effort"].(map[string]any)
	resources, _ := e["resources"].(map[string]any)
	if effort["tier"] == "" || effort["tier"] == nil {
		t.Errorf("effort tier empty: %v", effort)
	}
	if resources["tier"] == "" || resources["tier"] == nil {
		t.Errorf("resources tier empty: %v", resources)
	}
	// Metric-delta evidence travels with the score.
	if _, ok := resources["resourcesScaledPct"]; !ok {
		t.Errorf("resources score missing deltas: %v", resources)
	}
	// The recipe's own ingredients ride along.
	if ing, _ := e["ingredients"].([]map[string]any); len(ing) == 0 {
		t.Errorf("no ingredients for Copper Alloy Ingot: %v", e)
	}
}

func TestHardDriveTierList(t *testing.T) {
	res, err := hardDriveTiers(map[string]any{"tier": "S", "ranking": "resources"})
	if err != nil {
		t.Fatalf("hardDriveTiers: %v", err)
	}
	recipes, _ := res["recipes"].([]map[string]any)
	if len(recipes) == 0 {
		t.Fatal("no S-tier resources recipes")
	}
	for _, r := range recipes {
		res, _ := r["resources"].(map[string]any)
		if res["tier"] != "S" {
			t.Errorf("%v is not resources-S: %v", r["name"], res["tier"])
		}
	}
}

func TestHardDriveItemAlternates(t *testing.T) {
	res, err := hardDriveTiers(map[string]any{"item": "Iron Ingot"})
	if err != nil {
		t.Fatalf("hardDriveTiers: %v", err)
	}
	alts, _ := res["alternates"].([]map[string]any)
	if len(alts) < 2 {
		t.Fatalf("Iron Ingot alternates = %d, want >= 2", len(alts))
	}
	if findEntry(alts, "name", "Pure Iron Ingot") == nil {
		t.Errorf("Pure Iron Ingot missing from Iron Ingot alternates: %v", alts)
	}
}

func TestHardDriveOverview(t *testing.T) {
	res, err := hardDriveTiers(map[string]any{})
	if err != nil {
		t.Fatalf("hardDriveTiers: %v", err)
	}
	byRanking, _ := res["byRanking"].(map[string]any)
	effort, _ := byRanking["effort"].(map[string]any)
	sTier, _ := effort["S"].([]string)
	aTier, _ := effort["A"].([]string)
	if len(sTier)+len(aTier) == 0 {
		t.Errorf("overview has no effort S/A recipes: %v", effort)
	}
}

func TestHardDriveProgressionUnlocked(t *testing.T) {
	prog := map[string]any{
		"alternateRecipes": map[string]any{
			"schematicClassNames": []any{"Schematic_Alternate_WetConcrete_C"},
		},
	}
	res, err := hardDriveTiers(map[string]any{"recipe": "Wet Concrete", "progression": prog})
	if err != nil {
		t.Fatalf("hardDriveTiers: %v", err)
	}
	recipes, _ := res["recipes"].([]map[string]any)
	e := findEntry(recipes, "name", "Wet Concrete")
	if e == nil {
		t.Fatalf("Wet Concrete not found: %v", recipes)
	}
	if e["unlocked"] != true {
		t.Errorf("Wet Concrete should be marked unlocked: %v", e)
	}
}

func TestHardDriveRecommendedUnlocksExcludesOwned(t *testing.T) {
	// Copper Alloy Ingot is a high-effort-tier alternate that would otherwise
	// be recommended; once unlocked it must drop out of recommendedUnlocks.
	prog := map[string]any{
		"alternateRecipes": map[string]any{
			"schematicClassNames": []any{"Schematic_Alternate_CopperAlloyIngot_C"},
		},
	}
	res, err := hardDriveTiers(map[string]any{"progression": prog})
	if err != nil {
		t.Fatalf("hardDriveTiers: %v", err)
	}
	recs, _ := res["recommendedUnlocks"].([]map[string]any)
	if len(recs) == 0 {
		t.Fatal("no recommendedUnlocks produced")
	}
	for _, r := range recs {
		if r["className"] == "Recipe_Alternate_CopperAlloyIngot_C" {
			t.Errorf("an unlocked recipe leaked into recommendedUnlocks: %v", r)
		}
	}
}

func TestHardDriveUnknownRecipe(t *testing.T) {
	res, err := hardDriveTiers(map[string]any{"recipe": "Nonexistent Widget Recipe"})
	if err != nil {
		t.Fatalf("hardDriveTiers: %v", err)
	}
	recipes, _ := res["recipes"].([]map[string]any)
	if len(recipes) != 0 {
		t.Errorf("expected no matches, got %v", recipes)
	}
}
