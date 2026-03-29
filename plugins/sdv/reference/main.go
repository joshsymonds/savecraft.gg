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
	"fmt"
	"io"
	"maps"
	"os"
	"strings"
)

// Presentation hints for text-only MCP hosts.
const (
	cropPresentation   = "Crop detail — structured info card showing crop name, season, growth time, regrow cycle, and category. Show profitability as a comparison: base sell vs Tiller vs artisan goods values. Display speed-gro options as a compact comparison table (growth days, harvests, g/day for each tier). Show processing info (keg vs jar value and throughput) as a side-by-side comparison."
	seasonPresentation = "Season crop ranking — table of crops sorted by gold/day descending. Show columns for gross g/day, net g/day (after seed cost), sell price, seed cost, growth time, and type. Use bar indicators for g/day to make profitability differences visually obvious. Highlight regrow crops (continuous income) distinctly from single-harvest crops."
	npcPresentation    = "Gift preferences — organize by taste tier (Love → Like → Neutral → Dislike → Hate) with each tier as a distinct section. Use heart icons or color intensity to convey tier at a glance (deep red hearts for love, grey for hate). List items as compact tags within each tier. Separate personal preferences from universal ones visually."
	itemPresentation   = "Item gift lookup — show which NPCs love/like/dislike/hate this item, grouped by taste tier. Use the same heart/color coding as NPC preferences. Mark personal preferences (overrides) distinctly from universal ones. If many NPCs share a universal taste, summarize rather than listing all."
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

// cropQueryResult builds the full result map for a crop detail query.
// Returns nil if the crop is not found. Includes both formatted/presentation
// (backward compat) and structured fields (for view rendering).
func cropQueryResult(crop string) map[string]any {
	data := lookupCrop(crop)
	if data == nil {
		return nil
	}
	result := map[string]any{
		"formatted":    formatCropResult(data),
		"presentation": cropPresentation,
	}
	maps.Copy(result, data)
	return result
}

// seasonQueryResult builds the full result map for a season ranking query.
// Returns nil if the season is not recognized. Includes both formatted/presentation
// (backward compat) and structured fields (for view rendering).
func seasonQueryResult(season string) map[string]any {
	data := lookupSeason(season)
	if data == nil {
		return nil
	}
	result := map[string]any{
		"formatted":    formatSeasonResult(data),
		"presentation": seasonPresentation,
	}
	maps.Copy(result, data)
	return result
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

// npcQueryResult builds the full result map for an NPC gift preference query.
// Returns nil if the NPC is not found. Includes both formatted/presentation
// (backward compat) and structured fields (for view rendering).
func npcQueryResult(npc string) map[string]any {
	prefs := lookupNPC(npc)
	if prefs == nil {
		return nil
	}

	name := prefs["npc"].(string)
	var b strings.Builder
	fmt.Fprintf(&b, "Gift preferences for %s\n\n", name)

	formatTasteSection(&b, "Loves", prefs["love"])
	formatTasteSection(&b, "Likes", prefs["like"])
	formatTasteSection(&b, "Neutral", prefs["neutral"])
	formatTasteSection(&b, "Dislikes", prefs["dislike"])
	formatTasteSection(&b, "Hates", prefs["hate"])

	b.WriteString("\n--- Universal (all NPCs unless overridden) ---\n")
	formatTasteSection(&b, "Universal Love", prefs["universalLove"])
	formatTasteSection(&b, "Universal Like", prefs["universalLike"])
	formatTasteSection(&b, "Universal Neutral", prefs["universalNeutral"])
	formatTasteSection(&b, "Universal Dislike", prefs["universalDislike"])
	formatTasteSection(&b, "Universal Hate", prefs["universalHate"])

	// Merge structured fields with formatted/presentation.
	result := map[string]any{
		"formatted":    b.String(),
		"presentation": npcPresentation,
	}
	maps.Copy(result, prefs)
	return result
}

func handleNPCQuery(enc *json.Encoder, npc string) {
	result := npcQueryResult(npc)
	if result == nil {
		writeError(enc, "unknown_npc", "unknown NPC: "+npc)
		os.Exit(1)
	}
	writeResult(enc, result)
}

// itemQueryResult builds the full result map for an item gift preference query.
// Returns nil if the item is not found. Includes both formatted/presentation
// (backward compat) and structured fields (for view rendering).
func itemQueryResult(item string) map[string]any {
	results := lookupItem(item)
	if results == nil {
		return nil
	}

	var b strings.Builder
	itemName := results["item"].(string)
	fmt.Fprintf(&b, "Who likes %s?\n", itemName)

	if cat, ok := results["category"].(string); ok {
		fmt.Fprintf(&b, "Category: %s\n", cat)
	}
	if ut, ok := results["universalTaste"].(string); ok {
		fmt.Fprintf(&b, "Universal taste: %s\n", ut)
	}
	b.WriteString("\n")

	npcs := results["npcs"].([]any)
	if len(npcs) == 0 {
		b.WriteString("No specific NPC preferences found.\n")
	} else {
		currentTaste := ""
		for _, r := range npcs {
			m := r.(map[string]any)
			taste := m["taste"].(string)
			if taste != currentTaste {
				if currentTaste != "" {
					b.WriteString("\n")
				}
				fmt.Fprintf(&b, "%s:\n", capitalize(taste))
				currentTaste = taste
			}
			source := m["source"].(string)
			marker := ""
			if source == "personal" {
				marker = " *"
			}
			fmt.Fprintf(&b, "  %s%s\n", m["npc"].(string), marker)
		}
	}

	b.WriteString("\n* = personal preference (overrides universal)\n")

	// Merge structured fields with formatted/presentation.
	result := map[string]any{
		"formatted":    b.String(),
		"presentation": itemPresentation,
	}
	maps.Copy(result, results)
	return result
}

func handleItemQuery(enc *json.Encoder, item string) {
	result := itemQueryResult(item)
	if result == nil {
		writeError(enc, "unknown_item", "unknown item: "+item)
		os.Exit(1)
	}
	writeResult(enc, result)
}

func formatTasteSection(b *strings.Builder, label string, items any) {
	if items == nil {
		return
	}
	list, ok := items.([]any)
	if !ok || len(list) == 0 {
		return
	}
	fmt.Fprintf(b, "%s: ", label)
	for i, item := range list {
		if i > 0 {
			b.WriteString(", ")
		}
		m := item.(map[string]any)
		b.WriteString(m["name"].(string))
	}
	b.WriteString("\n")
}

func schema() map[string]any {
	return map[string]any{
		"modules": []map[string]any{
			{
				"id":          "gift_preferences",
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
			{
				"id":          "crop_planner",
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
