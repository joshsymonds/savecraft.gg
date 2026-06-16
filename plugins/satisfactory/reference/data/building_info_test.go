package data

import (
	"strings"
	"testing"
)

// Spot checks against facts read directly from the generated BuildingInfos
// table and verified by inspection of Docs/en-US.json (Steam build 23652534).

func stat(b BuildingInfo, label string) (BuildingStat, bool) {
	for _, s := range b.Stats {
		if s.Label == label {
			return s, true
		}
	}
	return BuildingStat{}, false
}

func TestBuildingInfoDimensionalDepot(t *testing.T) {
	// The Depot lives under FGCentralStorageContainer, NOT an FGBuildable*
	// group — the Build_ prefix is what makes it discoverable.
	b, ok := BuildingInfos["Build_CentralStorage_C"]
	if !ok {
		t.Fatal("Build_CentralStorage_C missing")
	}
	if b.DisplayName != "Dimensional Depot Uploader" {
		t.Errorf("display = %q", b.DisplayName)
	}
	if b.Category != "special" {
		t.Errorf("category = %q, want special", b.Category)
	}
	// The game's own words explain how the Depot works — no rediscovery needed.
	if !strings.Contains(b.Description, "Build Gun") || !strings.Contains(b.Description, "Crafting Stations") {
		t.Errorf("description missing depot mechanics: %q", b.Description)
	}
	if b.Footprint == nil {
		t.Fatal("depot ships a clearance box, want footprint")
	}
	// Min/Max X +/-250 -> 5 m; Y +/-450 -> 9 m.
	if b.Footprint.WidthM != 5 || b.Footprint.DepthM != 9 {
		t.Errorf("footprint = %+v, want 5x9", b.Footprint)
	}
}

func TestBuildingInfoBlueprintDesigners(t *testing.T) {
	want := map[string]string{
		"Build_BlueprintDesigner_C":     "32",
		"Build_BlueprintDesigner_MK2_C": "40",
		"Build_BlueprintDesigner_Mk3_C": "48",
	}
	for cn, dim := range want {
		b, ok := BuildingInfos[cn]
		if !ok {
			t.Fatalf("%s missing", cn)
		}
		if b.Category != "special" {
			t.Errorf("%s category = %q, want special", cn, b.Category)
		}
		// Dimensions are stated verbatim in the game's description; no clearance
		// box ships for the designers, so Footprint is nil and the fact rides
		// in prose (we do NOT regex it back out).
		if b.Footprint != nil {
			t.Errorf("%s ships no clearance, want nil footprint, got %+v", cn, b.Footprint)
		}
		if !strings.Contains(b.Description, "Dimensions:") || !strings.Contains(b.Description, dim) {
			t.Errorf("%s description should state %s m dimensions: %q", cn, dim, b.Description)
		}
	}
}

func TestBuildingInfoManufacturer(t *testing.T) {
	b, ok := BuildingInfos["Build_ManufacturerMk1_C"]
	if !ok {
		t.Fatal("Build_ManufacturerMk1_C missing")
	}
	if b.Category != "production" {
		t.Errorf("category = %q, want production", b.Category)
	}
	if b.Footprint == nil {
		t.Fatal("manufacturer has clearance, want footprint")
	}
	// First clearance box: X +/-900 -> 18 m, Y -300..900 -> 12 m, Z max 1100 -> 11 m.
	if b.Footprint.WidthM != 18 || b.Footprint.DepthM != 12 || b.Footprint.HeightM != 11 {
		t.Errorf("footprint = %+v, want 18x12x11", b.Footprint)
	}
	if s, ok := stat(b, "Power draw"); !ok || s.Value != "55" || s.Unit != "MW" {
		t.Errorf("power draw stat = %+v (ok=%v)", s, ok)
	}
	if _, ok := stat(b, "Overclock power exponent"); !ok {
		t.Error("manufacturer should expose overclock power exponent")
	}
}

func TestBuildingInfoConveyorThroughput(t *testing.T) {
	b, ok := BuildingInfos["Build_ConveyorBeltMk5_C"]
	if !ok {
		t.Fatal("Build_ConveyorBeltMk5_C missing")
	}
	if b.Category != "logistics" {
		t.Errorf("category = %q, want logistics", b.Category)
	}
	// Belts are splines — no clearance box.
	if b.Footprint != nil {
		t.Errorf("belt ships no clearance, want nil footprint, got %+v", b.Footprint)
	}
	// mSpeed 1560 -> 780 items/min.
	if s, ok := stat(b, "Conveyor throughput"); !ok || s.Value != "780" || s.Unit != "/min" {
		t.Errorf("throughput stat = %+v (ok=%v)", s, ok)
	}
}

