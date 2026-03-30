package main

import (
	"math"
	"testing"
)

// ─── Basic Evolution Computation ────────────────────────────────────────────

func TestEvolution_ZeroInputs(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"game_time_hours": 0,
		"pollution_absorbed": 0,
		"nests_destroyed": 0
	}`)

	evo := result["evolution_factor"].(float64)
	if evo != 0 {
		t.Errorf("zero inputs should produce zero evolution, got %v", evo)
	}
}

func TestEvolution_ModerateGame(t *testing.T) {
	// 2 hours, 10k pollution, 5 nests → ~0.826 combined
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"game_time_hours": 2,
		"pollution_absorbed": 10000,
		"nests_destroyed": 5
	}`)

	evo := result["evolution_factor"].(float64)
	assertApprox(t, "evolution_factor", evo, 0.8257, 0.01)

	sources := result["sources"].(map[string]any)
	timeEvo := sources["time"].(float64)
	assertApprox(t, "time source", timeEvo, 0.8224, 0.01)

	pollEvo := sources["pollution"].(float64)
	assertApprox(t, "pollution source", pollEvo, 0.00896, 0.001)

	killEvo := sources["kills"].(float64)
	assertApprox(t, "kills source", killEvo, 0.00996, 0.001)
}

func TestEvolution_EarlyGame(t *testing.T) {
	// 0.5 hours, 2k pollution, 0 nests → ~0.352
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"game_time_hours": 0.5,
		"pollution_absorbed": 2000,
		"nests_destroyed": 0
	}`)

	evo := result["evolution_factor"].(float64)
	assertApprox(t, "evolution_factor", evo, 0.352, 0.01)
}

// ─── Difficulty Presets ─────────────────────────────────────────────────────

func TestEvolution_DeathWorld(t *testing.T) {
	// Death world with same inputs should produce much higher evolution
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"game_time_hours": 2,
		"pollution_absorbed": 10000,
		"nests_destroyed": 5,
		"preset": "death-world"
	}`)

	evo := result["evolution_factor"].(float64)
	// Death world at 2 hours is nearly maxed (~0.9998)
	if evo < 0.99 {
		t.Errorf("death-world at 2h should be nearly maxed, got %v", evo)
	}
}

func TestEvolution_UnknownPreset(t *testing.T) {
	// Unknown preset should return an error
	_, code := runReference(t, `{
		"module": "evolution_tracker",
		"game_time_hours": 0.5,
		"pollution_absorbed": 2000,
		"nests_destroyed": 0,
		"preset": "nonexistent"
	}`)
	if code != 1 {
		t.Errorf("expected exit 1 for unknown preset, got %d", code)
	}
}

func TestEvolution_PeacefulPreset(t *testing.T) {
	// Peaceful mode should return zero evolution regardless of inputs
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"game_time_hours": 10,
		"pollution_absorbed": 100000,
		"nests_destroyed": 50,
		"preset": "peaceful"
	}`)

	evo := result["evolution_factor"].(float64)
	if evo != 0 {
		t.Errorf("peaceful mode should have zero evolution, got %v", evo)
	}
}

// ─── Tier Prediction ────────────────────────────────────────────────────────

func TestEvolution_NextTier(t *testing.T) {
	// At ~0.352 evolution, next tier should be big-worm-turret at 0.5
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"game_time_hours": 0.5,
		"pollution_absorbed": 2000,
		"nests_destroyed": 0
	}`)

	nextTier := result["next_tier"].(map[string]any)
	if nextTier["name"] != "big-worm-turret" {
		t.Errorf("expected next tier big-worm-turret, got %v", nextTier["name"])
	}
	if nextTier["threshold"].(float64) != 0.5 {
		t.Errorf("expected threshold 0.5, got %v", nextTier["threshold"])
	}

	currentTier := result["current_tier"].(string)
	if currentTier != "medium-worm-turret" {
		t.Errorf("expected current tier medium-worm-turret, got %v", currentTier)
	}
}

func TestEvolution_PastAllTiers(t *testing.T) {
	// At very high evolution (5h time alone = 0.987), all tiers should be passed
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"game_time_hours": 5,
		"pollution_absorbed": 50000,
		"nests_destroyed": 50
	}`)

	// next_tier should be nil/absent when past all tiers
	if result["next_tier"] != nil {
		t.Errorf("expected nil next_tier when past all tiers, got %v", result["next_tier"])
	}

	currentTier := result["current_tier"].(string)
	if currentTier != "behemoth-worm-turret" {
		t.Errorf("expected current tier behemoth-worm-turret, got %v", currentTier)
	}
}

// ─── Dominant Source ────────────────────────────────────────────────────────

func TestEvolution_DominantSource(t *testing.T) {
	// Time is dominant in the moderate game (0.82 vs 0.009 and 0.010)
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"game_time_hours": 2,
		"pollution_absorbed": 10000,
		"nests_destroyed": 5
	}`)

	dominant := result["dominant_source"].(string)
	if dominant != "time" {
		t.Errorf("expected dominant source 'time', got %q", dominant)
	}
}

// ─── Spawn Weights ──────────────────────────────────────────────────────────

func TestEvolution_SpawnWeights(t *testing.T) {
	// At ~0.352 evolution, small-biter should have some weight, big-biter should be zero
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"game_time_hours": 0.5,
		"pollution_absorbed": 2000,
		"nests_destroyed": 0
	}`)

	weights := result["spawn_weights"].(map[string]any)

	// Small biter: curve [{0, 0.3}, {0.6, 0}] — at 0.352, interpolate
	smallWeight := weights["small-biter"].(float64)
	if smallWeight <= 0 {
		t.Errorf("small-biter should have positive weight at evo 0.352, got %v", smallWeight)
	}

	// Big biter: curve [{0.5, 0}, {1.0, 0.4}] — at 0.352, below threshold so 0
	bigWeight := weights["big-biter"].(float64)
	if bigWeight != 0 {
		t.Errorf("big-biter should have zero weight at evo 0.352, got %v", bigWeight)
	}

	// Behemoth: curve [{0.9, 0}, {1.0, 0.3}] — at 0.352, way below threshold
	behemothWeight := weights["behemoth-biter"].(float64)
	if behemothWeight != 0 {
		t.Errorf("behemoth-biter should have zero weight at evo 0.352, got %v", behemothWeight)
	}
}

// ─── Error Cases ────────────────────────────────────────────────────────────

func TestEvolution_MissingRequiredParams(t *testing.T) {
	_, code := runReference(t, `{
		"module": "evolution_tracker"
	}`)
	if code != 1 {
		t.Errorf("expected exit 1 for missing params, got %d", code)
	}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
	if math.Abs(got-want) > tolerance {
		t.Errorf("%s = %v, want ~%v (±%v)", name, got, want, tolerance)
	}
}
