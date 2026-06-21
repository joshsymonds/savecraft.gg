package main

import (
	"go/format"
	"strings"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/tools/datagen/sosdata"
)

func parseResource(t *testing.T, initSrc, textSrc string, roles []string) data.Resource {
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
	return decodeResource(initVal, textVal, "GRAIN", roles)
}

func TestDecodeResource(t *testing.T) {
	const initSrc = `
DEGRADE_RATE: 0.1,
CATEGORY_DEFAULT: 1,
PRICE_MUL: 1.0,
`
	const textSrc = `
NAME: "Grain",
NAMES: "Grain",
DESC: "Grain is a crop that can be turned to bread in a bakery.",
`
	r := parseResource(t, initSrc, textSrc, []string{"growable", "edible"})
	if r.ID != "GRAIN" {
		t.Errorf("ID = %q", r.ID)
	}
	if r.Name != "Grain" {
		t.Errorf("Name = %q, want Grain", r.Name)
	}
	if !strings.HasPrefix(r.Description, "Grain is a crop") {
		t.Errorf("Description = %q", r.Description)
	}
	if r.DegradeRate != 0.1 {
		t.Errorf("DegradeRate = %v, want 0.1", r.DegradeRate)
	}
	// Roles are sorted for determinism.
	if len(r.Roles) != 2 || r.Roles[0] != "edible" || r.Roles[1] != "growable" {
		t.Errorf("Roles = %v, want [edible growable] sorted", r.Roles)
	}
}

func TestDecodeResourceNilText(t *testing.T) {
	r := parseResource(t, "DEGRADE_RATE: 0,", "", nil)
	if r.Name != "" || r.Description != "" {
		t.Errorf("nil text should leave name/desc empty, got %q/%q", r.Name, r.Description)
	}
	if len(r.Roles) != 0 {
		t.Errorf("nil roles should be empty, got %v", r.Roles)
	}
}

func TestGenerateResourcesSourceCompiles(t *testing.T) {
	resources := []data.Resource{
		parseResource(t, "DEGRADE_RATE: 0.1,", `NAME: "Grain",`, []string{"growable"}),
		{ID: "METAL", Name: "Metal"},
	}
	src, err := generateResourcesSource(resources)
	if err != nil {
		t.Fatalf("generateResourcesSource: %v", err)
	}
	if _, err := format.Source(src); err != nil {
		t.Fatalf("generated source does not gofmt: %v\n%s", err, src)
	}
	s := string(src)
	for _, want := range []string{"package data", "var Resources", "GRAIN", "METAL"} {
		if !strings.Contains(s, want) {
			t.Errorf("generated source missing %q", want)
		}
	}
}
