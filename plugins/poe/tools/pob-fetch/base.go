package main

import (
	"fmt"
	"regexp"
)

// BaseItem holds a parsed base item from PoB's Bases/*.lua files.
type BaseItem struct {
	Name      string
	ItemClass string // type field, e.g., "Body Armour", "Amulet"
	LevelReq  int
	Tags      []string
}

// baseEntryRe matches itemBases["Name"] = { ... }
var baseEntryRe = regexp.MustCompile(`(?s)itemBases\["([^"]+)"\]\s*=\s*\{(.*?)\n\}`)

// parseBasesLua parses a PoB Bases/*.lua file into a slice of BaseItem.
func parseBasesLua(content string) ([]BaseItem, error) {
	var items []BaseItem

	for _, m := range baseEntryRe.FindAllStringSubmatch(content, -1) {
		name := m[1]
		body := m[2]

		itemClass := extractLuaString(body, "type")

		// Level requirement is inside req = { level = N, ... }
		levelReq := 0
		reqIdx := findFieldBlock(body, "req")
		if reqIdx != "" {
			levelReq = extractLuaInt(reqIdx, "level")
		}

		// Tags from tags = { key = true, ... }
		tags := extractLuaBoolKeys(body, "tags")

		items = append(items, BaseItem{
			Name:      name,
			ItemClass: itemClass,
			LevelReq:  levelReq,
			Tags:      tags,
		})
	}

	if len(items) == 0 {
		return nil, fmt.Errorf("no base items found")
	}
	return items, nil
}

// findFieldBlock extracts the content of a named block: field = { ... }
func findFieldBlock(body, field string) string {
	re := regexp.MustCompile(field + `\s*=\s*\{`)
	loc := re.FindStringIndex(body)
	if loc == nil {
		return ""
	}
	return extractNestedBlock(body[loc[1]:])
}

// extractLuaBoolKeys extracts keys from a Lua boolean table: { key1 = true, key2 = true }
func extractLuaBoolKeys(body, field string) []string {
	block := findFieldBlock(body, field)
	if block == "" {
		return nil
	}
	re := regexp.MustCompile(`(\w+)\s*=\s*true`)
	var keys []string
	for _, m := range re.FindAllStringSubmatch(block, -1) {
		keys = append(keys, m[1])
	}
	return keys
}
