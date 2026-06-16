// Satisfactory reference module: serves computed game reference data from
// tables generated out of the game-shipped Docs.json.
// Runs server-side in a Cloudflare Worker via WASI shim.
//
// Contract: JSON query on stdin, ndjson result on stdout.
// Empty query {} returns the module schema (self-describing).
//
// Build: GOOS=wasip1 GOARCH=wasm go build -o reference.wasm ./reference
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

func main() {
	enc := json.NewEncoder(os.Stdout)

	// Defense in depth: module handlers must answer with an ndjson error
	// instead of crashing, even on panics from unexpected query shapes.
	defer func() {
		if r := recover(); r != nil {
			writeError(enc, "internal_error", fmt.Sprintf("module panic: %v", r))
			os.Exit(1)
		}
	}()

	input, err := io.ReadAll(os.Stdin)
	if err != nil {
		writeError(enc, "read_error", "failed to read stdin: "+err.Error())
		os.Exit(1)
	}

	var query map[string]any
	if err := json.Unmarshal(input, &query); err != nil {
		writeError(enc, "parse_error", "invalid JSON query: "+err.Error())
		os.Exit(1)
	}

	if len(query) == 0 {
		writeResult(enc, schema())
		return
	}

	module := stringParam(query, "module")
	switch module {
	case "recipe_lookup":
		result, err := recipeLookup(query)
		if err != nil {
			writeError(enc, "invalid_query", err.Error())
			os.Exit(1)
		}
		writeResult(enc, result)
	case "production_planner":
		result, err := productionPlanner(query)
		if err != nil {
			writeError(enc, "invalid_query", err.Error())
			os.Exit(1)
		}
		writeResult(enc, result)
	case "milestone_navigator":
		result, err := milestoneNavigator(query)
		if err != nil {
			writeError(enc, "invalid_query", err.Error())
			os.Exit(1)
		}
		writeResult(enc, result)
	case "power_calculator":
		result, err := powerCalculator(query)
		if err != nil {
			writeError(enc, "invalid_query", err.Error())
			os.Exit(1)
		}
		writeResult(enc, result)
	case "space_elevator":
		result, err := spaceElevator(query)
		if err != nil {
			writeError(enc, "invalid_query", err.Error())
			os.Exit(1)
		}
		writeResult(enc, result)
	case "hard_drive_tiers":
		result, err := hardDriveTiers(query)
		if err != nil {
			writeError(enc, "invalid_query", err.Error())
			os.Exit(1)
		}
		writeResult(enc, result)
	case "building_reference":
		result, err := buildingReference(query)
		if err != nil {
			writeError(enc, "invalid_query", err.Error())
			os.Exit(1)
		}
		writeResult(enc, result)
	default:
		writeError(enc, "unknown_module", "unknown module: "+module)
		os.Exit(1)
	}
}

// stringParam reads an optional string parameter from a query.
func stringParam(query map[string]any, key string) string {
	v, ok := query[key].(string)
	if !ok {
		return ""
	}
	return v
}

func writeResult(enc *json.Encoder, data any) {
	if err := enc.Encode(map[string]any{
		"type": "result",
		"data": data,
	}); err != nil {
		os.Exit(1)
	}
}

func writeError(enc *json.Encoder, errType, message string) {
	if err := enc.Encode(map[string]any{
		"type":      "error",
		"errorType": errType,
		"message":   message,
	}); err != nil {
		os.Exit(1)
	}
}

