package main

import (
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

// ─── Per-Surface Evolution ─────────────────────────────────────────────────

func TestEvolution_NauvisFromThreats(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"threats": {
				"nauvis": {
					"pollutant": "pollution",
					"evolution": {
						"factor": 0.8088,
						"time_factor": 0.6458,
						"pollution_factor": 0.3587,
						"kill_factor": 0.0
					},
					"current_pollution": 42000
				}
			},
			"turrets": {"laser-turret": 283, "gun-turret": 10},
			"walls": 5082,
			"enemy_bases_nearby": []
		}
	}`)

	surfaces := result["surfaces"].(map[string]any)
	nauvis := surfaces["nauvis"].(map[string]any)

	assertApprox(t, "evolution_factor", nauvis["evolution_factor"].(float64), 0.8088, 0.0001)

	sources := nauvis["sources"].(map[string]any)
	assertApprox(t, "time source", sources["time"].(float64), 0.6458, 0.0001)
	assertApprox(t, "pollution source", sources["pollution"].(float64), 0.3587, 0.0001)
	assertApprox(t, "kills source", sources["kills"].(float64), 0.0, 0.0001)

	if nauvis["dominant_source"] != "time" {
		t.Errorf("expected dominant source 'time', got %q", nauvis["dominant_source"])
	}

	if nauvis["current_tier"] != "big-worm-turret" {
		t.Errorf("expected current tier big-worm-turret, got %v", nauvis["current_tier"])
	}

	nextTier := nauvis["next_tier"].(map[string]any)
	if nextTier["name"] != "behemoth-worm-turret" {
		t.Errorf("expected next tier behemoth-worm-turret, got %v", nextTier["name"])
	}

	if nauvis["spawner"] != "biter-spawner" {
		t.Errorf("expected spawner biter-spawner, got %v", nauvis["spawner"])
	}

	if nauvis["current_pollution"].(float64) != 42000 {
		t.Errorf("expected current_pollution 42000, got %v", nauvis["current_pollution"])
	}

	weights := nauvis["spawn_weights"].(map[string]any)
	if len(weights) == 0 {
		t.Error("expected non-empty spawn weights")
	}
}

func TestEvolution_MultipleSurfaces(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"threats": {
				"nauvis": {
					"pollutant": "pollution",
					"evolution": {
						"factor": 0.5,
						"time_factor": 0.3,
						"pollution_factor": 0.15,
						"kill_factor": 0.05
					},
					"current_pollution": 10000
				},
				"gleba": {
					"pollutant": "spores",
					"evolution": {
						"factor": 0.2,
						"time_factor": 0.1,
						"pollution_factor": 0.08,
						"kill_factor": 0.02
					},
					"current_pollution": 5000
				}
			},
			"turrets": {"laser-turret": 100},
			"walls": 2000,
			"enemy_bases_nearby": []
		}
	}`)

	surfaces := result["surfaces"].(map[string]any)

	nauvis := surfaces["nauvis"].(map[string]any)
	assertApprox(t, "nauvis evolution", nauvis["evolution_factor"].(float64), 0.5, 0.0001)
	if nauvis["spawner"] != "biter-spawner" {
		t.Errorf("expected nauvis spawner biter-spawner, got %v", nauvis["spawner"])
	}

	gleba := surfaces["gleba"].(map[string]any)
	assertApprox(t, "gleba evolution", gleba["evolution_factor"].(float64), 0.2, 0.0001)
	if gleba["spawner"] != "gleba-spawner" {
		t.Errorf("expected gleba spawner gleba-spawner, got %v", gleba["spawner"])
	}
	if gleba["pollutant"] != "spores" {
		t.Errorf("expected gleba pollutant 'spores', got %v", gleba["pollutant"])
	}
}

// ─── Defense Summary ───────────────────────────────────────────────────────

func TestEvolution_DefenseSummaryPassthrough(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"threats": {
				"nauvis": {
					"pollutant": "pollution",
					"evolution": {"factor": 0.5, "time_factor": 0.3, "pollution_factor": 0.15, "kill_factor": 0.05},
					"current_pollution": 15000
				}
			},
			"turrets": {"laser-turret": 100, "gun-turret": 20, "flamethrower-turret": 5},
			"walls": 2000,
			"enemy_bases_nearby": [
				{"distance": 150, "direction": "east", "type": "biter-spawner"},
				{"distance": 300, "direction": "south", "type": "spitter-spawner"}
			]
		}
	}`)

	defenses := result["defenses"].(map[string]any)

	turrets := defenses["turrets"].(map[string]any)
	if turrets["laser-turret"].(float64) != 100 {
		t.Errorf("expected 100 laser turrets, got %v", turrets["laser-turret"])
	}

	if defenses["walls"].(float64) != 2000 {
		t.Errorf("expected 2000 walls, got %v", defenses["walls"])
	}

	bases := defenses["enemy_bases_nearby"].([]any)
	if len(bases) != 2 {
		t.Errorf("expected 2 enemy bases, got %d", len(bases))
	}
}

// ─── Zero / Edge Cases ─────────────────────────────────────────────────────

func TestEvolution_ZeroEvolution(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"threats": {
				"nauvis": {
					"pollutant": "pollution",
					"evolution": {"factor": 0, "time_factor": 0, "pollution_factor": 0, "kill_factor": 0},
					"current_pollution": 0
				}
			},
			"turrets": {},
			"walls": 0,
			"enemy_bases_nearby": []
		}
	}`)

	surfaces := result["surfaces"].(map[string]any)
	nauvis := surfaces["nauvis"].(map[string]any)

	if nauvis["evolution_factor"].(float64) != 0 {
		t.Errorf("expected zero evolution, got %v", nauvis["evolution_factor"])
	}

	if nauvis["current_tier"] != "none" {
		t.Errorf("expected tier 'none', got %v", nauvis["current_tier"])
	}

	nextTier := nauvis["next_tier"].(map[string]any)
	if nextTier["name"] != "medium-worm-turret" {
		t.Errorf("expected next tier medium-worm-turret, got %v", nextTier["name"])
	}
}

