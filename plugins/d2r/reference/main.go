// D2R reference module: serves computed game reference data (drop rates, etc.).
// Runs server-side in Cloudflare Worker via WASI shim.
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
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/d2r/reference/dropcalc"
)

func main() {
	enc := json.NewEncoder(os.Stdout)

	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		writeError(enc, "read_error", "failed to read stdin: "+err.Error())
		os.Exit(1)
	}

	var query map[string]any
	if err := json.Unmarshal(data, &query); err != nil {
		writeError(enc, "parse_error", "invalid JSON query: "+err.Error())
		os.Exit(1)
	}

	// Empty query returns the schema.
	if len(query) == 0 {
		writeResult(enc, schema())
		return
	}

	module, _ := query["module"].(string)
	switch module {
	case "drop_calc":
		handleDropCalc(enc, query)
	default:
		writeError(enc, "unknown_module", "unknown module: "+module)
		os.Exit(1)
	}
}

func handleDropCalc(enc *json.Encoder, query map[string]any) {
	monster, _ := query["monster"].(string)
	if monster == "" {
		writeError(enc, "missing_param", "monster is required")
		os.Exit(1)
	}

	difficulty := parseDifficulty(query["difficulty"])
	players := intParam(query, "players", 1)
	partySize := intParam(query, "party_size", players)
	mf := intParam(query, "mf", 0)

	calc := dropcalc.NewCalculator()
	drops, err := calc.ResolveWithQuality(monster, difficulty, 0, players, partySize, mf)
	if err != nil {
		writeError(enc, "calc_error", err.Error())
		os.Exit(1)
	}

	// Sort by unique probability descending for most useful output.
	sort.Slice(drops, func(i, j int) bool {
		return drops[i].Quality.Unique > drops[j].Quality.Unique
	})

	// Emit each item as a separate ndjson line.
	for _, d := range drops {
		writeResult(enc, map[string]any{
			"code":      d.Code,
			"name":      d.Name,
			"base_prob": d.BaseProb,
			"quality": map[string]any{
				"unique": d.Quality.Unique,
				"set":    d.Quality.Set,
				"rare":   d.Quality.Rare,
				"magic":  d.Quality.Magic,
				"white":  d.Quality.White,
			},
		})
	}
}

func parseDifficulty(v any) int {
	switch d := v.(type) {
	case string:
		switch strings.ToLower(d) {
		case "normal", "0":
			return 0
		case "nightmare", "nm", "1":
			return 1
		case "hell", "2":
			return 2
		}
	case float64:
		return int(d)
	}
	return 2 // default to hell
}

func intParam(query map[string]any, key string, defaultVal int) int {
	v, ok := query[key]
	if !ok {
		return defaultVal
	}
	if f, ok := v.(float64); ok {
		return int(f)
	}
	return defaultVal
}

func schema() map[string]any {
	return map[string]any{
		"modules": []map[string]any{
			{
				"id":          "drop_calc",
				"name":        "Drop Calculator",
				"description": "Compute drop probabilities for any item from any farmable source.",
				"parameters": map[string]any{
					"module": map[string]any{
						"type":        "string",
						"required":    true,
						"description": "Must be 'drop_calc'",
					},
					"monster": map[string]any{
						"type":        "string",
						"required":    true,
						"description": "Monster ID (e.g. 'mephisto', 'andariel', 'countess')",
					},
					"difficulty": map[string]any{
						"type":        "string",
						"required":    false,
						"default":     "hell",
						"description": "Difficulty: 'normal', 'nightmare', or 'hell'",
					},
					"players": map[string]any{
						"type":        "integer",
						"required":    false,
						"default":     1,
						"description": "Number of players in game (1-8)",
					},
					"party_size": map[string]any{
						"type":        "integer",
						"required":    false,
						"default":     1,
						"description": "Number of players in party near monster (1-8)",
					},
					"mf": map[string]any{
						"type":        "integer",
						"required":    false,
						"default":     0,
						"description": "Magic find percentage",
					},
				},
			},
		},
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
