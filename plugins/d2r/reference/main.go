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
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/d2r/reference/dropcalc"
)

const pageSize = 20

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

	// Three modes: "search" (item search), "item" (reverse lookup), or "monster" (forward lookup).
	if search, _ := query["search"].(string); search != "" {
		handleItemSearch(enc, calc, query, search)
		return
	}

	if item, _ := query["item"].(string); item != "" {
		handleItemSources(enc, calc, query, item)
		return
	}

	monster, _ := query["monster"].(string)
	if monster == "" {
		writeError(enc, "missing_param", "monster, item, or search is required")
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
	offset := intParam(query, "offset", 0)
	sortOrder := stringParam(query, "sort")
	if sortOrder == "" {
		sortOrder = "desc"
	}

	drops, err := calc.ResolveWithQuality(monster, difficulty, 0,
		players, partySize, mf, area)
	if err != nil {
		writeError(enc, "calc_error", err.Error())
		os.Exit(1)
	}

	if sortOrder == "asc" {
		sort.Slice(drops, func(i, j int) bool {
			return drops[i].Quality.Unique < drops[j].Quality.Unique
		})
	} else {
		sort.Slice(drops, func(i, j int) bool {
			return drops[i].Quality.Unique > drops[j].Quality.Unique
		})
	}

	total := len(drops)
	drops = paginate(drops, offset)

	type jsonDrop struct {
		Name     string  `json:"name"`
		BaseName string  `json:"base_name"`
		Code     string  `json:"code"`
		Unique   float64 `json:"unique"`
		Set      float64 `json:"set"`
		Rare     float64 `json:"rare"`
		Magic    float64 `json:"magic"`
		BaseProb float64 `json:"base_prob"`
	}

	jsonDrops := make([]jsonDrop, len(drops))
	for i, d := range drops {
		jsonDrops[i] = jsonDrop{
			Name:     d.Name,
			BaseName: calc.ItemName(d.Code),
			Code:     d.Code,
			Unique:   d.Quality.Unique,
			Set:      d.Quality.Set,
			Rare:     d.Quality.Rare,
			Magic:    d.Quality.Magic,
			BaseProb: d.BaseProb,
		}
	}

	writeResult(enc, map[string]any{
		"mode":         "monster",
		"monster_name": monster,
		"difficulty":   difficultyName(difficulty),
		"mf":           mf,
		"players":      players,
		"drops":        jsonDrops,
		"total":        total,
		"offset":       offset,
		"limit":        pageSize,
	})
}

