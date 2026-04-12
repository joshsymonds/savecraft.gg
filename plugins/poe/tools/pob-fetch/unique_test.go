package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseUniqueBlockSimple(t *testing.T) {
	block := `The Untouched Soul
Gold Amulet
League: Affliction
Requires Level 48
Implicits: 1
(12-20)% increased Rarity of Items found
{tags:life}+40 to maximum Life for each Empty Red Socket on any Equipped Item
{tags:attack}+225 to Accuracy Rating for each Empty Green Socket on any Equipped Item
{tags:mana}+40 to maximum Mana for each Empty Blue Socket on any Equipped Item
{tags:jewellery_resistance}+18% to all Elemental Resistances for each Empty White Socket on any Equipped Item`

	items := parseUniqueBlock(block)
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	item := items[0]

	if item.Name != "The Untouched Soul" {
		t.Errorf("name: got %q", item.Name)
	}
	if item.BaseType != "Gold Amulet" {
		t.Errorf("base_type: got %q", item.BaseType)
	}
	if item.LevelReq != 48 {
		t.Errorf("level_req: got %d", item.LevelReq)
	}
	if len(item.ImplicitMods) != 1 {
		t.Fatalf("expected 1 implicit, got %d", len(item.ImplicitMods))
	}
	if item.ImplicitMods[0] != "(12-20)% increased Rarity of Items found" {
		t.Errorf("implicit[0]: got %q", item.ImplicitMods[0])
	}
	if len(item.ExplicitMods) != 4 {
		t.Fatalf("expected 4 explicits, got %d", len(item.ExplicitMods))
	}
	// Tags must be stripped
	if item.ExplicitMods[0] != "+40 to maximum Life for each Empty Red Socket on any Equipped Item" {
		t.Errorf("explicit[0]: got %q", item.ExplicitMods[0])
	}
}

func TestParseUniqueBlockNoImplicits(t *testing.T) {
	block := `Kaom's Heart
Glorious Plate
Variant: Pre 3.25.0
Variant: Current
Implicits: 0
Has no Sockets
{variant:1}(20-40)% increased Fire Damage
{variant:1}+500 to maximum Life
{variant:2}+1000 to maximum Life`

	items := parseUniqueBlock(block)
	if len(items) != 1 {
		t.Fatalf("expected 1 item (Current variant), got %d", len(items))
	}
	item := items[0]

	if item.Name != "Kaom's Heart" {
		t.Errorf("name: got %q", item.Name)
	}
	if len(item.ImplicitMods) != 0 {
		t.Errorf("expected 0 implicits, got %d", len(item.ImplicitMods))
	}
	// Only Current (variant 2) mods + untagged mods
	if len(item.ExplicitMods) != 2 {
		t.Fatalf("expected 2 explicits for Current variant, got %d: %v", len(item.ExplicitMods), item.ExplicitMods)
	}
	if item.ExplicitMods[0] != "Has no Sockets" {
		t.Errorf("explicit[0]: got %q", item.ExplicitMods[0])
	}
	if item.ExplicitMods[1] != "+1000 to maximum Life" {
		t.Errorf("explicit[1]: got %q", item.ExplicitMods[1])
	}
}

func TestParseUniqueBlockMultiVariant(t *testing.T) {
	block := `Atziri's Splendour
Sacrificial Garb
Variant: Pre 3.0.0 (Armour)
Variant: Current (Armour)
Variant: Current (Energy Shield)
Implicits: 1
+1 to Level of all Vaal Skill Gems
{variant:1,2}(380-420)% increased Armour
{variant:3}(270-300)% increased Energy Shield
+(20-24)% to all Elemental Resistances`

	items := parseUniqueBlock(block)
	if len(items) != 2 {
		t.Fatalf("expected 2 items (one per Current variant), got %d", len(items))
	}

	// First current variant: Armour
	armour := items[0]
	if armour.Variant != "Armour" {
		t.Errorf("variant[0]: got %q", armour.Variant)
	}
	if len(armour.ExplicitMods) != 2 {
		t.Fatalf("armour explicits: expected 2, got %d: %v", len(armour.ExplicitMods), armour.ExplicitMods)
	}

	// Second current variant: Energy Shield
	es := items[1]
	if es.Variant != "Energy Shield" {
		t.Errorf("variant[1]: got %q", es.Variant)
	}
	if len(es.ExplicitMods) != 2 {
		t.Fatalf("es explicits: expected 2, got %d: %v", len(es.ExplicitMods), es.ExplicitMods)
	}
}

