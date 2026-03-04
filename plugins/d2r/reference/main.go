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

const pageSize = 50

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

	// Format header.
	diffName := difficultyName(difficulty)
	var b strings.Builder
	fmt.Fprintf(&b, "Drops for %s (%s) — %d MF, %d player",
		monster, diffName, mf, players)
	if players > 1 {
		b.WriteString("s")
	}
	b.WriteString("\n")

	sortDesc := "unique chance, best first"
	if sortOrder == "asc" {
		sortDesc = "unique chance, worst first"
	}

	if total == 0 {
		b.WriteString("No results found.\n")
	} else {
		fmt.Fprintf(&b, "Showing %d-%d of %d (sorted by %s)\n\n",
			offset+1, offset+len(drops), total, sortDesc)

		fmt.Fprintf(&b, "%4s  %-24s %9s %9s %9s %9s %9s\n",
			"#", "Item", "Unique", "Set", "Rare", "Magic", "Base")

		for i, d := range drops {
			name := d.Name
			if len(name) > 24 {
				name = name[:21] + "..."
			}
			fmt.Fprintf(&b, "%4d. %-24s %9s %9s %9s %9s %9s\n",
				offset+i+1, name,
				fmtChance(d.Quality.Unique),
				fmtChance(d.Quality.Set),
				fmtChance(d.Quality.Rare),
				fmtChance(d.Quality.Magic),
				fmtChance(d.BaseProb))
		}

		remaining := total - offset - len(drops)
		if remaining > 0 {
			fmt.Fprintf(&b, "\n%d more results. Use offset=%d for next page.",
				remaining, offset+pageSize)
		}
	}

	writeResult(enc, map[string]any{
		"formatted": b.String(),
		"total":     total,
		"offset":    offset,
		"limit":     pageSize,
	})
}

func handleItemSources(enc *json.Encoder, calc *dropcalc.Calculator, query map[string]any, item string) {
	code := calc.ItemCode(item)
	if code == "" {
		writeError(enc, "unknown_item", "unknown item: "+item)
		os.Exit(1)
	}

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

	// FindItemSources returns desc by unique. Re-sort explicitly for both cases
	// so we don't depend on the internal sort order.
	if sortOrder == "asc" {
		sort.Slice(sources, func(i, j int) bool {
			return sources[i].Quality.Unique < sources[j].Quality.Unique
		})
	} else {
		sort.Slice(sources, func(i, j int) bool {
			return sources[i].Quality.Unique > sources[j].Quality.Unique
		})
	}

	total := len(sources)
	sources = paginate(sources, offset)

	// Format header.
	itemName := calc.ItemName(code)
	diffLabel := "all difficulties"
	if diffVal >= 0 {
		diffLabel = difficultyName(diffVal)
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Drop sources for %s (%s) — %s, %d MF, %d player",
		itemName, code, diffLabel, mf, players)
	if players > 1 {
		b.WriteString("s")
	}
	b.WriteString("\n")

	sortDesc := "unique chance, best first"
	if sortOrder == "asc" {
		sortDesc = "unique chance, worst first"
	}

	if total == 0 {
		b.WriteString("No results found.\n")
	} else {
		fmt.Fprintf(&b, "Showing %d-%d of %d (sorted by %s)\n\n",
			offset+1, offset+len(sources), total, sortDesc)

		fmt.Fprintf(&b, "%4s  %-20s %-5s %-8s %-20s %9s %9s %9s\n",
			"#", "Monster", "Diff", "Type", "Area", "Unique", "Set", "Base")

		for i, s := range sources {
			name := s.MonsterName
			if len(name) > 20 {
				name = name[:17] + "..."
			}
			area := s.Area
			if area == "" {
				area = "—"
			}
			if len(area) > 20 {
				area = area[:17] + "..."
			}
			fmt.Fprintf(&b, "%4d. %-20s %-5s %-8s %-20s %9s %9s %9s\n",
				offset+i+1, name,
				shortDiff(s.Difficulty),
				tcTypeName(s.TCType),
				area,
				fmtChance(s.Quality.Unique),
				fmtChance(s.Quality.Set),
				fmtChance(s.BaseProb))
		}

		remaining := total - offset - len(sources)
		if remaining > 0 {
			fmt.Fprintf(&b, "\n%d more results. Use offset=%d for next page.",
				remaining, offset+pageSize)
		}
	}

	writeResult(enc, map[string]any{
		"formatted": b.String(),
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

func shortDiff(d int) string {
	switch d {
	case 0:
		return "Norm"
	case 1:
		return "NM"
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

// fmtChance formats a probability as "1:N" or "—" if zero.
func fmtChance(p float64) string {
	if p <= 0 {
		return "—"
	}
	n := 1.0 / p
	if n < 10 {
		return fmt.Sprintf("1:%.1f", n)
	}
	return fmt.Sprintf("1:%.0f", n)
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
						"description": "Item code, base item name, unique item name, or set item name for reverse lookup (e.g. 'r13', 'Shael', 'xea', 'Serpentskin Armor', 'Skin of the Vipermagi', 'Magefist', 'Tal Rasha's Horadric Crest'). Mutually exclusive with 'monster'.",
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
						"description": "Sort order for unique chance: 'desc' (best first) or 'asc' (worst first).",
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