func handleItemSearch(enc *json.Encoder, calc *dropcalc.Calculator, query map[string]any, search string) {
	results := calc.SearchItems(search)

	mf := intParam(query, "mf", 0)
	players := intParam(query, "players", 1)
	partySize := intParam(query, "party_size", players)
	offset := intParam(query, "offset", 0)

	total := len(results)
	if total == 0 {
		writeResult(enc, map[string]any{
			"mode":  "search",
			"query": search,
			"items": []any{},
			"total": 0,
		})
		return
	}

	pageResults := paginate(results, offset)

	type jsonTopSource struct {
		Monster    string  `json:"monster"`
		Difficulty string  `json:"difficulty"`
		Chance     float64 `json:"chance"`
	}

	type jsonSearchItem struct {
		Name       string          `json:"name"`
		BaseName   string          `json:"base_name"`
		IsSet      bool            `json:"is_set"`
		SetName    string          `json:"set_name,omitempty"`
		LevelReq   int             `json:"level_req"`
		QLevel     int             `json:"qlevel"`
		Stats      []string        `json:"stats"`
		TopSources []jsonTopSource `json:"top_sources"`
	}

	items := make([]jsonSearchItem, len(pageResults))
	for idx, r := range pageResults {
		// Format stats as human-readable strings.
		stats := make([]string, len(r.Stats))
		for i, s := range r.Stats {
			stat := s.Property
			if s.Param != "" {
				stat += " (" + s.Param + ")"
			}
			if s.Min == s.Max {
				stat += fmt.Sprintf(": %d", s.Min)
			} else {
				stat += fmt.Sprintf(": %d-%d", s.Min, s.Max)
			}
			stats[i] = stat
		}

		// Top 10 drop sources.
		resolveType := dropcalc.ResolveUnique
		if r.IsSet {
			resolveType = dropcalc.ResolveSet
		}
		sources := calc.FindItemSources(r.BaseCode, dropcalc.FindOptions{
			Difficulty: -1,
			TCType:     -1,
			Players:    players,
			PartySize:  partySize,
			MF:         mf,
		})

		chanceOf := func(s dropcalc.ItemSource) float64 {
			if resolveType == dropcalc.ResolveSet {
				return s.Quality.Set
			}
			return s.Quality.Unique
		}

		sort.Slice(sources, func(i, j int) bool {
			return chanceOf(sources[i]) > chanceOf(sources[j])
		})

		dropLimit := min(10, len(sources))
		topSources := make([]jsonTopSource, dropLimit)
		for i, s := range sources[:dropLimit] {
			topSources[i] = jsonTopSource{
				Monster:    s.MonsterName,
				Difficulty: difficultyName(s.Difficulty),
				Chance:     chanceOf(s),
			}
		}

		items[idx] = jsonSearchItem{
			Name:       r.Name,
			BaseName:   r.BaseName,
			IsSet:      r.IsSet,
			SetName:    r.SetName,
			LevelReq:   r.LevelReq,
			QLevel:     r.QLevel,
			Stats:      stats,
			TopSources: topSources,
		}
	}

	writeResult(enc, map[string]any{
		"mode":  "search",
		"query": search,
		"items": items,
		"total": total,
	})
}

func handleItemSources(enc *json.Encoder, calc *dropcalc.Calculator, query map[string]any, item string) {
	result := calc.ResolveItemFuzzy(item)
	if result.Code == "" {
		msg := "unknown item: " + item
		if len(result.Suggestions) > 0 {
			msg += ". Did you mean: " + strings.Join(result.Suggestions, ", ") + "?"
		}
		writeError(enc, "unknown_item", msg)
		os.Exit(1)
	}
	code := result.Code
	resolveType := result.ResolveType

	offset := intParam(query, "offset", 0)
	sortOrder := stringParam(query, "sort")
	if sortOrder == "" {
		sortOrder = "desc"
	}
	mf := intParam(query, "mf", 0)
	players := intParam(query, "players", 1)
	diffVal := parseDifficultyWithAll(query["difficulty"])

	sources := calc.FindItemSources(code, dropcalc.FindOptions{
		Difficulty: diffVal,
		TCType:     intParam(query, "tc_type", -1),
		BossOnly:   boolParam(query, "boss_only"),
		Area:       stringParam(query, "area"),
		Players:    players,
		PartySize:  intParam(query, "party_size", 1),
		MF:         mf,
	})

	// Pick the probability field that matches what the user searched for.
	chanceOf := func(s dropcalc.ItemSource) float64 {
		switch resolveType {
		case dropcalc.ResolveSet:
			return s.Quality.Set
		case dropcalc.ResolveUnique:
			return s.Quality.Unique
		default:
			return s.BaseProb
		}
	}

	if sortOrder == "asc" {
		sort.Slice(sources, func(i, j int) bool {
			return chanceOf(sources[i]) < chanceOf(sources[j])
		})
	} else {
		sort.Slice(sources, func(i, j int) bool {
			return chanceOf(sources[i]) > chanceOf(sources[j])
		})
	}

	total := len(sources)
	sources = paginate(sources, offset)

	// Determine item name and quality for the view.
	itemName := item
	if result.Corrected != "" {
		itemName = result.Corrected
	}
	quality := "base"
	switch resolveType {
	case dropcalc.ResolveUnique:
		quality = "unique"
	case dropcalc.ResolveSet:
		quality = "set"
	}

	type jsonSource struct {
		Monster    string  `json:"monster"`
		IsBoss     bool    `json:"is_boss"`
		Difficulty string  `json:"difficulty"`
		TCType     string  `json:"tc_type"`
		Area       string  `json:"area"`
		MLVL       int     `json:"mlvl"`
		Chance     float64 `json:"chance"`
	}

	jsonSources := make([]jsonSource, len(sources))
	for i, s := range sources {
		area := s.Area
		if area == "" {
			area = "\u2014"
		}
		jsonSources[i] = jsonSource{
			Monster:    s.MonsterName,
			IsBoss:     s.IsBoss,
			Difficulty: difficultyName(s.Difficulty),
			TCType:     tcTypeName(s.TCType),
			Area:       area,
			MLVL:       s.MLVL,
			Chance:     chanceOf(s),
		}
	}

	writeResult(enc, map[string]any{
		"mode":      "item",
		"item_name": itemName,
		"item_base": calc.ItemName(code),
		"quality":   quality,
		"mf":        mf,
		"players":   players,
		"sources":   jsonSources,
		"total":     total,
		"offset":    offset,
		"limit":     pageSize,
	})
}

