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
		},
	}
}
