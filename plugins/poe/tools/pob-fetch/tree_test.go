package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectNewestTreeVersion(t *testing.T) {
	pobDir := os.Getenv("POB_DIR")
	if pobDir == "" {
		pobDir = filepath.Join("..", "..", "..", "..", ".reference", "pob")
	}

	treeDir := filepath.Join(pobDir, "src", "TreeData")
	if _, err := os.Stat(treeDir); os.IsNotExist(err) {
		t.Skipf("PoB data not available")
	}

	version, err := detectNewestTreeVersion(treeDir)
	if err != nil {
		t.Fatalf("detect error: %v", err)
	}
	// Should be 3_28 or higher
	if version == "" {
		t.Fatal("empty version")
	}
	t.Logf("Detected tree version: %s", version)
}

const testTreeLua = `
return {
    ["nodes"]= {
        [1234]= {
            ["skill"]= 1234,
            ["name"]= "Thick Skin",
            ["isNotable"]= true,
            ["stats"]= {
                "+5% to maximum Life",
                "15% increased maximum Life"
            },
            ["group"]= 10,
            ["orbit"]= 2,
            ["orbitIndex"]= 5,
            ["out"]= { "5678" },
            ["in"]= { "9012" }
        },
        [5678]= {
            ["skill"]= 5678,
            ["name"]= "Chaos Inoculation",
            ["isKeystone"]= true,
            ["stats"]= {
                "Maximum Life becomes 1\nImmune to Chaos Damage"
            },
            ["group"]= 11,
            ["orbit"]= 0,
            ["orbitIndex"]= 0,
            ["out"]= {},
            ["in"]= { "1234" }
        },
        [9012]= {
            ["skill"]= 9012,
            ["name"]= "Life Mastery",
            ["isMastery"]= true,
            ["stats"]= {},
            ["group"]= 12,
            ["orbit"]= 0,
            ["orbitIndex"]= 0,
            ["out"]= {},
            ["in"]= {}
        },
        [3456]= {
            ["skill"]= 3456,
            ["name"]= "Path of the Witch",
            ["ascendancyName"]= "Occultist",
            ["isNotable"]= true,
            ["stats"]= {
                "+20 to Intelligence"
            },
            ["group"]= 13,
            ["orbit"]= 1,
            ["orbitIndex"]= 0,
            ["out"]= {},
            ["in"]= {}
        },
        [7890]= {
            ["skill"]= 7890,
            ["name"]= "+10 to Strength",
            ["stats"]= {
                "+10 to Strength"
            },
            ["group"]= 14,
            ["orbit"]= 1,
            ["orbitIndex"]= 2,
            ["out"]= {},
            ["in"]= {}
        },
    }
}
`

func TestParseTreeLua(t *testing.T) {
	nodes, err := parseTreeLua(testTreeLua)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(nodes) != 5 {
		t.Fatalf("expected 5 nodes, got %d", len(nodes))
	}

	// Find notable
	var notable *PassiveNode
	var keystone *PassiveNode
	var mastery *PassiveNode
	var ascendancy *PassiveNode
	for i := range nodes {
		switch nodes[i].Name {
		case "Thick Skin":
			notable = &nodes[i]
		case "Chaos Inoculation":
			keystone = &nodes[i]
		case "Life Mastery":
			mastery = &nodes[i]
		case "Path of the Witch":
			ascendancy = &nodes[i]
		}
	}

	if notable == nil {
		t.Fatal("notable not found")
	}
	if !notable.IsNotable {
		t.Error("expected IsNotable")
	}
	if len(notable.Stats) != 2 {
		t.Errorf("expected 2 stats, got %d", len(notable.Stats))
	}
	if notable.Group != 10 {
		t.Errorf("group: got %d", notable.Group)
	}

	if keystone == nil {
		t.Fatal("keystone not found")
	}
	if !keystone.IsKeystone {
		t.Error("expected IsKeystone")
	}

	if mastery == nil {
		t.Fatal("mastery not found")
	}
	if !mastery.IsMastery {
		t.Error("expected IsMastery")
	}

	if ascendancy == nil {
		t.Fatal("ascendancy not found")
	}
	if ascendancy.AscendancyName != "Occultist" {
		t.Errorf("ascendancy: got %q", ascendancy.AscendancyName)
	}
}

func TestParseRealTree(t *testing.T) {
	pobDir := os.Getenv("POB_DIR")
	if pobDir == "" {
		pobDir = filepath.Join("..", "..", "..", "..", ".reference", "pob")
	}

	treeDir := filepath.Join(pobDir, "src", "TreeData")
	version, err := detectNewestTreeVersion(treeDir)
	if err != nil {
		t.Skipf("PoB data not available: %v", err)
	}

	path := filepath.Join(treeDir, version, "tree.lua")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading tree: %v", err)
	}

	nodes, err := parseTreeLua(string(data))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	if len(nodes) < 1000 {
		t.Fatalf("expected at least 1000 nodes, got %d", len(nodes))
	}

	// Count types
	var keystones, notables, masteries int
	for _, n := range nodes {
		if n.IsKeystone {
			keystones++
		}
		if n.IsNotable {
			notables++
		}
		if n.IsMastery {
			masteries++
		}
	}
	t.Logf("Parsed %d nodes: %d keystones, %d notables, %d masteries", len(nodes), keystones, notables, masteries)

	if keystones < 40 {
		t.Errorf("expected at least 40 keystones, got %d", keystones)
	}
	if notables < 500 {
		t.Errorf("expected at least 500 notables, got %d", notables)
	}
}