func TestParseUniqueBlockNoVariantHeader(t *testing.T) {
	block := `Tabula Rasa
Simple Robe
Sockets: W-W-W-W-W-W`

	items := parseUniqueBlock(block)
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].Name != "Tabula Rasa" {
		t.Errorf("name: got %q", items[0].Name)
	}
	// No Implicits header means 0 implicits, no explicits either
	if len(items[0].ImplicitMods) != 0 {
		t.Errorf("expected 0 implicits, got %d", len(items[0].ImplicitMods))
	}
}

func TestParseUniqueBlockLevelReqVariant(t *testing.T) {
	block := `Bloodsoaked Medallion
Amber Amulet
LevelReq: 49
Implicits: 1
{tags:jewellery_attribute}+(20-30) to Strength
{tags:critical}(40-50)% increased Global Critical Strike Chance
{tags:life}+(50-70) to maximum Life`

	items := parseUniqueBlock(block)
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].LevelReq != 49 {
		t.Errorf("level_req: got %d", items[0].LevelReq)
	}
	if len(items[0].ExplicitMods) != 2 {
		t.Errorf("expected 2 explicits, got %d", len(items[0].ExplicitMods))
	}
}

func TestParseUniquesFile(t *testing.T) {
	content := `return {
[[
Item One
Base One
Implicits: 0
+10 to Strength
]],[[
Item Two
Base Two
Implicits: 1
Some implicit
Some explicit
]],
}`
	items, err := parseUniquesFile(content)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
	if items[0].Name != "Item One" {
		t.Errorf("item[0].Name: got %q", items[0].Name)
	}
	if items[1].Name != "Item Two" {
		t.Errorf("item[1].Name: got %q", items[1].Name)
	}
}

func TestParseRealUniques(t *testing.T) {
	pobDir := os.Getenv("POB_DIR")
	if pobDir == "" {
		pobDir = filepath.Join("..", "..", "..", "..", ".reference", "pob")
	}
	path := filepath.Join(pobDir, "src", "Data", "Uniques", "amulet.lua")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("PoB data not available: %v", err)
	}

	items, err := parseUniquesFile(string(data))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	if len(items) < 50 {
		t.Fatalf("expected at least 50 amulets, got %d", len(items))
	}

	// Find The Untouched Soul specifically
	var soul *UniqueItem
	for i := range items {
		if items[i].Name == "The Untouched Soul" {
			soul = &items[i]
			break
		}
	}
	if soul == nil {
		t.Fatal("The Untouched Soul not found")
	}
	if soul.BaseType != "Gold Amulet" {
		t.Errorf("base_type: got %q", soul.BaseType)
	}
	if soul.LevelReq != 48 {
		t.Errorf("level_req: got %d", soul.LevelReq)
	}
	if len(soul.ImplicitMods) != 1 {
		t.Errorf("expected 1 implicit, got %d", len(soul.ImplicitMods))
	}
	if len(soul.ExplicitMods) != 4 {
		t.Errorf("expected 4 explicits, got %d: %v", len(soul.ExplicitMods), soul.ExplicitMods)
	}
	// Verify tags are stripped
	for _, mod := range soul.ExplicitMods {
		if mod[0] == '{' {
			t.Errorf("tag not stripped: %q", mod)
		}
	}
}
