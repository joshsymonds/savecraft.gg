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
	requireSkillTypes = { SkillType.Attack, SkillType.Melee, },
	excludeSkillTypes = { },
	constantStats = {
		{ "melee_skill_repeat_count", 2 },
	},
	stats = {
		"support_multistrike_damage_+%_final",
	},
	levels = {
		[1] = { -30, levelRequirement = 38, manaMultiplier = 160, cost = { }, statInterpolation = { 1, }, },
		[20] = { -26, levelRequirement = 70, manaMultiplier = 160, cost = { }, statInterpolation = { 1, }, },
	},
}
skills["SupportLifetap"] = {
	name = "Lifetap",
	description = "Supports any non-blessing skill. Minions cannot gain the Lifetap buff.",
	color = 1,
	support = true,
	requireSkillTypes = { },
	excludeSkillTypes = { SkillType.Blessing, },
	constantStats = {
		{ "support_base_lifetap_buff_duration", 4000 },
	},
	stats = {
		"support_lifetap_damage_+%_final_while_buffed",
		"support_lifetap_spent_life_threshold",
		"base_skill_cost_life_instead_of_mana",
		"quality_display_lifetap_is_gem",
	},
	notMinionStat = {
		"support_lifetap_damage_+%_final_while_buffed",
		"support_lifetap_spent_life_threshold",
	},
	levels = {
		[1] = { 10, 23, levelRequirement = 8, manaMultiplier = 200, statInterpolation = { 1, 1, }, },
		[20] = { 19, 273, levelRequirement = 70, manaMultiplier = 200, statInterpolation = { 1, 1, }, },
	},
}
skills["SupportInfusedChannelling"] = {
	name = "Infused Channelling",
	description = "Supports any channelling skill. Cannot modify the skills of minions.",
	color = 3,
	support = true,
	requireSkillTypes = { SkillType.Channel, },
	ignoreMinionTypes = true,
	constantStats = {
		{ "support_storm_barrier_damage_taken_when_hit_+%_final_while_channelling", -12 },
	},
	stats = {
		"support_storm_barrier_damage_+%_final",
	},
	levels = {
		[1] = { 15, levelRequirement = 4, manaMultiplier = 120, statInterpolation = { 1, }, },
		[20] = { 39, levelRequirement = 70, manaMultiplier = 120, statInterpolation = { 1, }, },
	},
}
`

func TestParseSkillsLua(t *testing.T) {
	skills, err := parseSkillsLua(testSkillsLua)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(skills) != 5 {
		t.Fatalf("expected 5 skills, got %d", len(skills))
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
	// Flameblast level stats: stats has 2 entries, levels[20] has 2 positional values
	if len(fb.LevelStats) != 2 {
		t.Fatalf("expected 2 level stats for Flameblast, got %d", len(fb.LevelStats))
	}

	// Transfigured
	alt, ok := skills["FlameblastAltX"]
	if !ok {
		t.Fatal("FlameblastAltX not found")
	}
	if alt.CastTime != 0.3 {
		t.Errorf("castTime: got %f", alt.CastTime)
	}

	// Support — Multistrike
	ms, ok := skills["SupportMultistrike"]
	if !ok {
		t.Fatal("SupportMultistrike not found")
	}
	if !ms.IsSupport {
		t.Error("expected support=true")
	}
	if ms.ManaMultiplier != 160 {
		t.Errorf("manaMultiplier: expected 160, got %d", ms.ManaMultiplier)
	}
	if len(ms.RequireSkillTypes) != 2 {
		t.Fatalf("expected 2 requireSkillTypes, got %d", len(ms.RequireSkillTypes))
	}
	if ms.RequireSkillTypes[0] != "Attack" || ms.RequireSkillTypes[1] != "Melee" {
		t.Errorf("requireSkillTypes: got %v", ms.RequireSkillTypes)
	}
	if len(ms.LevelStats) != 1 {
		t.Fatalf("expected 1 level stat for Multistrike, got %d", len(ms.LevelStats))
	}
	if ms.LevelStats[0].ID != "support_multistrike_damage_+%_final" || ms.LevelStats[0].Value != -26 {
		t.Errorf("Multistrike LevelStats[0]: got %+v", ms.LevelStats[0])
	}

	// Support — Lifetap
	lt, ok := skills["SupportLifetap"]
	if !ok {
		t.Fatal("SupportLifetap not found")
	}
	if lt.ManaMultiplier != 200 {
		t.Errorf("Lifetap manaMultiplier: expected 200, got %d", lt.ManaMultiplier)
	}
	if lt.IgnoreMinionTypes {
		t.Error("Lifetap should not have ignoreMinionTypes")
	}
	if len(lt.NotMinionStat) != 2 {
		t.Fatalf("expected 2 notMinionStat entries, got %d", len(lt.NotMinionStat))
	}
	if lt.NotMinionStat[0] != "support_lifetap_damage_+%_final_while_buffed" {
		t.Errorf("notMinionStat[0]: got %q", lt.NotMinionStat[0])
	}
	if len(lt.ExcludeSkillTypes) != 1 || lt.ExcludeSkillTypes[0] != "Blessing" {
		t.Errorf("Lifetap excludeSkillTypes: got %v", lt.ExcludeSkillTypes)
	}
	// Level stats: 4 stat IDs but only 2 have interpolation values at level 20
	if len(lt.LevelStats) != 2 {
		t.Fatalf("expected 2 level stats for Lifetap, got %d", len(lt.LevelStats))
	}
	if lt.LevelStats[0].ID != "support_lifetap_damage_+%_final_while_buffed" || lt.LevelStats[0].Value != 19 {
		t.Errorf("Lifetap LevelStats[0]: got %+v", lt.LevelStats[0])
	}
	if lt.LevelStats[1].ID != "support_lifetap_spent_life_threshold" || lt.LevelStats[1].Value != 273 {
		t.Errorf("Lifetap LevelStats[1]: got %+v", lt.LevelStats[1])
	}

	// Support — Infused Channelling
	ic, ok := skills["SupportInfusedChannelling"]
	if !ok {
		t.Fatal("SupportInfusedChannelling not found")
	}
	if !ic.IgnoreMinionTypes {
		t.Error("Infused Channelling should have ignoreMinionTypes=true")
	}
	if ic.ManaMultiplier != 120 {
		t.Errorf("Infused Channelling manaMultiplier: expected 120, got %d", ic.ManaMultiplier)
	}
	if len(ic.RequireSkillTypes) != 1 || ic.RequireSkillTypes[0] != "Channel" {
		t.Errorf("Infused Channelling requireSkillTypes: got %v", ic.RequireSkillTypes)
	}
	if len(ic.LevelStats) != 1 {
		t.Fatalf("expected 1 level stat for Infused Channelling, got %d", len(ic.LevelStats))
	}
	if ic.LevelStats[0].Value != 39 {
		t.Errorf("Infused Channelling LevelStats[0] value: expected 39, got %d", ic.LevelStats[0].Value)
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

	// Verify support gem fields on real PoB data
	lt, ok := allSkills["SupportLifetap"]
	if !ok {
		t.Fatal("SupportLifetap not found in real PoB data")
	}
	if lt.ManaMultiplier != 200 {
		t.Errorf("Lifetap manaMultiplier: expected 200, got %d", lt.ManaMultiplier)
	}
	if len(lt.NotMinionStat) < 1 {
		t.Error("Lifetap should have notMinionStat entries")
	}
	if len(lt.LevelStats) < 2 {
		t.Errorf("Lifetap should have at least 2 level stats, got %d", len(lt.LevelStats))
	}
	if lt.ExcludeSkillTypes == nil || len(lt.ExcludeSkillTypes) == 0 {
		t.Error("Lifetap should have excludeSkillTypes (Blessing)")
	}

	ic, ok := allSkills["SupportInfusedChannelling"]
	if !ok {
		t.Fatal("SupportInfusedChannelling not found in real PoB data")
	}
	if !ic.IgnoreMinionTypes {
		t.Error("Infused Channelling should have ignoreMinionTypes=true")
	}
	if len(ic.RequireSkillTypes) < 1 {
		t.Error("Infused Channelling should have requireSkillTypes (Channel)")
	}
}
