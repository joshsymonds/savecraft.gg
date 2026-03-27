package genes

import (
	"testing"
)

func TestValidateBuild(t *testing.T) {
	genes := []GeneEntry{
		{DefName: "Robust", Label: "robust", Complexity: 1, MetabolismOffset: -2, ExclusionTags: []string{"Toughness"}},
		{DefName: "MeleeDamage_Strong", Label: "strong melee damage", Complexity: 2, MetabolismOffset: -2},
		{DefName: "Immunity_Strong", Label: "strong immunity", Complexity: 1, MetabolismOffset: -1},
	}

	result := ValidateBuild(genes, 6, -5)

	if result.TotalComplexity != 4 {
		t.Errorf("complexity = %d, want 4", result.TotalComplexity)
	}
	if result.TotalMetabolism != -5 {
		t.Errorf("metabolism = %d, want -5", result.TotalMetabolism)
	}
	if !result.ComplexityOK {
		t.Error("complexity should be within budget")
	}
	if !result.MetabolismOK {
		t.Error("metabolism -5 should be within -5 budget")
	}
	if len(result.Conflicts) != 0 {
		t.Errorf("expected no conflicts, got %v", result.Conflicts)
	}
}

func TestValidateBuildOverBudget(t *testing.T) {
	genes := []GeneEntry{
		{DefName: "A", Complexity: 3, MetabolismOffset: -2},
		{DefName: "B", Complexity: 3, MetabolismOffset: -2},
		{DefName: "C", Complexity: 3, MetabolismOffset: -2},
	}

	result := ValidateBuild(genes, 6, -3)

	if result.ComplexityOK {
		t.Error("complexity 9 should exceed budget 6")
	}
	if result.MetabolismOK {
		t.Error("metabolism -6 should exceed budget -3")
	}
}

func TestConflictDetection(t *testing.T) {
	genes := []GeneEntry{
		{DefName: "Robust", Label: "robust", ExclusionTags: []string{"Toughness"}},
		{DefName: "Delicate", Label: "delicate", ExclusionTags: []string{"Toughness"}},
	}

	result := ValidateBuild(genes, 20, -10)

	if len(result.Conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d: %v", len(result.Conflicts), result.Conflicts)
	}
	if result.Conflicts[0].Tag != "Toughness" {
		t.Errorf("conflict tag = %q, want %q", result.Conflicts[0].Tag, "Toughness")
	}
}

func TestArchiteCost(t *testing.T) {
	genes := []GeneEntry{
		{DefName: "FireSpew", ArchiteCost: 1},
		{DefName: "Robust", ArchiteCost: 0},
		{DefName: "Deathless", ArchiteCost: 1},
	}

	result := ValidateBuild(genes, 20, -10)

	if result.TotalArchite != 2 {
		t.Errorf("archite cost = %d, want 2", result.TotalArchite)
	}
}