func TestEvolution_PastAllTiers(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"threats": {
				"nauvis": {
					"pollutant": "pollution",
					"evolution": {"factor": 0.95, "time_factor": 0.4, "pollution_factor": 0.5, "kill_factor": 0.3},
					"current_pollution": 50000
				}
			},
			"turrets": {"artillery-turret": 4},
			"walls": 10000,
			"enemy_bases_nearby": []
		}
	}`)

	surfaces := result["surfaces"].(map[string]any)
	nauvis := surfaces["nauvis"].(map[string]any)

	if nauvis["current_tier"] != "behemoth-worm-turret" {
		t.Errorf("expected current tier behemoth-worm-turret, got %v", nauvis["current_tier"])
	}

	if nauvis["next_tier"] != nil {
		t.Errorf("expected nil next_tier when past all tiers, got %v", nauvis["next_tier"])
	}

	weights := nauvis["spawn_weights"].(map[string]any)
	behemothWeight := weights["behemoth-biter"].(float64)
	if behemothWeight <= 0 {
		t.Errorf("behemoth-biter should have positive weight at evo 0.95, got %v", behemothWeight)
	}
}

func TestEvolution_NoThreats(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"threats": {},
			"turrets": {"laser-turret": 10},
			"walls": 500,
			"enemy_bases_nearby": []
		}
	}`)

	surfaces := result["surfaces"].(map[string]any)
	if len(surfaces) != 0 {
		t.Errorf("expected empty surfaces map, got %d entries", len(surfaces))
	}

	if result["note"] == nil {
		t.Error("expected a note explaining no threats")
	}
}

// ─── Dominant Source ───────────────────────────────────────────────────────

func TestEvolution_DominantSourcePollution(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"threats": {
				"nauvis": {
					"pollutant": "pollution",
					"evolution": {"factor": 0.6, "time_factor": 0.1, "pollution_factor": 0.5, "kill_factor": 0.2},
					"current_pollution": 30000
				}
			},
			"turrets": {},
			"walls": 0,
			"enemy_bases_nearby": []
		}
	}`)

	surfaces := result["surfaces"].(map[string]any)
	nauvis := surfaces["nauvis"].(map[string]any)
	if nauvis["dominant_source"] != "pollution" {
		t.Errorf("expected dominant source 'pollution', got %q", nauvis["dominant_source"])
	}
}

func TestEvolution_DominantSourceKills(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"threats": {
				"nauvis": {
					"pollutant": "pollution",
					"evolution": {"factor": 0.4, "time_factor": 0.05, "pollution_factor": 0.1, "kill_factor": 0.35},
					"current_pollution": 0
				}
			},
			"turrets": {},
			"walls": 0,
			"enemy_bases_nearby": []
		}
	}`)

	surfaces := result["surfaces"].(map[string]any)
	nauvis := surfaces["nauvis"].(map[string]any)
	if nauvis["dominant_source"] != "kills" {
		t.Errorf("expected dominant source 'kills', got %q", nauvis["dominant_source"])
	}
}

// ─── Spawn Weights ─────────────────────────────────────────────────────────

func TestEvolution_SpawnWeightsEarlyGame(t *testing.T) {
	result := runEvolution(t, `{
		"module": "evolution_tracker",
		"defenses": {
			"threats": {
				"nauvis": {
					"pollutant": "pollution",
					"evolution": {"factor": 0.35, "time_factor": 0.2, "pollution_factor": 0.1, "kill_factor": 0.05},
					"current_pollution": 5000
				}
			},
			"turrets": {},
			"walls": 0,
			"enemy_bases_nearby": []
		}
	}`)

	surfaces := result["surfaces"].(map[string]any)
	nauvis := surfaces["nauvis"].(map[string]any)
	weights := nauvis["spawn_weights"].(map[string]any)

	smallWeight := weights["small-biter"].(float64)
	if smallWeight <= 0 {
		t.Errorf("small-biter should have positive weight at evo 0.35, got %v", smallWeight)
	}

	bigWeight := weights["big-biter"].(float64)
	if bigWeight != 0 {
		t.Errorf("big-biter should have zero weight at evo 0.35, got %v", bigWeight)
	}

	behemothWeight := weights["behemoth-biter"].(float64)
	if behemothWeight != 0 {
		t.Errorf("behemoth-biter should have zero weight at evo 0.35, got %v", behemothWeight)
	}
}

// ─── Interpolation Edge Cases ─────────────────────────────────────────────

func TestInterpolateWeight_EmptyCurve(t *testing.T) {
	w := interpolateWeight(nil, 0.5)
	if w != 0 {
		t.Errorf("expected 0 for empty curve, got %v", w)
	}
}

func TestInterpolateWeight_SinglePoint(t *testing.T) {
	curve := []data.SpawnWeight{{Evolution: 0.5, Weight: 0.3}}
	// Before the point
	if w := interpolateWeight(curve, 0.2); w != 0.3 {
		t.Errorf("before single point: expected 0.3, got %v", w)
	}
	// At the point
	if w := interpolateWeight(curve, 0.5); w != 0.3 {
		t.Errorf("at single point: expected 0.3, got %v", w)
	}
	// After the point
	if w := interpolateWeight(curve, 0.8); w != 0.3 {
		t.Errorf("after single point: expected 0.3, got %v", w)
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
