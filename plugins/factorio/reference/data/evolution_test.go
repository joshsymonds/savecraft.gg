package data

import (
	"testing"
)

func TestEvolutionSettings_BaseRates(t *testing.T) {
	if BaseEvolution.TimeFactor != 4e-06 {
		t.Errorf("TimeFactor = %v, want 4e-06", BaseEvolution.TimeFactor)
	}
	if BaseEvolution.DestroyFactor != 0.002 {
		t.Errorf("DestroyFactor = %v, want 0.002", BaseEvolution.DestroyFactor)
	}
	if BaseEvolution.PollutionFactor != 9e-07 {
		t.Errorf("PollutionFactor = %v, want 9e-07", BaseEvolution.PollutionFactor)
	}
}

func TestDifficultyPresets(t *testing.T) {
	dw, ok := DifficultyPresets["death-world"]
	if !ok {
		t.Fatal("death-world preset not found")
	}
	if dw.TimeFactor != 2e-05 {
		t.Errorf("death-world TimeFactor = %v, want 2e-05", dw.TimeFactor)
	}
	if dw.PollutionFactor != 1.2e-06 {
		t.Errorf("death-world PollutionFactor = %v, want 1.2e-06", dw.PollutionFactor)
	}

	dwm, ok := DifficultyPresets["death-world-marathon"]
	if !ok {
		t.Fatal("death-world-marathon preset not found")
	}
	if dwm.TimeFactor != 1.5e-05 {
		t.Errorf("death-world-marathon TimeFactor = %v, want 1.5e-05", dwm.TimeFactor)
	}
	if dwm.PollutionFactor != 1e-06 {
		t.Errorf("death-world-marathon PollutionFactor = %v, want 1e-06", dwm.PollutionFactor)
	}
}

func TestSpawnerTables(t *testing.T) {
	bs, ok := Spawners["biter-spawner"]
	if !ok {
		t.Fatal("biter-spawner not found")
	}

	// Should have 4 unit types
	if len(bs.Units) != 4 {
		t.Fatalf("biter-spawner has %d units, want 4", len(bs.Units))
	}

	// Check behemoth-biter appears at 0.9 evolution
	var found bool
	for _, u := range bs.Units {
		if u.Name == "behemoth-biter" {
			found = true
			if len(u.Weights) < 2 {
				t.Errorf("behemoth-biter has %d weight points, want >= 2", len(u.Weights))
				break
			}
			if u.Weights[0].Evolution != 0.9 {
				t.Errorf("behemoth-biter first evolution point = %v, want 0.9", u.Weights[0].Evolution)
			}
			break
		}
	}
	if !found {
		t.Error("behemoth-biter not found in biter-spawner")
	}

	// Spitter spawner should also exist
	ss, ok := Spawners["spitter-spawner"]
	if !ok {
		t.Fatal("spitter-spawner not found")
	}
	if len(ss.Units) != 5 {
		t.Errorf("spitter-spawner has %d units, want 5", len(ss.Units))
	}
}

func TestEnemyTiers(t *testing.T) {
	expected := map[string]float64{
		"medium-worm-turret":  0.3,
		"big-worm-turret":     0.5,
		"behemoth-worm-turret": 0.9,
	}

	if len(EnemyTiers) < len(expected) {
		t.Fatalf("EnemyTiers has %d entries, want >= %d", len(EnemyTiers), len(expected))
	}

	for _, tier := range EnemyTiers {
		want, ok := expected[tier.Name]
		if !ok {
			continue // extra tiers are fine
		}
		if tier.Threshold != want {
			t.Errorf("%s threshold = %v, want %v", tier.Name, tier.Threshold, want)
		}
		delete(expected, tier.Name)
	}

	for name := range expected {
		t.Errorf("missing enemy tier: %s", name)
	}
}
