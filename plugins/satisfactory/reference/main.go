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
	"io"
	"os"
)

func main() {
	enc := json.NewEncoder(os.Stdout)

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
				},
			},
		},
	}
}
