package main

import (
	"testing"
)

// ─── Full Chain Mode ────────────────────────────────────────────────────────

func TestTechTree_FullChain_Simple(t *testing.T) {
	// automation-2 has a small, verifiable chain
	result, code := runReference(t, `{
		"module": "tech_tree_navigator",
		"target": "automation-2"
	}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)

	chain := toStringSlice(t, data["chain"])
	if len(chain) == 0 {
		t.Fatal("expected non-empty chain")
	}

	// Chain should include automation-2 itself and its transitive prereqs
	expected := map[string]bool{
		"automation-2":            true,
		"automation":              true,
		"steel-processing":        true,
		"logistic-science-pack":   true,
		"automation-science-pack":  true,
	}
	got := make(map[string]bool)
	for _, name := range chain {
		got[name] = true
	}
	for name := range expected {
		if !got[name] {
			t.Errorf("expected %q in chain, got chain: %v", name, chain)
		}
	}
}

func TestTechTree_FullChain_Deep(t *testing.T) {
	// nuclear-power has a deep chain (20 techs)
	result, code := runReference(t, `{
		"module": "tech_tree_navigator",
		"target": "nuclear-power"
	}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)

	chain := toStringSlice(t, data["chain"])
	if len(chain) < 10 {
		t.Errorf("nuclear-power should have 10+ techs in chain, got %d", len(chain))
	}

	// Must include key techs
	got := make(map[string]bool)
	for _, name := range chain {
		got[name] = true
	}
	for _, name := range []string{"nuclear-power", "uranium-processing", "chemical-science-pack", "automation"} {
		if !got[name] {
			t.Errorf("expected %q in nuclear-power chain", name)
		}
	}
}

func TestTechTree_SciencePackCosts(t *testing.T) {
	result, code := runReference(t, `{
		"module": "tech_tree_navigator",
		"target": "automation-2"
	}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)

	costs, ok := data["total_cost"].(map[string]any)
	if !ok {
		t.Fatal("expected total_cost map in result")
	}

	autoCost, ok := costs["automation-science-pack"].(float64)
	if !ok || autoCost <= 0 {
		t.Errorf("expected positive automation-science-pack cost, got %v", costs["automation-science-pack"])
	}
}

func TestTechTree_TotalTime(t *testing.T) {
	result, code := runReference(t, `{
		"module": "tech_tree_navigator",
		"target": "automation-2"
	}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)

	totalTime, ok := data["total_time_seconds"].(float64)
	if !ok || totalTime <= 0 {
		t.Errorf("expected positive total_time_seconds, got %v", data["total_time_seconds"])
	}
}

// ─── Research Order ─────────────────────────────────────────────────────────

