package main

import (
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
)

func TestResourcesIndexDefault(t *testing.T) {
	res, err := resourcesModule(map[string]any{})
	if err != nil {
		t.Fatalf("resourcesModule index: %v", err)
	}
	idx, ok := res.(resourcesIndexResult)
	if !ok {
		t.Fatalf("result type = %T, want resourcesIndexResult", res)
	}
	if idx.Count != len(data.Resources) {
		t.Errorf("count = %d, want %d", idx.Count, len(data.Resources))
	}
}

func TestResourcesRoleFilter(t *testing.T) {
	res, err := resourcesModule(map[string]any{"role": "growable"})
	if err != nil {
		t.Fatalf("resourcesModule role: %v", err)
	}
	idx, ok := res.(resourcesIndexResult)
	if !ok {
		t.Fatalf("result type = %T, want resourcesIndexResult", res)
	}
	if idx.Count == 0 {
		t.Fatalf("role 'growable' returned nothing")
	}
	for _, e := range idx.Resources {
		var has bool
		for _, r := range e.Roles {
			if r == "growable" {
				has = true
			}
		}
		if !has {
			t.Errorf("role filter leaked %s (roles %v)", e.ID, e.Roles)
		}
	}
}

func TestResourcesLookupWithProducers(t *testing.T) {
	// METAL is produced by REFINER_SMELTER (proves the entity-ID join).
	res, err := resourcesModule(map[string]any{"resource": "metal"})
	if err != nil {
		t.Fatalf("resourcesModule lookup: %v", err)
	}
	rr, ok := res.(resourceResult)
	if !ok {
		t.Fatalf("result type = %T, want resourceResult", res)
	}
	if rr.Resource.ID != "METAL" {
		t.Errorf("ID = %q, want METAL", rr.Resource.ID)
	}
	var producedBySmelter bool
	for _, p := range rr.ProducedBy {
		if p.ID == "REFINER_SMELTER" {
			producedBySmelter = true
		}
	}
	if !producedBySmelter {
		t.Errorf("METAL producedBy missing REFINER_SMELTER; got %+v", rr.ProducedBy)
	}
}

func TestResourcesConsumers(t *testing.T) {
	// COAL is consumed by REFINER_SMELTER.
	res, err := resourcesModule(map[string]any{"resource": "COAL"})
	if err != nil {
		t.Fatalf("resourcesModule lookup: %v", err)
	}
	rr, ok := res.(resourceResult)
	if !ok {
		t.Fatalf("result type = %T, want resourceResult", res)
	}
	var consumed bool
	for _, c := range rr.ConsumedBy {
		if c.ID == "REFINER_SMELTER" {
			consumed = true
		}
	}
	if !consumed {
		t.Errorf("COAL consumedBy missing REFINER_SMELTER; got %+v", rr.ConsumedBy)
	}
}

func TestResourcesUnknownErrors(t *testing.T) {
	if _, err := resourcesModule(map[string]any{"resource": "zzz_nope"}); err == nil {
		t.Errorf("unknown resource = nil error, want error")
	}
}

func TestSchemaIncludesResources(t *testing.T) {
	mods, ok := schema()["modules"].(map[string]any)
	if !ok {
		t.Fatalf("schema has no modules")
	}
	resmod, ok := mods["resources"].(map[string]any)
	if !ok {
		t.Fatalf("schema missing resources module")
	}
	params, ok := resmod["parameters"].(map[string]any)
	if !ok {
		t.Fatalf("resources module missing parameters")
	}
	for _, p := range []string{"resource", "role"} {
		if _, ok := params[p]; !ok {
			t.Errorf("resources parameters missing %q", p)
		}
	}
}
