package main

import (
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
)

func TestRacesIndexDefault(t *testing.T) {
	res, err := racesModule(map[string]any{})
	if err != nil {
		t.Fatalf("racesModule index: %v", err)
	}
	idx, ok := res.(racesIndexResult)
	if !ok {
		t.Fatalf("result type = %T, want racesIndexResult", res)
	}
	if idx.Count != len(data.Races) {
		t.Errorf("count = %d, want %d", idx.Count, len(data.Races))
	}
}

func TestRacesExactID(t *testing.T) {
	res, err := racesModule(map[string]any{"race": "HUMAN"})
	if err != nil {
		t.Fatalf("racesModule lookup: %v", err)
	}
	r, ok := res.(data.Race)
	if !ok {
		t.Fatalf("result type = %T, want data.Race", res)
	}
	if r.ID != "HUMAN" || !r.Playable {
		t.Errorf("race = %+v, want HUMAN playable", r)
	}
	if r.SlavePrice == 0 || len(r.PreferredFoods) == 0 {
		t.Errorf("HUMAN missing slave price / preferred foods: %+v", r)
	}
}

func TestRacesFuzzyByName(t *testing.T) {
	res, err := racesModule(map[string]any{"race": "human"})
	if err != nil {
		t.Fatalf("racesModule fuzzy: %v", err)
	}
	if r, ok := res.(data.Race); !ok || r.ID != "HUMAN" {
		t.Errorf("fuzzy 'human' did not resolve HUMAN: %T", res)
	}
}

func TestRacesUnknownErrors(t *testing.T) {
	if _, err := racesModule(map[string]any{"race": "zzz_nope"}); err == nil {
		t.Errorf("unknown race = nil error, want error")
	}
}

func TestSchemaIncludesRaces(t *testing.T) {
	mods, ok := schema()["modules"].(map[string]any)
	if !ok {
		t.Fatalf("schema has no modules")
	}
	races, ok := mods["races"].(map[string]any)
	if !ok {
		t.Fatalf("schema missing races module")
	}
	params, ok := races["parameters"].(map[string]any)
	if !ok {
		t.Fatalf("races module missing parameters")
	}
	if _, ok := params["race"]; !ok {
		t.Errorf("races parameters missing 'race'")
	}
}
