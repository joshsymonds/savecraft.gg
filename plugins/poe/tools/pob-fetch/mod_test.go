package main

import (
	"os"
	"path/filepath"
	"testing"
)

const testModLua = `
return {
	["Strength1"] = { type = "Suffix", affix = "of the Brute", "+(8-12) to Strength", statOrder = { 1182 }, level = 1, group = "Strength", weightKey = { "ring", "amulet", "belt", "default", }, weightVal = { 1000, 1000, 1000, 0 }, modTags = { "attribute" }, },
	["Strength2"] = { type = "Suffix", affix = "of the Wrestler", "+(13-17) to Strength", statOrder = { 1182 }, level = 11, group = "Strength", weightKey = { "ring", "amulet", "default", }, weightVal = { 1000, 1000, 0 }, modTags = { "attribute" }, },
	["IncreasedLife1"] = { type = "Prefix", affix = "Hale", "+(10-19) to maximum Life", statOrder = { 870 }, level = 1, group = "IncreasedLife", weightKey = { "ring", "amulet", "belt", "helmet", "body_armour", "default", }, weightVal = { 1000, 1000, 1000, 1000, 1000, 0 }, modTags = { "resource", "life" }, },
	["HybridDefences1"] = { type = "Prefix", affix = "Sturdy", "+(8-10) to Armour", "+(8-10) to Evasion Rating", statOrder = { 850, 855 }, level = 1, group = "HybridDefences", weightKey = { "str_dex_armour", "default", }, weightVal = { 1000, 0 }, modTags = { "defences" }, },
	["WeaponFireAddedAsChaos1h3_"] = { type = "Prefix", affix = "Corrosive", "Gain (11-13)% of Fire Damage as Extra Chaos Damage", statOrder = { 3000 }, level = 80, group = "FireAddedAsChaos", weightKey = { "default", }, weightVal = { 0 }, modTags = { "chaos_damage", "damage" }, },
	["WeaponFireAddedAsChaos2h3_"] = { type = "Prefix", affix = "Corrosive", "Gain (21-26)% of Fire Damage as Extra Chaos Damage", statOrder = { 3000 }, level = 80, group = "FireAddedAsChaos", weightKey = { "default", }, weightVal = { 0 }, modTags = { "chaos_damage", "damage" }, },
	["WeaponClassified1h1"] = { type = "Prefix", affix = "Heavy", "+(10-20) to Physical Damage", statOrder = { 2000 }, level = 30, group = "LocalPhysical", weightKey = { "sword", "default", }, weightVal = { 1000, 0 }, modTags = { "damage" }, },
}
`

