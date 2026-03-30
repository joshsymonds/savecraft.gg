// SDV reference module: serves computed game reference data (gift preferences, etc.).
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
	"strings"
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
	case "gift_preferences":
		handleGiftPreferences(enc, query)
	case "crop_planner":
		handleCropPlanner(enc, query)
	default:
		writeError(enc, "unknown_module", "unknown module: "+module)
		os.Exit(1)
	}
}

func handleGiftPreferences(enc *json.Encoder, query map[string]any) {
	npc, _ := query["npc"].(string)
	item, _ := query["item"].(string)

	if npc == "" && item == "" {
		writeError(enc, "missing_param", "npc or item is required")
		os.Exit(1)
	}

	if npc != "" {
		handleNPCQuery(enc, npc)
		return
	}

	handleItemQuery(enc, item)
}

// cropQueryResult builds the result map for a crop detail query.
// Returns nil if the crop is not found.
func cropQueryResult(crop string) map[string]any {
	return lookupCrop(crop)
}

// seasonQueryResult builds the result map for a season ranking query.
// Returns nil if the season is not recognized.
func seasonQueryResult(season string) map[string]any {
	return lookupSeason(season)
}

func handleCropPlanner(enc *json.Encoder, query map[string]any) {
	crop, _ := query["crop"].(string)
	season, _ := query["season"].(string)

	if crop == "" && season == "" {
		writeError(enc, "missing_param", "crop or season is required")
		os.Exit(1)
	}

	if crop != "" {
		result := cropQueryResult(crop)
		if result == nil {
			writeError(enc, "unknown_crop", "unknown crop: "+crop)
			os.Exit(1)
		}
		writeResult(enc, result)
		return
	}

	result := seasonQueryResult(season)
	if result == nil {
		writeError(enc, "unknown_season", "unknown season: "+season)
		os.Exit(1)
	}
	writeResult(enc, result)
}

// npcQueryResult builds the result map for an NPC gift preference query.
// Returns nil if the NPC is not found.
func npcQueryResult(npc string) map[string]any {
	return lookupNPC(npc)
}

func handleNPCQuery(enc *json.Encoder, npc string) {
	result := npcQueryResult(npc)
	if result == nil {
		writeError(enc, "unknown_npc", "unknown NPC: "+npc)
		os.Exit(1)
	}
	writeResult(enc, result)
}

// itemQueryResult builds the result map for an item gift preference query.
// Returns nil if the item is not found.
func itemQueryResult(item string) map[string]any {
	return lookupItem(item)
}

func handleItemQuery(enc *json.Encoder, item string) {
	result := itemQueryResult(item)
	if result == nil {
		writeError(enc, "unknown_item", "unknown item: "+item)
		os.Exit(1)
	}
	writeResult(enc, result)
}

func schema() map[string]any {
	return map[string]any{
		"modules": map[string]any{
			"gift_preferences": map[string]any{
				"name":        "Gift Preferences",
				"description": "Look up NPC gift preferences. Use 'npc' to see what a villager loves/likes/hates, or 'item' to see which NPCs prefer a specific item.",
				"parameters": map[string]any{
					"npc": map[string]any{
						"type":        "string",
						"description": "NPC name for forward lookup (e.g. 'Abigail', 'Sebastian'). Returns loved/liked/disliked/hated items.",
					},
					"item": map[string]any{
						"type":        "string",
						"description": "Item name for reverse lookup (e.g. 'Diamond', 'Pumpkin', 'Prismatic Shard'). Returns which NPCs love/like/dislike/hate it.",
					},
				},
			},
			"crop_planner": map[string]any{
				"name":        "Crop Planner",
				"description": "Look up crop growth data and profitability. Use 'crop' to see a specific crop's stats, or 'season' to see all crops ranked by gold/day.",
				"parameters": map[string]any{
					"crop": map[string]any{
						"type":        "string",
						"description": "Crop name for forward lookup (e.g. 'Pumpkin', 'Starfruit'). Returns growth time, seasons, sell prices, gold/day, and artisan goods values.",
					},
					"season": map[string]any{
						"type":        "string",
						"description": "Season name for reverse lookup ('Spring', 'Summer', 'Fall', 'Winter'). Returns all crops for that season ranked by gold/day.",
					},
				},
			},
		},
	}
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
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
