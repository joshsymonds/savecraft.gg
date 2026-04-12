package main

import (
	"os"
	"path/filepath"
	"testing"
)

const testBaseLua = `
local itemBases = ...

itemBases["Plate Vest"] = {
	type = "Body Armour",
	subType = "Armour",
	socketLimit = 6,
	tags = { armour = true, body_armour = true, default = true, str_armour = true, },
	armour = { ArmourBaseMin = 19, ArmourBaseMax = 27, MovementPenalty = 3, },
	req = { str = 12, },
}
itemBases["Copper Plate"] = {
	type = "Body Armour",
	subType = "Armour",
	socketLimit = 6,
	tags = { armour = true, body_armour = true, default = true, str_armour = true, },
	armour = { ArmourBaseMin = 176, ArmourBaseMax = 221, MovementPenalty = 5, },
	req = { level = 17, str = 53, },
}
itemBases["Gold Amulet"] = {
	type = "Amulet",
	tags = { amulet = true, default = true, },
	implicit = "Rarity",
	req = { },
}
`

func TestParseBasesLua(t *testing.T) {
	bases, err := parseBasesLua(testBaseLua)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(bases) != 3 {
		t.Fatalf("expected 3 base items, got %d", len(bases))
	}

	// Find by name
	var plate *BaseItem
	var amulet *BaseItem
	for i := range bases {
		if bases[i].Name == "Copper Plate" {
			plate = &bases[i]
		}
		if bases[i].Name == "Gold Amulet" {
			amulet = &bases[i]
		}
	}

	if plate == nil {
		t.Fatal("Copper Plate not found")
	}
	if plate.ItemClass != "Body Armour" {
		t.Errorf("item_class: got %q", plate.ItemClass)
	}
	if plate.LevelReq != 17 {
		t.Errorf("level_req: got %d", plate.LevelReq)
	}

	if amulet == nil {
		t.Fatal("Gold Amulet not found")
	}
	if amulet.ItemClass != "Amulet" {
		t.Errorf("item_class: got %q", amulet.ItemClass)
	}
}

func TestParseRealBases(t *testing.T) {
	pobDir := os.Getenv("POB_DIR")
	if pobDir == "" {
		pobDir = filepath.Join("..", "..", "..", "..", ".reference", "pob")
	}

	path := filepath.Join(pobDir, "src", "Data", "Bases", "body.lua")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("PoB data not available: %v", err)
	}

	bases, err := parseBasesLua(string(data))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	if len(bases) < 30 {
		t.Fatalf("expected at least 30 body armours, got %d", len(bases))
	}

	// Check that Glorious Plate exists (Kaom's Heart base type)
	var found bool
	for _, b := range bases {
		if b.Name == "Glorious Plate" {
			found = true
			if b.ItemClass != "Body Armour" {
				t.Errorf("Glorious Plate type: got %q", b.ItemClass)
			}
			break
		}
	}
	if !found {
		t.Error("Glorious Plate not found")
	}
}
