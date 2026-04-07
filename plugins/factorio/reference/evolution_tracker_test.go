package main

import (
	"testing"
)

// ─── Section-Based Evolution ───────────────────────────────────────────────

func TestEvolution_FromDefensesSection(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"evolution": {
				"factor": 0.8088,
				"time_factor": 0.6458,
				"pollution_factor": 0.3587,
				"kill_factor": 0.0
			},
			"turrets": {"laser-turret": 283, "gun-turret": 10},
			"walls": 5082,
			"enemy_bases_nearby": [],
			"total_pollution": 0
		}
	}`)

	evo := result["evolution_factor"].(float64)
	assertApprox(t, "evolution_factor", evo, 0.8088, 0.0001)

	sources := result["sources"].(map[string]any)
	assertApprox(t, "time source", sources["time"].(float64), 0.6458, 0.0001)
	assertApprox(t, "pollution source", sources["pollution"].(float64), 0.3587, 0.0001)
	assertApprox(t, "kills source", sources["kills"].(float64), 0.0, 0.0001)

	if result["dominant_source"] != "time" {
		t.Errorf("expected dominant source 'time', got %q", result["dominant_source"])
	}

	// At 0.8088: past medium-worm (0.3) and big-worm (0.5), next is behemoth (0.9)
	if result["current_tier"] != "big-worm-turret" {
		t.Errorf("expected current tier big-worm-turret, got %v", result["current_tier"])
	}
	nextTier := result["next_tier"].(map[string]any)
	if nextTier["name"] != "behemoth-worm-turret" {
		t.Errorf("expected next tier behemoth-worm-turret, got %v", nextTier["name"])
	}

	// Spawn weights should exist
	weights := result["spawn_weights"].(map[string]any)
	if len(weights) == 0 {
		t.Error("expected non-empty spawn weights")
	}
}

func TestEvolution_DefenseSummaryPassthrough(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"evolution": {
				"factor": 0.5,
				"time_factor": 0.3,
				"pollution_factor": 0.15,
				"kill_factor": 0.05
			},
			"turrets": {"laser-turret": 100, "gun-turret": 20, "flamethrower-turret": 5},
			"walls": 2000,
			"enemy_bases_nearby": [
				{"distance": 150, "direction": "east", "type": "biter-spawner"},
				{"distance": 300, "direction": "south", "type": "spitter-spawner"}
			],
			"total_pollution": 15000
		}
	}`)

	defenses := result["defenses"].(map[string]any)

	// Turrets
	turrets := defenses["turrets"].(map[string]any)
	if turrets["laser-turret"].(float64) != 100 {
		t.Errorf("expected 100 laser turrets, got %v", turrets["laser-turret"])
	}
	if turrets["gun-turret"].(float64) != 20 {
		t.Errorf("expected 20 gun turrets, got %v", turrets["gun-turret"])
	}
	if turrets["flamethrower-turret"].(float64) != 5 {
		t.Errorf("expected 5 flamethrower turrets, got %v", turrets["flamethrower-turret"])
	}

	// Walls
	if defenses["walls"].(float64) != 2000 {
		t.Errorf("expected 2000 walls, got %v", defenses["walls"])
	}

	// Enemy bases
	bases := defenses["enemy_bases_nearby"].([]any)
	if len(bases) != 2 {
		t.Errorf("expected 2 enemy bases, got %d", len(bases))
	}

	// Total pollution
	if defenses["total_pollution"].(float64) != 15000 {
		t.Errorf("expected total_pollution 15000, got %v", defenses["total_pollution"])
	}
}

// ─── Zero Evolution ────────────────────────────────────────────────────────

