package data

import (
	"testing"
)

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
		"medium-worm-turret":   0.3,
		"big-worm-turret":      0.5,
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
