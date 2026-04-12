package main

import (
	"os"
	"path/filepath"
	"testing"
)

const testGemsLua = `
return {
	["Metadata/Items/Gems/SkillGemFlameblast"] = {
		name = "Flameblast",
		baseTypeName = "Flameblast",
		gameId = "Metadata/Items/Gems/SkillGemFlameblast",
		variantId = "Flameblast",
		grantedEffectId = "Flameblast",
		tags = {
			intelligence = true,
			grants_active_skill = true,
			spell = true,
			area = true,
			fire = true,
			channelling = true,
		},
		tagString = "Spell, AoE, Fire, Channelling",
		reqStr = 0,
		reqDex = 0,
		reqInt = 100,
		naturalMaxLevel = 20,
	},
	["Metadata/Items/Gems/SkillGemFlameblastAltX"] = {
		name = "Flameblast of Celerity",
		baseTypeName = "Flameblast of Celerity",
		variantId = "FlameblastAltX",
		grantedEffectId = "FlameblastAltX",
		tags = {
			intelligence = true,
		},
		tagString = "Spell, AoE, Fire, Channelling",
		reqStr = 0,
		reqDex = 0,
		reqInt = 100,
		naturalMaxLevel = 20,
	},
	["Metadata/Items/Gems/SupportGemMultistrike"] = {
		name = "Multistrike Support",
		baseTypeName = "Multistrike Support",
		variantId = "SupportMultistrike",
		grantedEffectId = "SupportMultistrike",
		tags = {
			strength = true,
			support = true,
		},
		tagString = "Attack, Melee, Support",
		reqStr = 100,
		reqDex = 0,
		reqInt = 0,
		naturalMaxLevel = 20,
	},
}
`

func TestParseGemsLua(t *testing.T) {
	gems, err := parseGemsLua(testGemsLua)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(gems) != 3 {
		t.Fatalf("expected 3 gems, got %d", len(gems))
	}

	// Find by variantId
	fb, ok := gems["Flameblast"]
	if !ok {
		t.Fatal("Flameblast not found")
	}
	if fb.Name != "Flameblast" {
		t.Errorf("name: got %q", fb.Name)
	}
	if fb.TagString != "Spell, AoE, Fire, Channelling" {
		t.Errorf("tagString: got %q", fb.TagString)
	}
	if fb.ReqInt != 100 {
		t.Errorf("reqInt: got %d", fb.ReqInt)
	}
	if fb.IsSupport {
		t.Error("Flameblast should not be a support gem")
	}

	// Transfigured variant
	alt, ok := gems["FlameblastAltX"]
	if !ok {
		t.Fatal("FlameblastAltX not found")
	}
	if alt.Name != "Flameblast of Celerity" {
		t.Errorf("name: got %q", alt.Name)
	}

	// Support gem
	ms, ok := gems["SupportMultistrike"]
	if !ok {
		t.Fatal("SupportMultistrike not found")
	}
	if ms.Name != "Multistrike Support" {
		t.Errorf("name: got %q", ms.Name)
	}
	if !ms.IsSupport {
		t.Error("Multistrike should be a support gem")
	}
}

const testSkillsLua = `
local skills, mod, flag, skill = ...

skills["Flameblast"] = {
	name = "Flameblast",
	description = "Channels to build up a large explosion.",
	color = 3,
	castTime = 0.2,
	constantStats = {
		{ "charged_blast_spell_damage_+%_final_per_stack", 165 },
		{ "base_chance_to_ignite_%", 50 },
		{ "flameblast_maximum_stages", 10 },
	},
	stats = {
		"spell_minimum_base_fire_damage",
		"spell_maximum_base_fire_damage",
	},
	qualityStats = {
		Default = {
			{ "flameblast_maximum_stages", 0.05 },
		},
	},
	levels = {
		[1] = { 0.8, 1.2, critChance = 5, levelRequirement = 28, cost = { Mana = 4, }, },
		[20] = { 0.8, 1.2, critChance = 5, levelRequirement = 70, cost = { Mana = 7, }, },
	},
}
skills["FlameblastAltX"] = {
	name = "Flameblast of Celerity",
	description = "Channels to build up an explosion, released automatically at max stages.",
	color = 3,
	castTime = 0.3,
	constantStats = {
		{ "base_chance_to_ignite_%", 35 },
	},
	stats = {
		"spell_minimum_base_fire_damage",
	},
	levels = {
		[1] = { 0.9, critChance = 5, levelRequirement = 28, cost = { Mana = 5, }, },
		[20] = { 0.9, critChance = 5, levelRequirement = 70, cost = { Mana = 8, }, },
	},
}
skills["SupportMultistrike"] = {
	name = "Multistrike",
	description = "Supports melee attack skills, making them repeat twice.",
	color = 1,
	support = true,
	constantStats = {
		{ "melee_skill_repeat_count", 2 },
	},
	levels = {
		[1] = { levelRequirement = 38, cost = { }, },
		[20] = { levelRequirement = 70, cost = { }, },
	},
}
`

