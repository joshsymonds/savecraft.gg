package data

import "testing"

// Spot checks against facts read directly from the generated tables and
// verified by inspection of Docs/en-US.json (Steam build 23652534).

func TestRecipeIronPlate(t *testing.T) {
	r, ok := Recipes["Recipe_IronPlate_C"]
	if !ok {
		t.Fatal("Recipe_IronPlate_C missing")
	}
	if r.DisplayName != "Iron Plate" || r.DurationSec != 6 {
		t.Errorf("recipe = %+v", r)
	}
	if len(r.Ingredients) != 1 || r.Ingredients[0] != (ItemAmount{"Desc_IronIngot_C", 3}) {
		t.Errorf("ingredients = %v", r.Ingredients)
	}
	if len(r.Products) != 1 || r.Products[0] != (ItemAmount{"Desc_IronPlate_C", 2}) {
		t.Errorf("products = %v", r.Products)
	}
	if r.Alternate {
		t.Error("Iron Plate is not an alternate")
	}
	found := false
	for _, p := range r.ProducedIn {
		if p == "Build_ConstructorMk1_C" {
			found = true
		}
	}
	if !found {
		t.Errorf("ProducedIn = %v, want constructor", r.ProducedIn)
	}
}

func TestAlternateRecipeFlag(t *testing.T) {
	alternates := 0
	for _, r := range Recipes {
		if r.Alternate {
			alternates++
		}
	}
	// The game ships ~110+ alternate recipes; exact count drifts by patch.
	if alternates < 80 {
		t.Errorf("alternate recipes = %d, want 80+", alternates)
	}
	if r := Recipes["Recipe_Alternate_WetConcrete_C"]; !r.Alternate {
		t.Errorf("Wet Concrete should be alternate: %+v", r)
	}
}

func TestItemIronPlate(t *testing.T) {
	i, ok := Items["Desc_IronPlate_C"]
	if !ok {
		t.Fatal("Desc_IronPlate_C missing")
	}
	if i.DisplayName != "Iron Plate" || i.Form != "RF_SOLID" || i.SinkPoints != 6 {
		t.Errorf("item = %+v", i)
	}
}

func TestBuildingCoalGenerator(t *testing.T) {
	b, ok := Buildings["Build_GeneratorCoal_C"]
	if !ok {
		t.Fatal("Build_GeneratorCoal_C missing")
	}
	if b.Kind != "generator" || b.PowerProductionMW != 75 {
		t.Errorf("coal generator = %+v", b)
	}
	if len(b.FuelClasses) == 0 || b.FuelClasses[0] != "Desc_Coal_C" {
		t.Errorf("fuels = %v", b.FuelClasses)
	}
}

func TestBuildingConstructor(t *testing.T) {
	b := Buildings["Build_ConstructorMk1_C"]
	if b.Kind != "manufacturer" || b.PowerMW != 4 || b.DisplayName != "Constructor" {
		t.Errorf("constructor = %+v", b)
	}
}

func TestBuildingMinerMk3Rate(t *testing.T) {
	b := Buildings["Build_MinerMk3_C"]
	// 1 item per 0.25s cycle = 240/min on a normal node at 100% clock.
	if b.ItemsPerCycle != 1 || b.ExtractCycleSec != 0.25 {
		t.Errorf("miner mk3 = %+v", b)
	}
}

func TestSchematicTier(t *testing.T) {
	s, ok := Schematics["Schematic_5-1_C"]
	if !ok {
		t.Fatal("Schematic_5-1_C missing")
	}
	if s.Tier != 5 || s.Type != "EST_Milestone" {
		t.Errorf("schematic = %+v", s)
	}
	if len(s.UnlockRecipes) == 0 {
		t.Error("milestone unlocks no recipes")
	}
}

func TestTableSizes(t *testing.T) {
	// Pinned to the generating Docs build; update on regeneration.
	if len(Recipes) != 872 {
		t.Errorf("recipes = %d, want 872", len(Recipes))
	}
	if len(Items) != 209 {
		t.Errorf("items = %d, want 209", len(Items))
	}
	if len(Buildings) != 22 {
		t.Errorf("buildings = %d, want 22", len(Buildings))
	}
	if len(Schematics) != 574 {
		t.Errorf("schematics = %d, want 574", len(Schematics))
	}
}
