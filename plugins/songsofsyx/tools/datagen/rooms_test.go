package main

import (
	"go/format"
	"strings"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/tools/datagen/sosdata"
)

func parseRoom(t *testing.T, initSrc, textSrc string) data.Room {
	t.Helper()
	initVal, err := sosdata.Parse([]byte(initSrc))
	if err != nil {
		t.Fatalf("parse init: %v", err)
	}
	var textVal *sosdata.Value
	if textSrc != "" {
		textVal, err = sosdata.Parse([]byte(textSrc))
		if err != nil {
			t.Fatalf("parse text: %v", err)
		}
	}
	return decodeRoom(initVal, textVal, "TEST_ROOM")
}

// A workshop: top-level INDUSTRY, IN as a scalar rate, OUT as an object .PLAYER,
// build cost zips RESOURCES with ITEMS[0].COSTS (dropping zero-cost entries).
const workshopInit = `
RESOURCES: [WOOD,STONE,METAL,],
ITEMS: [
	{
		COSTS: [2,0,3,],
	},
],
INDUSTRY: {
	IN: {
		ORE: 1.25,
	},
	OUT: {
		METAL: {
			PLAYER: 0.5,
			AI_RATE: 0.4,
		},
	},
},
WORK: {
	USES_TOOL: true,
},
`

const workshopText = `
INFO: {
	NAME: "Metal Smelter",
	NAMES: "Metal Smelters",
	DESC: "Turns Ore into Metal.",
	WIKI: {
		CATEGORY: "Refiner",
	},
},
`

func TestDecodeRoomWorkshop(t *testing.T) {
	r := parseRoom(t, workshopInit, workshopText)
	if r.ID != "TEST_ROOM" {
		t.Errorf("ID = %q", r.ID)
	}
	if r.Name != "Metal Smelter" || r.Description != "Turns Ore into Metal." {
		t.Errorf("name/desc = %q / %q", r.Name, r.Description)
	}
	if r.Category != "Refiner" {
		t.Errorf("Category = %q, want Refiner", r.Category)
	}
	if got := r.BuildCost; got["WOOD"] != 2 || got["METAL"] != 3 {
		t.Errorf("BuildCost = %v, want WOOD:2 METAL:3", got)
	}
	if _, ok := r.BuildCost["STONE"]; ok {
		t.Errorf("BuildCost should drop zero-cost STONE: %v", r.BuildCost)
	}
	if r.Consumes["ORE"] != 1.25 {
		t.Errorf("Consumes = %v, want ORE:1.25", r.Consumes)
	}
	if r.Produces["METAL"] != 0.5 {
		t.Errorf("Produces = %v, want METAL:0.5 (PLAYER rate)", r.Produces)
	}
	if !r.UsesTool {
		t.Errorf("UsesTool = false, want true")
	}
	if r.IsService {
		t.Errorf("IsService = true, want false")
	}
}

// Workshops/refiners hold production in a top-level INDUSTRIES array (each
// entry an INDUSTRY object), not at the top level — this must be picked up.
const nestedIndustryInit = `
RESOURCES: [WOOD,],
ITEMS: [
	{
		COSTS: [4,],
	},
],
INDUSTRIES: [
	{
		INDUSTRY: {
			IN: {
				COAL: 1.25,
			},
			OUT: {
				METAL: 0.5,
			},
		},
	},
],
`

func TestDecodeRoomNestedIndustry(t *testing.T) {
	r := parseRoom(t, nestedIndustryInit, "")
	if r.Consumes["COAL"] != 1.25 {
		t.Errorf("Consumes = %v, want COAL:1.25 from INDUSTRIES[0].INDUSTRY", r.Consumes)
	}
	if r.Produces["METAL"] != 0.5 {
		t.Errorf("Produces = %v, want METAL:0.5 (scalar OUT) from INDUSTRIES[0].INDUSTRY", r.Produces)
	}
	// nil text -> no name/desc, no panic.
	if r.Name != "" || r.Description != "" {
		t.Errorf("nil text should leave name/desc empty, got %q/%q", r.Name, r.Description)
	}
}

func TestDecodeRoomService(t *testing.T) {
	const serviceInit = `
RESOURCES: [WOOD,],
ITEMS: [ { COSTS: [2,], }, ],
SERVICE: {
	RADIUS: 100,
	STANDING: { CITIZEN: 3.5, },
},
`
	r := parseRoom(t, serviceInit, "")
	if !r.IsService {
		t.Errorf("IsService = false, want true (SERVICE block present)")
	}
	if len(r.Produces) != 0 || len(r.Consumes) != 0 {
		t.Errorf("service room should have no industry, got produces=%v consumes=%v", r.Produces, r.Consumes)
	}
}

func TestDecodeRoomFarm(t *testing.T) {
	const farmInit = `
GROWABLE: GRAIN,
RESOURCES: [GRAIN,],
INDUSTRY: {
	OUT: {
		GRAIN: {
			PLAYER: 4,
		},
	},
},
WORK: {
	USES_TOOL: true,
},
`
	r := parseRoom(t, farmInit, "")
	if r.Growable != "GRAIN" {
		t.Errorf("Growable = %q, want GRAIN", r.Growable)
	}
	if r.Produces["GRAIN"] != 4 {
		t.Errorf("Produces = %v, want GRAIN:4", r.Produces)
	}
}

func TestGenerateRoomsSourceCompiles(t *testing.T) {
	rooms := []data.Room{
		parseRoom(t, workshopInit, workshopText),
		parseRoom(t, nestedIndustryInit, ""),
	}
	rooms[1].ID = "REFINER_SMELTER" // distinct key for the map
	src, err := generateRoomsSource(rooms)
	if err != nil {
		t.Fatalf("generateRoomsSource: %v", err)
	}
	if _, err := format.Source(src); err != nil {
		t.Fatalf("generated source does not gofmt: %v\n%s", err, src)
	}
	s := string(src)
	for _, want := range []string{"package data", "var Rooms", "TEST_ROOM", "REFINER_SMELTER"} {
		if !strings.Contains(s, want) {
			t.Errorf("generated source missing %q", want)
		}
	}
}
