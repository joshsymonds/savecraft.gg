// Songs of Syx reference module: serves game reference data from tables
// generated out of the game-shipped data files. Runs server-side in a
// Cloudflare Worker via the WASI shim.
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

func main() { os.Exit(run()) }

// run reads one JSON query from stdin and writes one ndjson line to stdout,
// returning the process exit code. A recovered panic still answers with an
// ndjson error rather than crashing.
func run() (code int) {
	enc := json.NewEncoder(os.Stdout)

	defer func() {
		if r := recover(); r != nil {
			writeError(enc, "internal_error", fmt.Sprintf("module panic: %v", r))
			code = 1
		}
	}()

	input, err := io.ReadAll(os.Stdin)
	if err != nil {
		writeError(enc, "read_error", "failed to read stdin: "+err.Error())
		return 1
	}

	var query map[string]any
	if err = json.Unmarshal(input, &query); err != nil {
		writeError(enc, "parse_error", "invalid JSON query: "+err.Error())
		return 1
	}

	if len(query) == 0 {
		writeResult(enc, schema())
		return 0
	}

	module := stringParam(query, "module")
	switch module {
	case "guide":
		result, gerr := guideModule(query)
		if gerr != nil {
			writeError(enc, "invalid_query", gerr.Error())
			return 1
		}
		writeResult(enc, result)
	case "rooms":
		result, rerr := roomsModule(query)
		if rerr != nil {
			writeError(enc, "invalid_query", rerr.Error())
			return 1
		}
		writeResult(enc, result)
	case "resources":
		result, reserr := resourcesModule(query)
		if reserr != nil {
			writeError(enc, "invalid_query", reserr.Error())
			return 1
		}
		writeResult(enc, result)
	case "races":
		result, raerr := racesModule(query)
		if raerr != nil {
			writeError(enc, "invalid_query", raerr.Error())
			return 1
		}
		writeResult(enc, result)
	default:
		writeError(enc, "unknown_module", "unknown module: "+module)
		return 1
	}
	return 0
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

// schema is the self-describing reference surface returned for an empty query.
// cmd/plugin-manifest reads data.modules.<id>.parameters from this to populate
// the manifest.
func schema() map[string]any {
	return map[string]any{
		"modules": map[string]any{
			"guide": map[string]any{
				"name": "Mechanics Guide",
				"description": "The game's own in-game mechanics guide (GUIDE.txt + ROOMS.txt), " +
					"verbatim and version-matched. Retrieve and cite this before answering how a " +
					"system works.",
				"parameters": map[string]any{
					"op": map[string]any{
						"type":        "string",
						"description": "'index' (default) returns the table of contents; 'article' returns one article's full text; 'search' returns matching articles.",
					},
					"key": map[string]any{
						"type":        "string",
						"description": "For op 'article': the article's LINK_KEY from the index (case-insensitive), e.g. 'STANDINGS'.",
					},
					"q": map[string]any{
						"type":        "string",
						"description": "For op 'search': a keyword matched against article titles and bodies, e.g. 'happiness'.",
					},
				},
			},
			"rooms": map[string]any{
				"name": "Room & Building Lookup",
				"description": "Look up a Songs of Syx room/building's base-tier stats and description: " +
					"build cost, what it produces and consumes, whether it provides a service, and the " +
					"farmed crop for farms. Use for any 'what does X cost / produce / consume' question.",
				"parameters": map[string]any{
					"room": map[string]any{
						"type":        "string",
						"description": "A building ID or name (case-insensitive, fuzzy), e.g. 'EATERY_NORMAL' or 'smelter'. Omit to list all buildings.",
					},
					"category": map[string]any{
						"type":        "string",
						"description": "Filter the index by category, e.g. 'Service' or 'Refiner' (only used when 'room' is omitted).",
					},
				},
			},
			"resources": map[string]any{
				"name": "Resource Lookup",
				"description": "Look up a Songs of Syx resource/good: its roles (edible, drinkable, growable, " +
					"minable, etc.), spoilage rate, the game's description, and — cross-referenced from the " +
					"buildings — which rooms produce and consume it. Use for resource and production-chain questions.",
				"parameters": map[string]any{
					"resource": map[string]any{
						"type":        "string",
						"description": "A resource ID or name (case-insensitive, fuzzy), e.g. 'METAL' or 'grain'. Omit to list all resources.",
					},
					"role": map[string]any{
						"type":        "string",
						"description": "Filter the index by role: edible, drinkable, growable, minable, supply, or work (only used when 'resource' is omitted).",
					},
				},
			},
			"races": map[string]any{
				"name": "Race & Species Lookup",
				"description": "Look up a Songs of Syx species: whether it's playable, its preferred foods, " +
					"slave price, baby/child maturation days, and the game's description. Use for population, " +
					"happiness-by-food-preference, and species questions.",
				"parameters": map[string]any{
					"race": map[string]any{
						"type":        "string",
						"description": "A species ID or name (case-insensitive, fuzzy), e.g. 'HUMAN' or 'cretonian'. Omit to list all species.",
					},
				},
			},
		},
	}
}