func schema() map[string]any {
	return map[string]any{
		"modules": map[string]any{
			"recipe_lookup": map[string]any{
				"name": "Recipe & Item Lookup",
				"description": "Look up any item, recipe, or production building by name (fuzzy) or class. " +
					"Returns exact ingredients, products, per-minute rates at 100% clock, craft duration, " +
					"buildings, alternate-recipe flags, and unlock tiers.",
				"parameters": map[string]any{
					"item": map[string]any{
						"type":        "string",
						"description": "Item name or class — returns the item plus recipes producing and consuming it (e.g. 'Iron Plate')",
					},
					"recipe": map[string]any{
						"type":        "string",
						"description": "Recipe name or class — returns ingredients, products, rates, buildings (e.g. 'Pure Aluminum Ingot')",
					},
					"building": map[string]any{
						"type":        "string",
						"description": "Production building name — returns power, fuels, extraction rate, and runnable recipes (e.g. 'Constructor')",
					},
				},
			},
			"milestone_navigator": map[string]any{
				"name": "Milestone Navigator",
				"description": "Tier and milestone progression: list a tier's milestones with exact costs and " +
					"recipe unlocks, look up a milestone by name, or (with save_id) compute every remaining " +
					"milestone to a target tier with cumulative item costs.",
				"parameters": map[string]any{
					"tier": map[string]any{
						"type": "number", "description": "List this tier's milestones with costs and unlocks",
					},
					"milestone": map[string]any{
						"type": "string", "description": "Milestone name or class to look up (e.g. 'Oil Processing')",
					},
					"to_tier": map[string]any{
						"type": "number",
						"description": "Compute remaining milestones and cumulative costs up to this " +
							"tier (pass save_id to exclude already-purchased ones)",
					},
					"progression": map[string]any{
						"type": "object", "description": "Player progression (injected when save_id is present)",
					},
				},
			},
			"power_calculator": map[string]any{
				"name": "Power Calculator",
				"description": "Size a generator farm for a target megawatt figure: generator counts, fuel burn " +
					"per minute for every accepted fuel, supplemental water, and nuclear waste output.",
				"parameters": map[string]any{
					"target_mw": map[string]any{
						"type": "number", "required": true, "description": "Target power output in MW",
					},
					"generator": map[string]any{
						"type": "string", "description": "Restrict to one generator type (e.g. 'Coal', 'Nuclear')",
					},
				},
			},
			"space_elevator": map[string]any{
				"name": "Space Elevator",
				"description": "Project Assembly phase requirements: the exact parts and quantities each " +
					"of the 5 phases needs, the recipe that makes each part, and the tiers each phase " +
					"unlocks. Pass save_id to see the player's current phase, what remains, and to apply " +
					"the session's Space Parts Cost Multiplier. Use for 'what does the space elevator need' " +
					"and endgame-goal questions.",
				"parameters": map[string]any{
					"phase": map[string]any{
						"type":        "number",
						"description": "Describe one phase (1-5); omit to list all phases",
					},
					"progression": map[string]any{
						"type":        "object",
						"description": "Player progression (injected when save_id is present) — current space elevator phase",
					},
					"game_overview": map[string]any{
						"type": "object",
						"description": "Session metadata (injected when save_id is present) — " +
							"gameMode spacePartsCostMultiplier is applied to phase amounts automatically",
					},
				},
			},
			"hard_drive_tiers": map[string]any{
				"name": "Hard Drive Tiers",
				"description": "Which alternate recipes (the random unlocks from hard drives at the MAM) " +
					"are worth taking, ranked by linear optimization for the current patch. Every recipe " +
					"carries two tiers — effort (fewer/simpler buildings) and resources (less raw extraction) " +
					"— with the modeled whole-factory improvement and per-metric deltas. Pass save_id to flag " +
					"which the player has unlocked and recommend the best ones they haven't.",
				"parameters": map[string]any{
					"recipe": map[string]any{
						"type":        "string",
						"description": "Alternate recipe name or class — returns both tiers, deltas, and ingredients",
					},
					"item": map[string]any{
						"type":        "string",
						"description": "Item name — lists its alternate recipes ranked best-first (e.g. 'Iron Ingot')",
					},
					"tier": map[string]any{
						"type":        "string",
						"description": "List recipes in a tier letter (S, A, B, C, D, F)",
					},
					"ranking": map[string]any{
						"type":        "string",
						"description": "'effort' (default) or 'resources' — which ranking the tier filter uses",
					},
					"progression": map[string]any{
						"type":        "object",
						"description": "Player progression (injected when save_id is present) — unlocked alternate schematics",
					},
				},
			},
			"building_reference": map[string]any{
				"name": "Building Reference",
				"description": "The game's own reference card for any placeable building, straight from the " +
					"shipped game data — use PROACTIVELY whenever the player asks how a building works, what it " +
					"does, its footprint/dimensions, build cost, power draw, throughput, or unlock tier. Covers " +
					"every buildable: machines, generators, belts, pipes, foundations, blueprint designers, and " +
					"the Dimensional Depot. Returns the in-game description verbatim plus structured stats. Works " +
					"with no save connected. Prefer this over recalling building facts from memory — they drift " +
					"between patches.",
				"parameters": map[string]any{
					"building": map[string]any{
						"type": "string",
						"description": "Building name or class (fuzzy) — returns its description, dimensions, " +
							"build cost, key stats, and unlock tier (e.g. 'Dimensional Depot', 'Blueprint Designer Mk.3', 'Manufacturer')",
					},
					"category": map[string]any{
						"type":        "string",
						"description": "List buildings in a category: production, extraction, power, logistics, structure, special, or other",
					},
				},
			},
			"production_planner": map[string]any{
				"name": "Production Planner",
				"description": "Plan a full production chain: target item + rate per minute returns machines per " +
					"recipe (exact and rounded up), raw resource totals, byproducts, and total power draw. " +
					"Pass save_id to list YOUR unlocked alternate recipes per step and credit machines you " +
					"already have. Use the recipes parameter to re-plan with a specific (alternate) recipe.",
				"parameters": map[string]any{
					"item": map[string]any{
						"type": "string", "required": true,
						"description": "Target item name or class (e.g. 'Reinforced Iron Plate')",
					},
					"rate": map[string]any{
						"type": "number", "required": true,
						"description": "Target output in items per minute (m3 per minute for fluids)",
					},
					"use_alternates": map[string]any{
						"type":        "string",
						"description": "'none' (default, base recipes only), 'unlocked' (use save data), or 'all'",
					},
					"recipes": map[string]any{
						"type":        "object",
						"description": "Force specific recipes: map of item class to recipe class (e.g. {\"Desc_IronPlate_C\": \"Recipe_Alternate_CoatedIronPlate_C\"})",
					},
					"progression": map[string]any{
						"type":        "object",
						"description": "Player progression (injected from save data when save_id is present) — unlocked alternate schematics",
					},
					"production_summary": map[string]any{
						"type":        "object",
						"description": "Player's machines per recipe (injected from save data when save_id is present)",
					},
					"game_overview": map[string]any{
						"type": "object",
						"description": "Session metadata (injected from save data when save_id is present) — " +
							"gameMode economy multipliers are applied to the plan automatically",
					},
				},
			},
		},
	}
}