func TestBuildingInfoCategories(t *testing.T) {
	cases := map[string]string{
		"Build_GeneratorCoal_C":     "power",
		"Build_Foundation_8x4_01_C": "structure",
		"Build_Pipeline_C":          "logistics",
		"Build_MinerMk1_C":          "extraction",
	}
	for cn, want := range cases {
		b, ok := BuildingInfos[cn]
		if !ok {
			t.Fatalf("%s missing", cn)
		}
		if b.Category != want {
			t.Errorf("%s category = %q, want %q", cn, b.Category, want)
		}
	}
}

func TestBuildingInfoDescriptionsNormalized(t *testing.T) {
	for cn, b := range BuildingInfos {
		if strings.Contains(b.Description, "\r") {
			t.Errorf("%s description still has CR: %q", cn, b.Description)
		}
		if b.DisplayName == "" {
			t.Errorf("%s has empty display name", cn)
		}
		if b.Category == "" {
			t.Errorf("%s has empty category", cn)
		}
	}
}

func TestBuildingInfoManufacturerCost(t *testing.T) {
	b := BuildingInfos["Build_ManufacturerMk1_C"]
	want := []ItemAmount{
		{"Desc_Motor_C", 10}, {"Desc_ModularFrame_C", 20},
		{"Desc_Plastic_C", 50}, {"Desc_Cable_C", 50},
	}
	if len(b.BuildCost) != len(want) {
		t.Fatalf("build cost = %v, want %v", b.BuildCost, want)
	}
	for i := range want {
		if b.BuildCost[i] != want[i] {
			t.Errorf("build cost[%d] = %v, want %v", i, b.BuildCost[i], want[i])
		}
	}
	// Recipe_ManufacturerMk1_C is unlocked by Schematic_5-2_C, whose authoritative
	// mTechTier is 6 (the class-number/tier desync).
	if b.UnlockSchematic != "Industrial Manufacturing" || b.UnlockTier != 6 {
		t.Errorf("unlock = %q tier %d, want Industrial Manufacturing tier 6", b.UnlockSchematic, b.UnlockTier)
	}
}

func TestBuildingInfoUnlockTier0(t *testing.T) {
	b := BuildingInfos["Build_ConstructorMk1_C"]
	if b.UnlockSchematic != "HUB Upgrade 3" || b.UnlockTier != 0 {
		t.Errorf("constructor unlock = %q tier %d, want HUB Upgrade 3 tier 0", b.UnlockSchematic, b.UnlockTier)
	}
	if len(b.BuildCost) == 0 {
		t.Error("constructor should have a resolved build cost")
	}
}

func TestBuildingInfoUnresolved(t *testing.T) {
	// A shape variant with no individual build recipe: cost and unlock unresolved.
	b, ok := BuildingInfos["Build_PowerPoleWall_Mk2_C"]
	if !ok {
		t.Fatal("Build_PowerPoleWall_Mk2_C missing")
	}
	if b.BuildCost != nil {
		t.Errorf("expected nil build cost (no recipe), got %v", b.BuildCost)
	}
	if b.UnlockTier != -1 || b.UnlockSchematic != "" {
		t.Errorf("expected no unlock (tier -1, empty), got tier %d %q", b.UnlockTier, b.UnlockSchematic)
	}
}

func TestBuildingInfoCostCoverage(t *testing.T) {
	n := 0
	for _, b := range BuildingInfos {
		if len(b.BuildCost) > 0 {
			n++
		}
	}
	// 529 resolve via the Recipe_<stem> / descriptor join; the rest are shape
	// variants with no individual recipe. Comfortably above the epic's 400 floor.
	if n < 500 {
		t.Errorf("buildings with resolved cost = %d, want >= 500", n)
	}
}

func TestBuildingInfoCount(t *testing.T) {
	// Every Build_* class with a display name. Pinned to the generating Docs
	// build; update on regeneration.
	if len(BuildingInfos) != 546 {
		t.Errorf("building infos = %d, want 546", len(BuildingInfos))
	}
}
