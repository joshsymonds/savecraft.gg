package main

import (
	"go/format"
	"strings"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/tools/datagen/sosdata"
)

func parseTech(t *testing.T, nodeSrc, textSrc string) data.Tech {
	t.Helper()
	node, err := sosdata.Parse([]byte(nodeSrc))
	if err != nil {
		t.Fatalf("parse node: %v", err)
	}
	var textNode *sosdata.Value
	if textSrc != "" {
		textNode, err = sosdata.Parse([]byte(textSrc))
		if err != nil {
			t.Fatalf("parse text: %v", err)
		}
	}
	return decodeTech(node, textNode, "SCH00", "Administration")
}

// A tech node with cost, a population requirement, an unlock, and a prereq.
const techNode = `
LEVEL_MAX: 1,
COSTS: {
	CIVIC_ADMIN: 15.00,
},
UNLOCKS_FACTION: [
	ROOM_SCHOOL_NORMAL,
],
REQUIRES: {
	GREATER: {
		POPULATION: 200,
	},
},
REQUIRES_TECH_LEVEL: {
	BASE0: 1,
},
`

const techText = `
NAME: "School",
DESC: "Unlocks the school.",
`

func TestDecodeTech(t *testing.T) {
	tech := parseTech(t, techNode, techText)
	if tech.ID != "SCH00" || tech.Name != "School" || tech.Category != "Administration" {
		t.Errorf("id/name/cat = %q/%q/%q", tech.ID, tech.Name, tech.Category)
	}
	if tech.Description != "Unlocks the school." {
		t.Errorf("Description = %q", tech.Description)
	}
	if tech.Costs["CIVIC_ADMIN"] != 15 {
		t.Errorf("Costs = %v, want CIVIC_ADMIN:15", tech.Costs)
	}
	if tech.RequiresPopulation != 200 {
		t.Errorf("RequiresPopulation = %d, want 200", tech.RequiresPopulation)
	}
	if tech.RequiresTech["BASE0"] != 1 {
		t.Errorf("RequiresTech = %v, want BASE0:1", tech.RequiresTech)
	}
	if len(tech.Unlocks) != 1 || tech.Unlocks[0] != "ROOM_SCHOOL_NORMAL" {
		t.Errorf("Unlocks = %v, want [ROOM_SCHOOL_NORMAL]", tech.Unlocks)
	}
}

func TestDecodeTechMinimalNilText(t *testing.T) {
	tech := parseTech(t, "LEVEL_MAX: 1,\nCOSTS: { CIVIC_ADMIN: 5, },", "")
	if tech.Name != "" || tech.Description != "" {
		t.Errorf("nil text should leave name/desc empty")
	}
	if tech.RequiresPopulation != 0 || len(tech.RequiresTech) != 0 || len(tech.Unlocks) != 0 {
		t.Errorf("minimal tech should have no requirements/unlocks: %+v", tech)
	}
	if tech.Costs["CIVIC_ADMIN"] != 5 {
		t.Errorf("Costs = %v, want CIVIC_ADMIN:5", tech.Costs)
	}
}

func TestGenerateTechSourceCompiles(t *testing.T) {
	techs := []data.Tech{
		parseTech(t, techNode, techText),
		{ID: "UNI00", Name: "University", Category: "Administration"},
	}
	src, err := generateTechSource(techs)
	if err != nil {
		t.Fatalf("generateTechSource: %v", err)
	}
	if _, err := format.Source(src); err != nil {
		t.Fatalf("generated source does not gofmt: %v\n%s", err, src)
	}
	s := string(src)
	for _, want := range []string{"package data", "var Techs", "SCH00", "UNI00"} {
		if !strings.Contains(s, want) {
			t.Errorf("generated source missing %q", want)
		}
	}
}