func TestEvolution_ZeroEvolution(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"evolution": {
				"factor": 0,
				"time_factor": 0,
				"pollution_factor": 0,
				"kill_factor": 0
			},
			"turrets": {},
			"walls": 0,
			"enemy_bases_nearby": [],
			"total_pollution": 0
		}
	}`)

	if result["evolution_factor"].(float64) != 0 {
		t.Errorf("expected zero evolution, got %v", result["evolution_factor"])
	}

	if result["current_tier"] != "none" {
		t.Errorf("expected tier 'none', got %v", result["current_tier"])
	}

	// Next tier should be the first one (medium-worm-turret at 0.3)
	nextTier := result["next_tier"].(map[string]any)
	if nextTier["name"] != "medium-worm-turret" {
		t.Errorf("expected next tier medium-worm-turret, got %v", nextTier["name"])
	}
}

// ─── High Evolution (Past All Tiers) ───────────────────────────────────────

func TestEvolution_PastAllTiers(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"evolution": {
				"factor": 0.95,
				"time_factor": 0.4,
				"pollution_factor": 0.5,
				"kill_factor": 0.3
			},
			"turrets": {"artillery-turret": 4},
			"walls": 10000,
			"enemy_bases_nearby": [],
			"total_pollution": 50000
		}
	}`)

	if result["current_tier"] != "behemoth-worm-turret" {
		t.Errorf("expected current tier behemoth-worm-turret, got %v", result["current_tier"])
	}

	if result["next_tier"] != nil {
		t.Errorf("expected nil next_tier when past all tiers, got %v", result["next_tier"])
	}

	// At 0.95, behemoth-biter should have positive weight
	weights := result["spawn_weights"].(map[string]any)
	behemothWeight := weights["behemoth-biter"].(float64)
	if behemothWeight <= 0 {
		t.Errorf("behemoth-biter should have positive weight at evo 0.95, got %v", behemothWeight)
	}
}

// ─── Dominant Source ───────────────────────────────────────────────────────

func TestEvolution_DominantSourcePollution(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"evolution": {
				"factor": 0.6,
				"time_factor": 0.1,
				"pollution_factor": 0.5,
				"kill_factor": 0.2
			},
			"turrets": {},
			"walls": 0,
			"enemy_bases_nearby": [],
			"total_pollution": 0
		}
	}`)

	if result["dominant_source"] != "pollution" {
		t.Errorf("expected dominant source 'pollution', got %q", result["dominant_source"])
	}
}

func TestEvolution_DominantSourceKills(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"evolution": {
				"factor": 0.4,
				"time_factor": 0.05,
				"pollution_factor": 0.1,
				"kill_factor": 0.35
			},
			"turrets": {},
			"walls": 0,
			"enemy_bases_nearby": [],
			"total_pollution": 0
		}
	}`)

	if result["dominant_source"] != "kills" {
		t.Errorf("expected dominant source 'kills', got %q", result["dominant_source"])
	}
}

// ─── Spawn Weights ─────────────────────────────────────────────────────────

func TestEvolution_SpawnWeightsEarlyGame(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"evolution": {
				"factor": 0.35,
				"time_factor": 0.2,
				"pollution_factor": 0.1,
				"kill_factor": 0.05
			},
			"turrets": {},
			"walls": 0,
			"enemy_bases_nearby": [],
			"total_pollution": 0
		}
	}`)

	weights := result["spawn_weights"].(map[string]any)

	// Small biter: curve [{0, 0.3}, {0.6, 0}] — at 0.35, should have positive weight
	smallWeight := weights["small-biter"].(float64)
	if smallWeight <= 0 {
		t.Errorf("small-biter should have positive weight at evo 0.35, got %v", smallWeight)
	}

	// Big biter: curve [{0.5, 0}, {1.0, 0.4}] — at 0.35, below threshold so 0
	bigWeight := weights["big-biter"].(float64)
	if bigWeight != 0 {
		t.Errorf("big-biter should have zero weight at evo 0.35, got %v", bigWeight)
	}

	// Behemoth: at 0.35, way below 0.9 threshold
	behemothWeight := weights["behemoth-biter"].(float64)
	if behemothWeight != 0 {
		t.Errorf("behemoth-biter should have zero weight at evo 0.35, got %v", behemothWeight)
	}
}

// ─── Error Cases ───────────────────────────────────────────────────────────

func TestEvolution_MissingDefensesSection(t *testing.T) {
	_, code := runReference(t, `{
		"module": "evolution_tracker"
	}`)
	if code != 1 {
		t.Errorf("expected exit 1 for missing defenses section, got %d", code)
	}
}

func TestEvolution_NullDefensesSection(t *testing.T) {
	_, code := runReference(t, `{
		"module": "evolution_tracker",
		"defenses": null
	}`)
	if code != 1 {
		t.Errorf("expected exit 1 for null defenses section, got %d", code)
	}
}

// ─── Helpers ───────────────────────────────────────────────────────────────

func runEvolution(t *testing.T, input string) map[string]any {
	t.Helper()
	result, code := runReference(t, input)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data, ok := result["data"].(map[string]any)
	if !ok {
		t.Fatal("result data is not a map")
	}
	return data
}

func assertApprox(t *testing.T, name string, got, want, tolerance float64) {
	t.Helper()
	if got < want-tolerance || got > want+tolerance {
		t.Errorf("%s = %v, want ~%v (±%v)", name, got, want, tolerance)
	}
}
