package main

import (
	"encoding/json"
	"os"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

// evolutionQuery is the typed input for the evolution tracker module.
type evolutionQuery struct {
	Defenses *defensesSection `json:"defenses"`
}

// defensesSection mirrors the defenses section from the Factorio mod's control.lua.
type defensesSection struct {
	Threats          map[string]surfaceThreat `json:"threats"`
	Turrets          map[string]int           `json:"turrets"`
	Walls            int                      `json:"walls"`
	EnemyBasesNearby any                      `json:"enemy_bases_nearby"`
}

// surfaceThreat holds evolution and pollution data for a single surface.
type surfaceThreat struct {
	Pollutant string `json:"pollutant"`
	Evolution struct {
		Factor          float64 `json:"factor"`
		TimeFactor      float64 `json:"time_factor"`
		PollutionFactor float64 `json:"pollution_factor"`
		KillFactor      float64 `json:"kill_factor"`
	} `json:"evolution"`
	CurrentPollution int `json:"current_pollution"`
}

func handleEvolutionTracker(enc *json.Encoder, query map[string]any) {
	raw, _ := json.Marshal(query)
	var q evolutionQuery
	if err := json.Unmarshal(raw, &q); err != nil {
		writeError(enc, "parse_error", "failed to parse query: "+err.Error())
		os.Exit(1)
	}

	if q.Defenses == nil {
		writeError(enc, "missing_section", "evolution_tracker requires the defenses section (pass save_id to provide it)")
		os.Exit(1)
	}

	defenses := q.Defenses

	if len(defenses.Threats) == 0 {
		writeResult(enc, map[string]any{
			"surfaces": map[string]any{},
			"defenses": map[string]any{
				"turrets":            defenses.Turrets,
				"walls":              defenses.Walls,
				"enemy_bases_nearby": defenses.EnemyBasesNearby,
			},
			"note": "No surfaces with active threats (all surfaces lack a pollutant type).",
		})
		return
	}

	// Build per-surface analysis
	surfaces := make(map[string]any, len(defenses.Threats))
	for surfaceName, threat := range defenses.Threats {
		combined := threat.Evolution.Factor
		evoTime := threat.Evolution.TimeFactor
		evoPollution := threat.Evolution.PollutionFactor
		evoKills := threat.Evolution.KillFactor

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

		// Pick spawner based on pollutant type
		spawnerName := "biter-spawner"
		if threat.Pollutant == "spores" {
			spawnerName = "gleba-spawner"
		}
		spawnWeights := computeSpawnWeights(combined, spawnerName)

		surfaces[surfaceName] = map[string]any{
			"pollutant":        threat.Pollutant,
			"evolution_factor": roundTo(combined, 6),
			"sources": map[string]any{
				"time":      roundTo(evoTime, 6),
				"pollution": roundTo(evoPollution, 6),
				"kills":     roundTo(evoKills, 6),
			},
			"dominant_source":         dominant,
			"current_tier":            currentTier,
			"previous_tier_threshold": previousTierThreshold,
			"next_tier":               nextTier,
			"spawner":                 spawnerName,
			"spawn_weights":           spawnWeights,
			"current_pollution":       threat.CurrentPollution,
		}
	}

	result := map[string]any{
		"surfaces": surfaces,
		"defenses": map[string]any{
			"turrets":            defenses.Turrets,
			"walls":              defenses.Walls,
			"enemy_bases_nearby": defenses.EnemyBasesNearby,
		},
	}

	writeResult(enc, result)
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
