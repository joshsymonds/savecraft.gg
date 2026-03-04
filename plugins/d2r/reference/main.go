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
	calc := dropcalc.NewCalculator()

	// Two modes: "item" (reverse lookup) or "monster" (forward lookup).
	if item, _ := query["item"].(string); item != "" {
		handleItemSources(enc, calc, query, item)
		return
	}

	monster, _ := query["monster"].(string)
	if monster == "" {
		writeError(enc, "missing_param", "monster or item is required")
		os.Exit(1)
	}

	handleMonsterDrops(enc, calc, query, monster)
}

func handleMonsterDrops(enc *json.Encoder, calc *dropcalc.Calculator, query map[string]any, monster string) {
	difficulty := parseDifficulty(query["difficulty"])
	players := intParam(query, "players", 1)
	partySize := intParam(query, "party_size", players)
	mf := intParam(query, "mf", 0)
	area, _ := query["area"].(string)

	drops, err := calc.ResolveWithQuality(monster, difficulty, 0, players, partySize, mf, area)
	if err != nil {
		writeError(enc, "calc_error", err.Error())
		os.Exit(1)
	}

	sort.Slice(drops, func(i, j int) bool {
		return drops[i].Quality.Unique > drops[j].Quality.Unique
	})

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

func handleItemSources(enc *json.Encoder, calc *dropcalc.Calculator, query map[string]any, item string) {
	code := calc.ItemCode(item)
	if code == "" {
		writeError(enc, "unknown_item", "unknown item: "+item)
		os.Exit(1)
	}

	sources := calc.FindItemSources(code, dropcalc.FindOptions{
		Difficulty: parseDifficultyWithAll(query["difficulty"]),
		TCType:     intParam(query, "tc_type", -1),
		BossOnly:   boolParam(query, "boss_only"),
		Area:       stringParam(query, "area"),
		Players:    intParam(query, "players", 1),
		PartySize:  intParam(query, "party_size", 1),
		MF:         intParam(query, "mf", 0),
	})

	for _, s := range sources {
		writeResult(enc, map[string]any{
			"monster_id":   s.MonsterID,
			"monster_name": s.MonsterName,
			"is_boss":      s.IsBoss,
			"tc_type":      s.TCType,
			"difficulty":   s.Difficulty,
			"area":         s.Area,
			"mlvl":         s.MLVL,
			"base_prob":    s.BaseProb,
			"quality": map[string]any{
				"unique": s.Quality.Unique,
				"set":    s.Quality.Set,
				"rare":   s.Quality.Rare,
				"magic":  s.Quality.Magic,
				"white":  s.Quality.White,
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

// parseDifficultyWithAll is like parseDifficulty but returns -1 for "all" or unset.
func parseDifficultyWithAll(v any) int {
	if v == nil {
		return -1
	}
	switch d := v.(type) {
	case string:
		switch strings.ToLower(d) {
		case "all", "-1", "":
			return -1
		}
	case float64:
		if int(d) == -1 {
			return -1
		}
	}
	return parseDifficulty(v)
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

func boolParam(query map[string]any, key string) bool {
	v, ok := query[key]
	if !ok {
		return false
	}
	b, _ := v.(bool)
	return b
}

func stringParam(query map[string]any, key string) string {
	v, _ := query[key].(string)
	return v
}

func schema() map[string]any {
	return map[string]any{
		"modules": []map[string]any{
			{
				"id":          "drop_calc",
				"name":        "Drop Calculator",
				"description": "Compute drop probabilities. Use 'monster' for forward lookup (what does X drop?) or 'item' for reverse lookup (where to farm X?).",
				"parameters": map[string]any{
					"monster": map[string]any{
						"type":        "string",
						"description": "Monster ID for forward lookup (e.g. 'mephisto', 'andariel'). Mutually exclusive with 'item'.",
					},
					"item": map[string]any{
						"type":        "string",
						"description": "Item code or name for reverse lookup (e.g. 'r13', 'Shael', 'xea', 'Serpentskin Armor'). Mutually exclusive with 'monster'.",
					},
					"difficulty": map[string]any{
						"type":        "string",
						"default":     "hell",
						"description": "Difficulty: 'normal', 'nightmare', 'hell', or 'all'. Default 'hell' for monster mode, 'all' for item mode.",
					},
					"players": map[string]any{
						"type":    "integer",
						"default": 1,
					},
					"party_size": map[string]any{
						"type":    "integer",
						"default": 1,
					},
					"mf": map[string]any{
						"type":    "integer",
						"default": 0,
					},
					"area": map[string]any{
						"type":        "string",
						"description": "Filter to specific area (e.g. 'Pit Level 1', 'Drifter Cavern').",
					},
					"boss_only": map[string]any{
						"type":        "boolean",
						"default":     false,
						"description": "Item mode only: filter to boss monsters.",
					},
					"tc_type": map[string]any{
						"type":        "integer",
						"default":     -1,
						"description": "Item mode only: 0=regular, 1=champion, 2=unique, 3=quest. -1 for all.",
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
