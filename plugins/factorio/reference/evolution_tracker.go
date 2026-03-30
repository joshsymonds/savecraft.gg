package main

import (
	"encoding/json"
	"math"
	"os"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

func handleEvolutionTracker(enc *json.Encoder, query map[string]any) {
	// All three inputs are required (can be zero)
	gameTimeHours, hasTime := query["game_time_hours"].(float64)
	pollutionAbsorbed, hasPollution := query["pollution_absorbed"].(float64)
	nestsDestroyed, hasKills := query["nests_destroyed"].(float64)

	if !hasTime && !hasPollution && !hasKills {
		writeError(enc, "missing_param", "evolution_tracker requires at least one of: game_time_hours, pollution_absorbed, nests_destroyed")
		os.Exit(1)
	}

	// Resolve evolution rates (base or preset override)
	timeFactor := data.BaseEvolution.TimeFactor
	pollutionFactor := data.BaseEvolution.PollutionFactor
	destroyFactor := data.BaseEvolution.DestroyFactor

	if preset := stringParam(query, "preset"); preset != "" {
		if preset == "peaceful" {
			// Peaceful mode disables evolution entirely
			writeResult(enc, map[string]any{
				"evolution_factor":         0,
				"sources":                  map[string]any{"time": 0, "pollution": 0, "kills": 0},
				"dominant_source":          "none",
				"current_tier":             "none",
				"previous_tier_threshold":  0,
				"next_tier":                nil,
				"spawn_weights":            computeSpawnWeights(0, "biter-spawner"),
				"preset":                   "peaceful",
				"note":                     "Peaceful mode disables enemy evolution entirely.",
			})
			return
		}
		if p, ok := data.DifficultyPresets[preset]; ok {
			if p.TimeFactor != 0 {
				timeFactor = p.TimeFactor
			}
			if p.PollutionFactor != 0 {
				pollutionFactor = p.PollutionFactor
			}
			if p.DestroyFactor != 0 {
				destroyFactor = p.DestroyFactor
			}
		} else {
			writeError(enc, "unknown_preset", "unknown difficulty preset: "+preset+". Valid presets: death-world, death-world-marathon, rail-world, peaceful")
			os.Exit(1)
		}
	}

	// Compute per-source evolution
	// Formula: evo = 1 - (1 - factor)^N
	// For time: N = hours * 3600 * 60 (ticks)
	// For pollution: N = total pollution absorbed
	// For kills: N = nests destroyed
	ticks := gameTimeHours * 3600 * 60
	evoTime := computeEvolution(timeFactor, ticks)
	evoPollution := computeEvolution(pollutionFactor, pollutionAbsorbed)
	evoKills := computeEvolution(destroyFactor, nestsDestroyed)

	// Combined: evo = 1 - (1-evo_time) * (1-evo_pollution) * (1-evo_kills)
	combined := 1 - (1-evoTime)*(1-evoPollution)*(1-evoKills)

	// Determine dominant source
	dominant := "time"
	maxSource := evoTime
	if evoPollution > maxSource {
		dominant = "pollution"
		maxSource = evoPollution
	}
	if evoKills > maxSource {
		dominant = "kills"
	}

	// Determine current and next tier
	var currentTier string
	var previousTierThreshold float64
	var nextTier map[string]any
	for _, tier := range data.EnemyTiers {
		if combined >= tier.Threshold {
			currentTier = tier.Name
			previousTierThreshold = tier.Threshold
		} else {
			nextTier = map[string]any{
				"name":      tier.Name,
				"threshold": tier.Threshold,
			}
			break
		}
	}
	if currentTier == "" && len(data.EnemyTiers) > 0 {
		currentTier = "none"
	}

	// Compute spawn weights for biter-spawner at current evolution
	spawnWeights := computeSpawnWeights(combined, "biter-spawner")

	result := map[string]any{
		"evolution_factor": roundTo(combined, 6),
		"sources": map[string]any{
			"time":      roundTo(evoTime, 6),
			"pollution": roundTo(evoPollution, 6),
			"kills":     roundTo(evoKills, 6),
		},
		"dominant_source": dominant,
		"current_tier":             currentTier,
		"previous_tier_threshold":  previousTierThreshold,
		"next_tier":                nextTier,
		"spawn_weights":   spawnWeights,
	}

	writeResult(enc, result)
}

// computeEvolution calculates evo = 1 - (1 - factor)^n using log to avoid
// precision issues with very small factors raised to large powers.
func computeEvolution(factor, n float64) float64 {
	if factor <= 0 || n <= 0 {
		return 0
	}
	// 1 - (1-factor)^n = 1 - exp(n * ln(1-factor))
	return 1 - math.Exp(n*math.Log(1-factor))
}

// computeSpawnWeights interpolates spawn weights for each unit in a spawner
// at the given evolution factor.
func computeSpawnWeights(evolution float64, spawnerName string) map[string]float64 {
	spawner, ok := data.Spawners[spawnerName]
	if !ok {
		return nil
	}

	weights := make(map[string]float64)
	for _, unit := range spawner.Units {
		w := interpolateWeight(unit.Weights, evolution)
		weights[unit.Name] = roundTo(w, 4)
	}
	return weights
}

// interpolateWeight does piecewise-linear interpolation on a spawn weight curve.
func interpolateWeight(curve []data.SpawnWeight, evolution float64) float64 {
	if len(curve) == 0 {
		return 0
	}

	// Before first point
	if evolution <= curve[0].Evolution {
		return curve[0].Weight
	}

	// After last point
	if evolution >= curve[len(curve)-1].Evolution {
		return curve[len(curve)-1].Weight
	}

	// Find surrounding points and interpolate
	for i := 1; i < len(curve); i++ {
		if evolution <= curve[i].Evolution {
			prev := curve[i-1]
			next := curve[i]
			t := (evolution - prev.Evolution) / (next.Evolution - prev.Evolution)
			return prev.Weight + t*(next.Weight-prev.Weight)
		}
	}

	return curve[len(curve)-1].Weight
}