func TestTechTree_ResearchOrder_Valid(t *testing.T) {
	result, code := runReference(t, `{
		"module": "tech_tree_navigator",
		"target": "nuclear-power"
	}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)

	order := toStringSlice(t, data["research_order"])
	if len(order) == 0 {
		t.Fatal("expected non-empty research_order")
	}

	// Every tech must appear after ALL its prerequisites in the order
	position := make(map[string]int)
	for i, name := range order {
		position[name] = i
	}

	// Check that automation appears before automation-2
	if pos, ok := position["automation"]; ok {
		if pos2, ok2 := position["automation-2"]; ok2 {
			if pos >= pos2 {
				t.Errorf("automation (pos %d) should appear before automation-2 (pos %d)", pos, pos2)
			}
		}
	}

	// Check uranium-processing before nuclear-power
	if pos, ok := position["uranium-processing"]; ok {
		if pos2, ok2 := position["nuclear-power"]; ok2 {
			if pos >= pos2 {
				t.Errorf("uranium-processing (pos %d) should appear before nuclear-power (pos %d)", pos, pos2)
			}
		}
	}
}

// ─── Remaining Path Mode ────────────────────────────────────────────────────

func TestTechTree_RemainingPath(t *testing.T) {
	result, code := runReference(t, `{
		"module": "tech_tree_navigator",
		"target": "automation-2",
		"completed": ["automation", "automation-science-pack", "steam-power", "electronics"]
	}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)

	chain := toStringSlice(t, data["chain"])
	got := make(map[string]bool)
	for _, name := range chain {
		got[name] = true
	}

	if got["automation"] {
		t.Error("completed tech 'automation' should not be in remaining chain")
	}
	if got["automation-science-pack"] {
		t.Error("completed tech 'automation-science-pack' should not be in remaining chain")
	}
	if !got["automation-2"] {
		t.Error("target tech 'automation-2' should still be in remaining chain")
	}

	// Should have fewer techs than full chain
	fullResult, _ := runReference(t, `{
		"module": "tech_tree_navigator",
		"target": "automation-2"
	}`)
	fullData := fullResult["data"].(map[string]any)
	fullChain := toStringSlice(t, fullData["chain"])
	if len(chain) >= len(fullChain) {
		t.Errorf("remaining chain (%d) should be shorter than full chain (%d)", len(chain), len(fullChain))
	}

	// Costs should be lower too
	remainCost := data["total_cost"].(map[string]any)
	fullCost := fullData["total_cost"].(map[string]any)
	remainAuto := remainCost["automation-science-pack"].(float64)
	fullAuto := fullCost["automation-science-pack"].(float64)
	if remainAuto >= fullAuto {
		t.Errorf("remaining cost (%v) should be less than full cost (%v)", remainAuto, fullAuto)
	}
}

func TestTechTree_RemainingPath_TargetAlreadyCompleted(t *testing.T) {
	result, code := runReference(t, `{
		"module": "tech_tree_navigator",
		"target": "automation",
		"completed": ["automation", "automation-science-pack", "steam-power", "electronics"]
	}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)

	chain := toStringSlice(t, data["chain"])
	if len(chain) != 0 {
		t.Errorf("expected empty chain when target is completed, got %v", chain)
	}
}

// ─── Edge Cases ─────────────────────────────────────────────────────────────

func TestTechTree_UnknownTech(t *testing.T) {
	_, code := runReference(t, `{
		"module": "tech_tree_navigator",
		"target": "nonexistent-tech"
	}`)
	if code != 1 {
		t.Errorf("expected exit 1 for unknown tech, got %d", code)
	}
}

func TestTechTree_CaseInsensitive(t *testing.T) {
	result, code := runReference(t, `{
		"module": "tech_tree_navigator",
		"target": "Automation-2"
	}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)

	chain := toStringSlice(t, data["chain"])
	if len(chain) == 0 {
		t.Fatal("expected non-empty chain with case-insensitive match")
	}
}

func TestTechTree_MissingTarget(t *testing.T) {
	_, code := runReference(t, `{
		"module": "tech_tree_navigator"
	}`)
	if code != 1 {
		t.Errorf("expected exit 1 for missing target, got %d", code)
	}
}

func TestTechTree_InfiniteResearchNotTraversed(t *testing.T) {
	// Infinite research techs should not appear in the chain of a normal tech
	result, code := runReference(t, `{
		"module": "tech_tree_navigator",
		"target": "automation-2"
	}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)

	chain := toStringSlice(t, data["chain"])
	for _, name := range chain {
		if name == "mining-productivity" {
			t.Error("infinite research 'mining-productivity' should not appear in chain")
		}
	}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

func toStringSlice(t *testing.T, v any) []string {
	t.Helper()
	if v == nil {
		return nil
	}
	raw, ok := v.([]any)
	if !ok {
		t.Fatalf("expected array, got %T", v)
	}
	var result []string
	for _, item := range raw {
		s, ok := item.(string)
		if !ok {
			t.Fatalf("expected string in array, got %T", item)
		}
		result = append(result, s)
	}
	return result
}
