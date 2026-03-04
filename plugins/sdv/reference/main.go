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

func handleNPCQuery(enc *json.Encoder, npc string) {
	prefs := lookupNPC(npc)
	if prefs == nil {
		writeError(enc, "unknown_npc", "unknown NPC: "+npc)
		os.Exit(1)
	}

	// Format as human-readable text
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

	writeResult(enc, map[string]any{
		"formatted": b.String(),
	})
}

func handleItemQuery(enc *json.Encoder, item string) {
	results := lookupItem(item)
	if results == nil {
		writeError(enc, "unknown_item", "unknown item: "+item)
		os.Exit(1)
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

	writeResult(enc, map[string]any{
		"formatted": b.String(),
	})
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
