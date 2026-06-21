package main

import (
	"strings"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
)

func TestRoomsIndexDefault(t *testing.T) {
	res, err := roomsModule(map[string]any{})
	if err != nil {
		t.Fatalf("roomsModule index: %v", err)
	}
	idx, ok := res.(roomsIndexResult)
	if !ok {
		t.Fatalf("result type = %T, want roomsIndexResult", res)
	}
	if idx.Count != len(data.Rooms) || len(idx.Rooms) != len(data.Rooms) {
		t.Errorf("index count = %d / %d, want %d", idx.Count, len(idx.Rooms), len(data.Rooms))
	}
	// Index entries are lightweight: id/name/category only.
	var sawEatery bool
	for _, e := range idx.Rooms {
		if e.ID == "EATERY_NORMAL" {
			sawEatery = true
		}
	}
	if !sawEatery {
		t.Errorf("index missing EATERY_NORMAL")
	}
}

func TestRoomsCategoryFilter(t *testing.T) {
	res, err := roomsModule(map[string]any{"category": "service"})
	if err != nil {
		t.Fatalf("roomsModule category: %v", err)
	}
	idx, ok := res.(roomsIndexResult)
	if !ok {
		t.Fatalf("result type = %T, want roomsIndexResult", res)
	}
	if idx.Count == 0 {
		t.Fatalf("category 'service' returned no rooms")
	}
	for _, e := range idx.Rooms {
		if !strings.EqualFold(e.Category, "Service") {
			t.Errorf("category filter leaked %q (%s)", e.Category, e.ID)
		}
	}
}

func TestRoomsExactID(t *testing.T) {
	res, err := roomsModule(map[string]any{"room": "EATERY_NORMAL"})
	if err != nil {
		t.Fatalf("roomsModule room: %v", err)
	}
	r, ok := res.(data.Room)
	if !ok {
		t.Fatalf("result type = %T, want data.Room", res)
	}
	if r.ID != "EATERY_NORMAL" || !r.IsService {
		t.Errorf("room = %+v, want EATERY_NORMAL service", r)
	}
	if len(r.BuildCost) == 0 {
		t.Errorf("EATERY_NORMAL has no BuildCost")
	}
}

func TestRoomsExactIDCaseInsensitive(t *testing.T) {
	res, err := roomsModule(map[string]any{"room": "eatery_normal"})
	if err != nil {
		t.Fatalf("roomsModule room (lowercase): %v", err)
	}
	if r, ok := res.(data.Room); !ok || r.ID != "EATERY_NORMAL" {
		t.Errorf("lowercase exact id did not resolve EATERY_NORMAL: %T", res)
	}
}

func TestRoomsFuzzyByName(t *testing.T) {
	// "smelter" matches the Metal Smelter's name -> REFINER_SMELTER.
	res, err := roomsModule(map[string]any{"room": "smelter"})
	if err != nil {
		t.Fatalf("roomsModule fuzzy: %v", err)
	}
	switch v := res.(type) {
	case data.Room:
		if v.ID != "REFINER_SMELTER" {
			t.Errorf("fuzzy 'smelter' = %s, want REFINER_SMELTER", v.ID)
		}
		if len(v.Produces) == 0 {
			t.Errorf("REFINER_SMELTER has no Produces")
		}
	case roomsCandidates:
		var found bool
		for _, c := range v.Candidates {
			if c.ID == "REFINER_SMELTER" {
				found = true
			}
		}
		if !found {
			t.Errorf("fuzzy 'smelter' candidates missing REFINER_SMELTER")
		}
	default:
		t.Fatalf("unexpected result type %T", res)
	}
}

func TestRoomsAmbiguousReturnsCandidates(t *testing.T) {
	// "farm" matches many rooms -> candidates, not an error.
	res, err := roomsModule(map[string]any{"room": "farm"})
	if err != nil {
		t.Fatalf("roomsModule ambiguous: %v", err)
	}
	c, ok := res.(roomsCandidates)
	if !ok {
		t.Fatalf("result type = %T, want roomsCandidates", res)
	}
	if len(c.Candidates) < 2 {
		t.Errorf("'farm' returned %d candidates, want several", len(c.Candidates))
	}
}

func TestRoomsUnknownErrors(t *testing.T) {
	if _, err := roomsModule(map[string]any{"room": "zzz_not_a_room"}); err == nil {
		t.Errorf("unknown room = nil error, want error")
	}
}

func TestSchemaIncludesRooms(t *testing.T) {
	mods, ok := schema()["modules"].(map[string]any)
	if !ok {
		t.Fatalf("schema has no modules map")
	}
	rooms, ok := mods["rooms"].(map[string]any)
	if !ok {
		t.Fatalf("schema missing rooms module")
	}
	params, ok := rooms["parameters"].(map[string]any)
	if !ok {
		t.Fatalf("rooms module missing parameters")
	}
	for _, p := range []string{"room", "category"} {
		if _, ok := params[p]; !ok {
			t.Errorf("rooms parameters missing %q", p)
		}
	}
}