func TestParseSkillsLua(t *testing.T) {
	skills, err := parseSkillsLua(testSkillsLua)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(skills) != 3 {
		t.Fatalf("expected 3 skills, got %d", len(skills))
	}

	fb, ok := skills["Flameblast"]
	if !ok {
		t.Fatal("Flameblast not found")
	}
	if fb.Description != "Channels to build up a large explosion." {
		t.Errorf("description: got %q", fb.Description)
	}
	if fb.CastTime != 0.2 {
		t.Errorf("castTime: got %f", fb.CastTime)
	}
	if fb.Color != 3 {
		t.Errorf("color: got %d", fb.Color)
	}
	if len(fb.ConstantStats) != 3 {
		t.Fatalf("expected 3 constantStats, got %d", len(fb.ConstantStats))
	}
	if fb.ConstantStats[0].ID != "charged_blast_spell_damage_+%_final_per_stack" || fb.ConstantStats[0].Value != 165 {
		t.Errorf("constantStats[0]: got %+v", fb.ConstantStats[0])
	}
	if fb.ManaCost != 7 {
		t.Errorf("manaCost (from level 20): got %d", fb.ManaCost)
	}

	// Transfigured
	alt, ok := skills["FlameblastAltX"]
	if !ok {
		t.Fatal("FlameblastAltX not found")
	}
	if alt.CastTime != 0.3 {
		t.Errorf("castTime: got %f", alt.CastTime)
	}

	// Support
	ms, ok := skills["SupportMultistrike"]
	if !ok {
		t.Fatal("SupportMultistrike not found")
	}
	if !ms.IsSupport {
		t.Error("expected support=true")
	}
}

func TestJoinGemsAndSkills(t *testing.T) {
	gems, _ := parseGemsLua(testGemsLua)
	skills, _ := parseSkillsLua(testSkillsLua)

	joined := joinGemsAndSkills(gems, skills)
	if len(joined) < 3 {
		t.Fatalf("expected at least 3 joined gems, got %d", len(joined))
	}

	// Find Flameblast
	var fb *GemData
	var alt *GemData
	for i := range joined {
		if joined[i].Name == "Flameblast" {
			fb = &joined[i]
		}
		if joined[i].Name == "Flameblast of Celerity" {
			alt = &joined[i]
		}
	}
	if fb == nil {
		t.Fatal("Flameblast not found in joined data")
	}
	if fb.Description != "Channels to build up a large explosion." {
		t.Errorf("description: got %q", fb.Description)
	}
	if fb.CastTime != 0.2 {
		t.Errorf("castTime: got %f", fb.CastTime)
	}
	if fb.TagString != "Spell, AoE, Fire, Channelling" {
		t.Errorf("tagString: got %q", fb.TagString)
	}
	if fb.Color != "B" {
		t.Errorf("color: got %q", fb.Color)
	}
	if alt == nil {
		t.Fatal("Flameblast of Celerity not found (transfigured gem)")
	}
}

func TestParseRealGems(t *testing.T) {
	pobDir := os.Getenv("POB_DIR")
	if pobDir == "" {
		pobDir = filepath.Join("..", "..", "..", "..", ".reference", "pob")
	}

	gemsPath := filepath.Join(pobDir, "src", "Data", "Gems.lua")
	gemsData, err := os.ReadFile(gemsPath)
	if err != nil {
		t.Skipf("PoB data not available: %v", err)
	}

	gems, err := parseGemsLua(string(gemsData))
	if err != nil {
		t.Fatalf("parseGemsLua: %v", err)
	}
	if len(gems) < 500 {
		t.Fatalf("expected at least 500 gems, got %d", len(gems))
	}

	// Check transfigured gem exists
	if _, ok := gems["FlameblastAltX"]; !ok {
		t.Error("FlameblastAltX (Flameblast of Celerity) not found")
	}

	// Parse skills from all files
	skillFiles := []string{
		"act_str.lua", "act_dex.lua", "act_int.lua",
		"sup_str.lua", "sup_dex.lua", "sup_int.lua",
	}
	allSkills := make(map[string]SkillData)
	for _, f := range skillFiles {
		data, err := os.ReadFile(filepath.Join(pobDir, "src", "Data", "Skills", f))
		if err != nil {
			t.Fatalf("reading %s: %v", f, err)
		}
		skills, err := parseSkillsLua(string(data))
		if err != nil {
			t.Fatalf("parsing %s: %v", f, err)
		}
		for k, v := range skills {
			allSkills[k] = v
		}
	}

	if len(allSkills) < 300 {
		t.Fatalf("expected at least 300 skills, got %d", len(allSkills))
	}

	joined := joinGemsAndSkills(gems, allSkills)
	if len(joined) < 500 {
		t.Fatalf("expected at least 500 joined gems, got %d", len(joined))
	}

	// Verify Flameblast of Celerity made it through
	found := false
	for _, g := range joined {
		if g.Name == "Flameblast of Celerity" {
			found = true
			if g.Description == "" {
				t.Error("Flameblast of Celerity has no description")
			}
			if g.CastTime == 0 {
				t.Error("Flameblast of Celerity has no castTime")
			}
			break
		}
	}
	if !found {
		t.Error("Flameblast of Celerity not found in joined data")
	}
}
