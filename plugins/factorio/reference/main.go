// Factorio reference module: serves computed game reference data.
// Runs server-side in Cloudflare Worker via WASI shim.
//
// Contract: JSON query on stdin, ndjson result on stdout.
// Empty query {} returns the module schema (self-describing).
//
// Build: GOOS=wasip1 GOARCH=wasm go build -o reference.wasm ./plugins/factorio/reference
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

	module, _ := query["module"].(string)
	switch module {
	case "recipe_lookup":
		handleRecipeLookup(enc, query)
	case "ratio_calculator":
		handleRatioCalculator(enc, query)
	case "oil_balancer":
		handleOilBalancer(enc, query)
	case "tech_tree_navigator":
		handleTechTreeNavigator(enc, query)
	case "evolution_tracker":
		handleEvolutionTracker(enc, query)
	case "power_calculator":
		handlePowerCalculator(enc, query)
	case "blueprint_analyzer":
		handleBlueprintAnalyzer(enc, query)
	case "production_flow":
		handleProductionFlow(enc, query)
	default:
		writeError(enc, "unknown_module", "unknown module: "+module)
		os.Exit(1)
	}
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

func stringParam(query map[string]any, key string) string {
	v, _ := query[key].(string)
	return v
}

func schema() map[string]any {
	return map[string]any{
		"modules": map[string]any{
			"recipe_lookup": map[string]any{
				"name":        "Recipe & Item Lookup",
				"description": "Look up any item, recipe, entity, or technology by exact name. Supports reverse lookups.",
				"parameters": map[string]any{
					"name":    map[string]any{"type": "string", "description": "Recipe or item name to look up (e.g. 'electronic-circuit')"},
					"usage":   map[string]any{"type": "string", "description": "Find all recipes that use this item as an ingredient (e.g. 'copper-cable')"},
					"product": map[string]any{"type": "string", "description": "Find all recipes that produce this item (e.g. 'plastic-bar')"},
					"machine": map[string]any{"type": "string", "description": "Look up a crafting machine's stats and categories (e.g. 'assembling-machine-3')"},
					"tech":    map[string]any{"type": "string", "description": "Look up a technology's prerequisites, costs, and unlocked recipes (e.g. 'advanced-oil-processing')"},
				},
			},
			"oil_balancer": map[string]any{
				"name":        "Oil Processing Balancer",
				"description": "Compute optimal refinery and cracking plant counts for target fluid production rates. Supports all processing types including advanced oil, basic oil, coal liquefaction, and simple coal liquefaction. Pass save_id to compare against actual factory.",
				"parameters": map[string]any{
					"processing_type": map[string]any{"type": "string", "description": "Oil processing recipe: 'advanced-oil-processing', 'basic-oil-processing', 'coal-liquefaction', or 'simple-coal-liquefaction'", "required": true},
					"targets":         map[string]any{"type": "object", "description": "Map of fluid name to target rate in units per second (e.g. {\"petroleum-gas\": 100, \"lubricant\": 10})", "required": true},
					"modules":         map[string]any{"type": "array", "description": "Module names in each machine slot (e.g. ['productivity-module-3', 'productivity-module-3', 'productivity-module-3'])"},
					"beacon_count":    map[string]any{"type": "integer", "description": "Number of beacons affecting each machine", "default": 0},
					"beacon_modules":  map[string]any{"type": "array", "description": "Module names in each beacon (e.g. ['speed-module-3', 'speed-module-3'])"},
					"existing_setup":  map[string]any{"type": "object", "description": "Player's existing machines by recipe (injected from save data when save_id is present). Contains by_recipe, by_type, beacon_count."},
					"actual_flow":     map[string]any{"type": "object", "description": "Player's actual fluid production/consumption rates (injected from save data when save_id is present). Contains items, fluids maps."},
				},
			},
			"evolution_tracker": map[string]any{
				"name":        "Evolution & Threat Tracker",
				"description": "Analyze biter evolution and defense posture from save data. Returns evolution factor with source breakdown, enemy tier prediction, spawn weight distribution, and defense summary including turret counts, walls, and nearby enemy bases.",
				"parameters": map[string]any{
					"defenses": map[string]any{"type": "object", "description": "Defenses section from save data (injected via save_id). Contains evolution factor, turret counts, walls, enemy bases, and pollution.", "required": true},
				},
			},
			"tech_tree_navigator": map[string]any{
				"name":        "Tech Tree Navigator",
				"description": "Traverse technology prerequisite chains with total science pack costs. Given a target technology, compute the remaining research path and cost. With save data, returns only total time and materials needed.",
				"parameters": map[string]any{
					"target":             map[string]any{"type": "string", "description": "Target technology name (e.g. 'nuclear-power', 'spidertron')", "required": true},
					"completed_research": map[string]any{"type": "object", "description": "Completed research data from save (injected via save_id). Contains completed tech name list."},
				},
			},
			"power_calculator": map[string]any{
				"name":        "Power Calculator",
				"description": "Compute entity counts for power generation setups: steam (boiler chain), solar (panel + accumulator), and nuclear (reactor + heat exchanger + turbine). Supports mixed generation and comparison against existing factory power.",
				"parameters": map[string]any{
					"target_mw": map[string]any{"type": "number", "description": "Target power generation in megawatts", "required": true},
					"sources":   map[string]any{"type": "array", "description": "Array of power sources. Each has 'type' ('steam', 'solar', 'nuclear'). Steam: optional 'fuel' (default 'coal'). Nuclear: optional 'layout' (default '2x2'). At most one source may omit 'mw' to fill the remainder.", "required": true},
				},
			},
			"blueprint_analyzer": map[string]any{
				"name":        "Blueprint Analyzer",
				"description": "Decode a Factorio blueprint string and analyze its contents: entity breakdown, production rates with beacon effects, and module configuration audit.",
				"parameters": map[string]any{
					"blueprint_string": map[string]any{"type": "string", "description": "Factorio blueprint string (starts with '0', base64+zlib encoded)", "required": true},
				},
			},
			"production_flow": map[string]any{
				"name":        "Factory Health Diagnosis",
				"description": "Diagnose factory health by cross-referencing production rates with recipe, machine, and technology data. Computes root cause chains, bottleneck classification, machine gaps, surplus-to-deficit connections, and tech unlock recommendations. Pass save_id to analyze your factory.",
				"parameters": map[string]any{
					"flow_data":          map[string]any{"type": "object", "description": "Production flow data from save (injected via save_id). Contains items/fluids with produced/consumed rates.", "required": true},
					"existing_machines":  map[string]any{"type": "object", "description": "Existing machine counts by recipe (injected via save_id). Contains by_recipe, by_type maps."},
					"completed_research": map[string]any{"type": "object", "description": "Completed research data from save (injected via save_id). Contains completed tech name list."},
				},
			},
			"ratio_calculator": map[string]any{
				"name":        "Production Ratio Calculator",
				"description": "Compute the full production dependency tree for a target item and rate, including machine counts, belt requirements, and raw material totals.",
				"parameters": map[string]any{
					"target_item":      map[string]any{"type": "string", "description": "Item to produce (e.g. 'electronic-circuit')", "required": true},
					"target_rate":      map[string]any{"type": "number", "description": "Target production rate in items per minute", "default": 60},
					"recipe":           map[string]any{"type": "string", "description": "Explicit recipe name for the target item. Required when multiple recipes produce the same item (e.g. 'solid-fuel-from-light-oil'). Use recipe_lookup with product query to find options."},
					"recipe_overrides": map[string]any{"type": "object", "description": "Map of item → recipe name for intermediate products with multiple recipes (e.g. {\"solid-fuel\": \"solid-fuel-from-light-oil\", \"copper-plate\": \"casting-copper\"})"},
					"assembler_tier":   map[string]any{"type": "string", "description": "Preferred assembler (e.g. 'assembling-machine-3')", "default": "assembling-machine-2"},
					"modules":          map[string]any{"type": "array", "description": "Module names in machine slots (e.g. ['productivity-module-3', 'productivity-module-3'])"},
					"beacon_count":     map[string]any{"type": "integer", "description": "Number of beacons affecting each machine", "default": 0},
					"beacon_modules":   map[string]any{"type": "array", "description": "Module names in each beacon (e.g. ['speed-module-3', 'speed-module-3'])"},
				},
			},
		},
	}
}
