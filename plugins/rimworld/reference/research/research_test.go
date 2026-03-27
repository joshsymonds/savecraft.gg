package research

import (
	"math"
	"testing"
)

const tolerance = 0.1

func approx(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > tolerance {
		t.Errorf("%s = %.1f, want %.1f", name, got, want)
	}
}

func TestTechLevelMultiplier(t *testing.T) {
	// Tribal start: medieval costs 1.5×, industrial+ costs 2×
	approx(t, "tribal→neolithic", TechLevelMultiplier("Neolithic", "Neolithic"), 1.0)
	approx(t, "tribal→medieval", TechLevelMultiplier("Medieval", "Neolithic"), 1.5)
	approx(t, "tribal→industrial", TechLevelMultiplier("Industrial", "Neolithic"), 2.0)
	approx(t, "tribal→spacer", TechLevelMultiplier("Spacer", "Neolithic"), 2.0)
	// Industrial start: no penalty
	approx(t, "industrial→industrial", TechLevelMultiplier("Industrial", "Industrial"), 1.0)
	approx(t, "industrial→spacer", TechLevelMultiplier("Spacer", "Industrial"), 1.0)
}

func TestPrerequisiteChain(t *testing.T) {
	projects := map[string]ResearchProject{
		"Smithing": {DefName: "Smithing", Label: "smithing", BaseCost: 700, TechLevel: "Neolithic"},
		"Machining": {DefName: "Machining", Label: "machining", BaseCost: 2500, TechLevel: "Industrial", Prerequisites: []string{"Smithing"}},
		"MultiAnalyzer": {DefName: "MultiAnalyzer", Label: "multi-analyzer", BaseCost: 4000, TechLevel: "Industrial", Prerequisites: []string{"MicroelectronicsBasics"}},
		"MicroelectronicsBasics": {DefName: "MicroelectronicsBasics", Label: "microelectronics", BaseCost: 3000, TechLevel: "Industrial", Prerequisites: []string{"Electricity"}},
		"Electricity": {DefName: "Electricity", Label: "electricity", BaseCost: 1600, TechLevel: "Industrial"},
	}

	chain := PrerequisiteChain(projects, "MultiAnalyzer")

	// Should include: Electricity → MicroelectronicsBasics → MultiAnalyzer
	if len(chain) != 3 {
		t.Fatalf("chain length = %d, want 3: %v", len(chain), chain)
	}
	if chain[0] != "Electricity" {
		t.Errorf("chain[0] = %q, want Electricity", chain[0])
	}
	if chain[1] != "MicroelectronicsBasics" {
		t.Errorf("chain[1] = %q, want MicroelectronicsBasics", chain[1])
	}
	if chain[2] != "MultiAnalyzer" {
		t.Errorf("chain[2] = %q, want MultiAnalyzer", chain[2])
	}
}

func TestChainCost(t *testing.T) {
	projects := map[string]ResearchProject{
		"Electricity": {BaseCost: 1600, TechLevel: "Industrial"},
		"MicroelectronicsBasics": {BaseCost: 3000, TechLevel: "Industrial", Prerequisites: []string{"Electricity"}},
		"MultiAnalyzer": {BaseCost: 4000, TechLevel: "Industrial", Prerequisites: []string{"MicroelectronicsBasics"}},
	}

	chain := []string{"Electricity", "MicroelectronicsBasics", "MultiAnalyzer"}

	// As tribal (neolithic): industrial costs 2×
	cost := ChainCost(projects, chain, "Neolithic")
	// (1600 + 3000 + 4000) × 2.0 = 17200
	approx(t, "tribal chain cost", cost, 17200)

	// As industrial: no multiplier
	cost = ChainCost(projects, chain, "Industrial")
	approx(t, "industrial chain cost", cost, 8600)
}

func TestResearchSpeed(t *testing.T) {
	// Base research per tick: 0.00825
	// Skill 10 researcher at hi-tech bench with multi-analyzer in clean room
	// This is informational — just verify it returns a positive value
	speed := ResearchSpeed(10)
	if speed <= 0 {
		t.Errorf("research speed = %.4f, want > 0", speed)
	}
}
