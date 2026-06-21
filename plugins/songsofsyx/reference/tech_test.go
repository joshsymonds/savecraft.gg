package main

import (
	"strings"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
)

func TestTechIndexDefault(t *testing.T) {
	res, err := techModule(map[string]any{})
	if err != nil {
		t.Fatalf("techModule index: %v", err)
	}
	idx, ok := res.(techIndexResult)
	if !ok {
		t.Fatalf("result type = %T, want techIndexResult", res)
	}
	if idx.Count != len(data.Techs) {
		t.Errorf("count = %d, want %d", idx.Count, len(data.Techs))
	}
}

func TestTechCategoryFilter(t *testing.T) {
	res, err := techModule(map[string]any{"category": "administration"})
	if err != nil {
		t.Fatalf("techModule category: %v", err)
	}
	idx, ok := res.(techIndexResult)
	if !ok {
		t.Fatalf("result type = %T, want techIndexResult", res)
	}
	if idx.Count == 0 {
		t.Fatalf("category 'administration' returned nothing")
	}
	for _, e := range idx.Techs {
		if !strings.EqualFold(e.Category, "Administration") {
			t.Errorf("category filter leaked %s (%s)", e.Category, e.ID)
		}
	}
}

func TestTechExactKey(t *testing.T) {
	res, err := techModule(map[string]any{"tech": "SCH00"})
	if err != nil {
		t.Fatalf("techModule lookup: %v", err)
	}
	tech, ok := res.(data.Tech)
	if !ok {
		t.Fatalf("result type = %T, want data.Tech", res)
	}
	// IDs are namespaced by category (keys repeat across trees), so the bare
	// key "SCH00" resolves the unique ADMIN/SCH00.
	if tech.ID != "ADMIN/SCH00" {
		t.Errorf("ID = %q, want ADMIN/SCH00", tech.ID)
	}
	if tech.Costs["CIVIC_ADMIN"] == 0 || tech.RequiresPopulation == 0 {
		t.Errorf("SCH00 missing costs/requirements: %+v", tech)
	}
}

func TestTechFuzzyByName(t *testing.T) {
	// SCH00 is named "School".
	res, err := techModule(map[string]any{"tech": "School"})
	if err != nil {
		t.Fatalf("techModule fuzzy: %v", err)
	}
	switch v := res.(type) {
	case data.Tech:
		if v.ID != "ADMIN/SCH00" {
			t.Errorf("fuzzy 'School' = %s, want ADMIN/SCH00", v.ID)
		}
	case candidatesResult:
		var found bool
		for _, c := range v.Candidates {
			if c.ID == "ADMIN/SCH00" {
				found = true
			}
		}
		if !found {
			t.Errorf("fuzzy 'School' candidates missing SCH00")
		}
	default:
		t.Fatalf("unexpected result type %T", res)
	}
}

func TestTechUnknownErrors(t *testing.T) {
	if _, err := techModule(map[string]any{"tech": "zzz_nope"}); err == nil {
		t.Errorf("unknown tech = nil error, want error")
	}
}

func TestSchemaIncludesTech(t *testing.T) {
	mods, ok := schema()["modules"].(map[string]any)
	if !ok {
		t.Fatalf("schema has no modules")
	}
	techmod, ok := mods["tech"].(map[string]any)
	if !ok {
		t.Fatalf("schema missing tech module")
	}
	params, ok := techmod["parameters"].(map[string]any)
	if !ok {
		t.Fatalf("tech module missing parameters")
	}
	for _, p := range []string{"tech", "category"} {
		if _, ok := params[p]; !ok {
			t.Errorf("tech parameters missing %q", p)
		}
	}
}
