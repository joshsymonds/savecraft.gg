package main

import (
	"os"
	"path/filepath"
	"testing"
)

const testStatDescLua = `
return {
	[1]={
		[1]={
			[1]={
				limit={
					[1]={
						[1]=1,
						[2]="#"
					}
				},
				text="{0}% more Spell Damage for each stage"
			},
			[2]={
				[1]={
					k="negate",
					v=1
				},
				limit={
					[1]={
						[1]="#",
						[2]=-1
					}
				},
				text="{0}% less Spell Damage for each stage"
			}
		},
		name="charged_blast_damage_per_stack",
		stats={
			[1]="charged_blast_spell_damage_+%_final_per_stack"
		}
	},
	[2]={
		[1]={
			[1]={
				[1]={
					k="reminderstring",
					v="ReminderTextIgnite"
				},
				limit={
					[1]={
						[1]=1,
						[2]="#"
					}
				},
				text="{0}% chance to Ignite enemies"
			}
		},
		name="burn_chance",
		stats={
			[1]="base_chance_to_ignite_%"
		}
	},
	[3]={
		[1]={
			[1]={
				limit={
					[1]={
						[1]=1,
						[2]="#"
					}
				},
				text="Maximum {0} Stages"
			}
		},
		name="flameblast_stages",
		stats={
			[1]="flameblast_maximum_stages"
		}
	},
	[4]={
		[1]={
			[1]={
				limit={
					[1]={
						[1]=100,
						[2]=100
					}
				},
				text="Always Ignite"
			},
			[2]={
				limit={
					[1]={
						[1]=1,
						[2]="#"
					}
				},
				text="{0}% chance to Ignite"
			}
		},
		name="always_or_chance_ignite",
		stats={
			[1]="always_ignite_or_chance"
		}
	},
}
`

func TestParseStatDescriptions(t *testing.T) {
	translator, err := parseStatDescriptions(testStatDescLua)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	// Positive value → "more"
	result := translator.Translate("charged_blast_spell_damage_+%_final_per_stack", 165)
	if result != "165% more Spell Damage for each stage" {
		t.Errorf("charged_blast +165: got %q", result)
	}

	// Negative value → "less" with negate handler
	result = translator.Translate("charged_blast_spell_damage_+%_final_per_stack", -30)
	if result != "30% less Spell Damage for each stage" {
		t.Errorf("charged_blast -30: got %q", result)
	}

	// Simple positive with reminderstring (should be ignored)
	result = translator.Translate("base_chance_to_ignite_%", 50)
	if result != "50% chance to Ignite enemies" {
		t.Errorf("ignite 50: got %q", result)
	}

	// Simple stat
	result = translator.Translate("flameblast_maximum_stages", 10)
	if result != "Maximum 10 Stages" {
		t.Errorf("stages 10: got %q", result)
	}

	// Exact match condition (value=100 → "Always Ignite")
	result = translator.Translate("always_ignite_or_chance", 100)
	if result != "Always Ignite" {
		t.Errorf("always ignite 100: got %q", result)
	}

	// Fallthrough to second variant (value=50 → "50% chance to Ignite")
	result = translator.Translate("always_ignite_or_chance", 50)
	if result != "50% chance to Ignite" {
		t.Errorf("chance ignite 50: got %q", result)
	}

	// Unknown stat
	result = translator.Translate("nonexistent_stat", 42)
	if result != "" {
		t.Errorf("unknown stat: expected empty, got %q", result)
	}
}

func TestTranslateConstants(t *testing.T) {
	translator, _ := parseStatDescriptions(testStatDescLua)

	stats := []SkillStat{
		{ID: "charged_blast_spell_damage_+%_final_per_stack", Value: 165},
		{ID: "base_chance_to_ignite_%", Value: 50},
		{ID: "flameblast_maximum_stages", Value: 10},
	}

	result := translator.TranslateAll(stats)
	if len(result) != 3 {
		t.Fatalf("expected 3 translations, got %d", len(result))
	}
	if result[0] != "165% more Spell Damage for each stage" {
		t.Errorf("[0]: got %q", result[0])
	}
	if result[1] != "50% chance to Ignite enemies" {
		t.Errorf("[1]: got %q", result[1])
	}
	if result[2] != "Maximum 10 Stages" {
		t.Errorf("[2]: got %q", result[2])
	}
}

func TestParseRealStatDescriptions(t *testing.T) {
	pobDir := os.Getenv("POB_DIR")
	if pobDir == "" {
		pobDir = filepath.Join("..", "..", "..", "..", ".reference", "pob")
	}

	descDir := filepath.Join(pobDir, "src", "Data", "StatDescriptions")
	files := []string{"skill_stat_descriptions.lua", "stat_descriptions.lua"}

	translator := &StatDescTranslator{entries: make(map[string]*statDescEntry)}
	for _, f := range files {
		data, err := os.ReadFile(filepath.Join(descDir, f))
		if err != nil {
			t.Skipf("PoB data not available: %v", err)
		}
		partial, err := parseStatDescriptions(string(data))
		if err != nil {
			t.Fatalf("parsing %s: %v", f, err)
		}
		translator.Merge(partial)
	}

	if len(translator.entries) < 1000 {
		t.Fatalf("expected at least 1000 stat entries, got %d", len(translator.entries))
	}

	// Test real Flameblast stats
	result := translator.Translate("charged_blast_spell_damage_+%_final_per_stack", 165)
	if result == "" {
		t.Error("charged_blast translation is empty")
	}
	if result != "165% more Spell Damage for each stage" {
		t.Errorf("charged_blast: got %q", result)
	}

	result = translator.Translate("base_chance_to_ignite_%", 50)
	if result == "" {
		t.Error("ignite translation is empty")
	}
}
