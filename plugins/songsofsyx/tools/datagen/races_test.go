package main

import (
	"go/format"
	"strings"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/tools/datagen/sosdata"
)

func parseRace(t *testing.T, initSrc, textSrc string) data.Race {
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
	return decodeRace(initVal, textVal, "HUMAN")
}

const raceInit = `
PLAYABLE: true,
PROPERTIES: {
	HEIGHT: 6,
	BABY_DAYS: 12,
	CHILD_DAYS: 80,
	SLAVE_PRICE: 11,
},
PREFERRED: {
	FOOD: [
		BREAD,
		MEAT,
		*,
	],
	DRINK: [*,],
},
`

const raceText = `
NAME: "Human",
DESC:
"Humans, the last creation of the gods.
",
`

func TestDecodeRace(t *testing.T) {
	r := parseRace(t, raceInit, raceText)
	if r.ID != "HUMAN" || r.Name != "Human" {
		t.Errorf("id/name = %q/%q", r.ID, r.Name)
	}
	if !strings.HasPrefix(r.Description, "Humans, the last creation") {
		t.Errorf("Description = %q", r.Description)
	}
	if !r.Playable {
		t.Errorf("Playable = false, want true")
	}
	if r.SlavePrice != 11 || r.BabyDays != 12 || r.ChildDays != 80 {
		t.Errorf("props = slave %d baby %d child %d", r.SlavePrice, r.BabyDays, r.ChildDays)
	}
	// Wildcard '*' must be dropped from preferred foods.
	if len(r.PreferredFoods) != 2 || r.PreferredFoods[0] != "BREAD" || r.PreferredFoods[1] != "MEAT" {
		t.Errorf("PreferredFoods = %v, want [BREAD MEAT] (wildcard dropped)", r.PreferredFoods)
	}
}

func TestDecodeRaceNonPlayableNilText(t *testing.T) {
	r := parseRace(t, "PLAYABLE: false,", "")
	if r.Playable {
		t.Errorf("Playable = true, want false")
	}
	if r.Name != "" || r.Description != "" {
		t.Errorf("nil text should leave name/desc empty")
	}
}

func TestGenerateRacesSourceCompiles(t *testing.T) {
	races := []data.Race{
		parseRace(t, raceInit, raceText),
		{ID: "TILAPI", Name: "Tilapi"},
	}
	src, err := generateRacesSource(races)
	if err != nil {
		t.Fatalf("generateRacesSource: %v", err)
	}
	if _, err := format.Source(src); err != nil {
		t.Fatalf("generated source does not gofmt: %v\n%s", err, src)
	}
	s := string(src)
	for _, want := range []string{"package data", "var Races", "HUMAN", "TILAPI"} {
		if !strings.Contains(s, want) {
			t.Errorf("generated source missing %q", want)
		}
	}
}
