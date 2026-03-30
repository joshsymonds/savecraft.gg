package main

import (
	"testing"
)

// ─── Backwards Compatibility ─────────────────────────────────────────────────

func TestOilExisting_NoSaveDataProducesIdenticalOutput(t *testing.T) {
	// Query without existing_setup or actual_flow must produce identical output.
	// No existing/deficit_rate/status fields on stages, no bottlenecks in result.
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 390}
	}`)

	stages := getStages(t, result)

	for _, s := range stages {
		stage := s.(map[string]any)
		recipe := stage["recipe"].(string)
		if _, ok := stage["existing"]; ok {
			t.Errorf("stage %q: existing field should not be present without save data", recipe)
		}
		if _, ok := stage["deficit_rate"]; ok {
			t.Errorf("stage %q: deficit_rate field should not be present without save data", recipe)
		}
		if _, ok := stage["status"]; ok {
			t.Errorf("stage %q: status field should not be present without save data", recipe)
		}
	}

	if _, ok := result["bottlenecks"]; ok {
		t.Error("bottlenecks should not be present without save data")
	}
}

func TestOilExisting_EmptyExistingSetupProducesValidOutput(t *testing.T) {
	// Empty existing_setup (player has no machines) — should still compute balancer
	// output and mark all stages as "missing".
	result := runOilBalancer(t, `{
		"module": "oil_balancer",
		"processing_type": "advanced-oil-processing",
		"targets": {"petroleum-gas": 390},
		"existing_setup": {"by_recipe": {}, "by_type": {}, "beacon_count": 0}
	}`)

	stages := getStages(t, result)

	// All stages should be marked "missing"
	for _, s := range stages {
		stage := s.(map[string]any)
		recipe := stage["recipe"].(string)
		status, ok := stage["status"].(string)
		if !ok {
			t.Errorf("stage %q: missing status field with empty existing_setup", recipe)
			continue
		}
		if status != "missing" {
			t.Errorf("stage %q: status = %q, want 'missing'", recipe, status)
		}
	}

	// Should have bottlenecks for every stage
	bottlenecks, ok := result["bottlenecks"].([]any)
	if !ok {
		t.Fatal("expected bottlenecks array with empty existing_setup")
	}
	if len(bottlenecks) == 0 {
		t.Error("expected at least one bottleneck with empty existing_setup")
	}
}