// paginate returns a slice of up to pageSize elements starting at offset.
func paginate[T any](items []T, offset int) []T {
	if offset >= len(items) {
		return nil
	}
	end := offset + pageSize
	if end > len(items) {
		end = len(items)
	}
	return items[offset:end]
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

func difficultyName(d int) string {
	switch d {
	case 0:
		return "Normal"
	case 1:
		return "Nightmare"
	default:
		return "Hell"
	}
}

func tcTypeName(t int) string {
	switch t {
	case 0:
		return "Regular"
	case 1:
		return "Champion"
	case 2:
		return "Unique"
	case 3:
		return "Quest"
	default:
		return "Unknown"
	}
}

func schema() map[string]any {
	return map[string]any{
		"modules": map[string]any{
			"drop_calc": map[string]any{
				"name":        "Drop Calculator",
				"description": "Compute drop probabilities and search items. Use 'monster' for forward lookup (what does X drop?), 'item' for reverse lookup (where to farm X?), or 'search' to find items by name, stats, type, or set.",
				"parameters": map[string]any{
					"monster": map[string]any{
						"type":        "string",
						"description": "Monster ID for forward lookup (e.g. 'mephisto', 'andariel'). Mutually exclusive with 'item'.",
					},
					"item": map[string]any{
						"type":        "string",
						"description": "Item code, base item name, unique item name, or set item name for reverse lookup (e.g. 'r13', 'Shael', 'xea', 'Serpentskin Armor', 'Skin of the Vipermagi', 'Magefist', 'Tal Rasha's Horadric Crest'). Supports fuzzy matching — close misspellings auto-resolve. Mutually exclusive with 'monster' and 'search'.",
					},
					"search": map[string]any{
						"type":        "string",
						"description": "Search for unique/set items by name, stats, item type, or set membership. Supports natural language queries like 'Cannot Be Frozen', 'cold resist ring', 'Tal Rasha', 'life steal amulet'. Returns matching items with stats and top 20 drop sources. Mutually exclusive with 'monster' and 'item'.",
					},
					"difficulty": map[string]any{
						"type":        "string",
						"description": "Difficulty: 'normal', 'nightmare', 'hell', or 'all'. Omit or use 'all' to search all difficulties (recommended for finding best farming spots). Specifying a difficulty restricts results to ONLY that difficulty. Default 'hell' for monster mode, 'all' for item mode.",
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
					"offset": map[string]any{
						"type":        "integer",
						"default":     0,
						"description": "Pagination offset. Results are returned in pages of 50.",
					},
					"sort": map[string]any{
						"type":        "string",
						"default":     "desc",
						"description": "Sort order for drop chance: 'desc' (best first) or 'asc' (worst first).",
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