func TestParseModsLua(t *testing.T) {
	mods, err := parseModsLua(testModLua)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(mods) != 7 {
		t.Fatalf("expected 7 mods, got %d", len(mods))
	}

	// Find Strength1
	var str1 *ModTier
	for i := range mods {
		if mods[i].ModID == "Strength1" {
			str1 = &mods[i]
			break
		}
	}
	if str1 == nil {
		t.Fatal("Strength1 not found")
	}
	if str1.ModText != "+(8-12) to Strength" {
		t.Errorf("mod_text: got %q", str1.ModText)
	}
	if str1.ModType != "Suffix" {
		t.Errorf("type: got %q", str1.ModType)
	}
	if str1.Affix != "of the Brute" {
		t.Errorf("affix: got %q", str1.Affix)
	}
	if str1.Level != 1 {
		t.Errorf("level: got %d", str1.Level)
	}
	if str1.Group != "Strength" {
		t.Errorf("group: got %q", str1.Group)
	}

	// Check item classes extracted from weightKey (non-default, non-zero weight)
	if len(str1.ItemClasses) != 3 {
		t.Errorf("expected 3 item classes, got %d: %v", len(str1.ItemClasses), str1.ItemClasses)
	}

	// Check tags
	if len(str1.Tags) != 1 || str1.Tags[0] != "attribute" {
		t.Errorf("tags: got %v", str1.Tags)
	}

	// Prefix type
	var life *ModTier
	for i := range mods {
		if mods[i].ModID == "IncreasedLife1" {
			life = &mods[i]
			break
		}
	}
	if life == nil {
		t.Fatal("IncreasedLife1 not found")
	}
	if life.ModType != "Prefix" {
		t.Errorf("life type: got %q", life.ModType)
	}

	// Multi-text mod
	var hybrid *ModTier
	for i := range mods {
		if mods[i].ModID == "HybridDefences1" {
			hybrid = &mods[i]
			break
		}
	}
	if hybrid == nil {
		t.Fatal("HybridDefences1 not found")
	}
	if hybrid.ModText != "+(8-10) to Armour\n+(8-10) to Evasion Rating" {
		t.Errorf("hybrid mod_text: got %q", hybrid.ModText)
	}

	// Weapon 1h mod with empty weightKey classification synthesizes ["weapon_1h"].
	w1h := findMod(mods, "WeaponFireAddedAsChaos1h3_")
	if w1h == nil {
		t.Fatal("WeaponFireAddedAsChaos1h3_ not found")
	}
	if got, want := w1h.ItemClasses, []string{"weapon_1h"}; !stringSliceEq(got, want) {
		t.Errorf("1h item_classes: got %v, want %v", got, want)
	}

	// Weapon 2h mod with empty weightKey classification synthesizes ["weapon_2h"].
	w2h := findMod(mods, "WeaponFireAddedAsChaos2h3_")
	if w2h == nil {
		t.Fatal("WeaponFireAddedAsChaos2h3_ not found")
	}
	if got, want := w2h.ItemClasses, []string{"weapon_2h"}; !stringSliceEq(got, want) {
		t.Errorf("2h item_classes: got %v, want %v", got, want)
	}

	// Weapon mod with populated weightKey classification is NOT overwritten by synthesis.
	classified := findMod(mods, "WeaponClassified1h1")
	if classified == nil {
		t.Fatal("WeaponClassified1h1 not found")
	}
	if got, want := classified.ItemClasses, []string{"sword"}; !stringSliceEq(got, want) {
		t.Errorf("classified item_classes: got %v, want %v (synthesis must not overwrite source)", got, want)
	}
}

func TestSynthesizeWeaponClasses(t *testing.T) {
	tests := []struct {
		modID string
		want  []string
	}{
		{"WeaponFireAddedAsChaos1h3_", []string{"weapon_1h"}},
		{"WeaponFireAddedAsChaos2h3_", []string{"weapon_2h"}},
		{"WeaponPhysicalDamage1h1", []string{"weapon_1h"}},
		{"WeaponElementalDamage2h5", []string{"weapon_2h"}},
		{"Strength1", nil},
		{"IncreasedLife1", nil},
		{"HybridDefences1", nil},
		{"WeaponNoHandMarker1", nil},
		{"V2LocalAddedColdDamage1hCorrupted1", nil},
	}
	for _, tc := range tests {
		got := synthesizeWeaponClasses(tc.modID)
		if !stringSliceEq(got, tc.want) {
			t.Errorf("synthesizeWeaponClasses(%q): got %v, want %v", tc.modID, got, tc.want)
		}
	}
}

func findMod(mods []ModTier, id string) *ModTier {
	for i := range mods {
		if mods[i].ModID == id {
			return &mods[i]
		}
	}
	return nil
}

func stringSliceEq(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestParseRealMods(t *testing.T) {
	pobDir := os.Getenv("POB_DIR")
	if pobDir == "" {
		pobDir = filepath.Join("..", "..", "..", "..", ".reference", "pob")
	}

	path := filepath.Join(pobDir, "src", "Data", "ModItem.lua")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("PoB data not available: %v", err)
	}

	mods, err := parseModsLua(string(data))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	if len(mods) < 10000 {
		t.Fatalf("expected at least 10000 mods from ModItem.lua, got %d", len(mods))
	}

	// Find a Strength mod
	var found bool
	for _, m := range mods {
		if m.ModID == "Strength1" {
			found = true
			if m.ModText != "+(8-12) to Strength" {
				t.Errorf("Strength1 mod_text: got %q", m.ModText)
			}
			if m.Group != "Strength" {
				t.Errorf("Strength1 group: got %q", m.Group)
			}
			break
		}
	}
	if !found {
		t.Error("Strength1 not found in real data")
	}
}
