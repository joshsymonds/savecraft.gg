package main

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// ModTier holds one parsed mod tier from a PoB Mod*.lua file.
type ModTier struct {
	ModID       string   // e.g., "Strength1"
	ModText     string   // pre-rendered text, e.g., "+(8-12) to Strength"
	Affix       string   // e.g., "of the Brute"
	ModType     string   // "Prefix" or "Suffix"
	Level       int      // required item level
	Group       string   // groups tiers of the same effect
	ItemClasses []string // item base types that can roll this mod
	Tags        []string // mod tags for search
}

// modEntryRe matches the mod ID at the start of each line entry.
var modEntryRe = regexp.MustCompile(`^\t\["(\w+)"\]\s*=\s*\{(.+)\},?\s*$`)

// parseModsLua parses a PoB Mod*.lua file into a slice of ModTier.
// Each entry is a single line in the format:
//
//	["ModID"] = { type = "Suffix", affix = "name", "mod text", statOrder = {...}, level = N, group = "G", ... },
func parseModsLua(content string) ([]ModTier, error) {
	var mods []ModTier

	for _, line := range strings.Split(content, "\n") {
		m := modEntryRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		modID := m[1]
		body := m[2]

		modType := extractLuaString(body, "type")
		affix := extractLuaString(body, "affix")
		level := extractLuaInt(body, "level")
		group := extractLuaString(body, "group")
		modText := extractModTexts(body)
		itemClasses := extractWeightedClasses(body)
		tags := extractModTags(body)

		if modText == "" {
			continue
		}

		mods = append(mods, ModTier{
			ModID:       modID,
			ModText:     modText,
			Affix:       affix,
			ModType:     modType,
			Level:       level,
			Group:       group,
			ItemClasses: itemClasses,
			Tags:        tags,
		})
	}

	if len(mods) == 0 {
		return nil, fmt.Errorf("no mod entries found")
	}
	return mods, nil
}

// extractModTexts extracts unnamed positional string(s) from a mod entry body.
// These are quoted strings that appear between the named fields (after affix, before statOrder).
// Multiple strings are joined with newlines.
func extractModTexts(body string) string {
	// Find the segment between affix="..." and statOrder
	affixEnd := findAfterField(body, "affix")
	statOrderIdx := strings.Index(body, "statOrder")
	if affixEnd < 0 || statOrderIdx < 0 || affixEnd >= statOrderIdx {
		return ""
	}

	segment := body[affixEnd:statOrderIdx]

	// Extract all quoted strings from this segment
	var texts []string
	re := regexp.MustCompile(`"([^"]+)"`)
	for _, m := range re.FindAllStringSubmatch(segment, -1) {
		texts = append(texts, m[1])
	}
	return strings.Join(texts, "\n")
}

// findAfterField returns the position after a field's closing quote.
// e.g., for affix = "of the Brute", returns the position after the last "
func findAfterField(body, field string) int {
	idx := strings.Index(body, field)
	if idx < 0 {
		return -1
	}
	// Skip to = then find opening quote
	rest := body[idx:]
	eq := strings.Index(rest, "=")
	if eq < 0 {
		return -1
	}
	openQ := strings.Index(rest[eq:], "\"")
	if openQ < 0 {
		return -1
	}
	closeQ := strings.Index(rest[eq+openQ+1:], "\"")
	if closeQ < 0 {
		return -1
	}
	return idx + eq + openQ + 1 + closeQ + 1
}

// extractWeightedClasses extracts item class tags from weightKey/weightVal arrays.
// Only includes classes with non-zero weight, excluding "default".
func extractWeightedClasses(body string) []string {
	keys := extractLuaStringArray(body, "weightKey")
	vals := extractLuaIntArray(body, "weightVal")

	var classes []string
	for i, k := range keys {
		if k == "default" {
			continue
		}
		if i < len(vals) && vals[i] > 0 {
			classes = append(classes, k)
		}
	}
	return classes
}

// extractModTags extracts the modTags string array.
func extractModTags(body string) []string {
	return extractLuaStringArray(body, "modTags")
}

// extractLuaStringArray extracts a named Lua string array: key = { "a", "b", "c" }
func extractLuaStringArray(body, key string) []string {
	idx := strings.Index(body, key+" =")
	if idx < 0 {
		idx = strings.Index(body, key+"=")
		if idx < 0 {
			return nil
		}
	}
	// Find the opening { after the key
	rest := body[idx:]
	braceIdx := strings.Index(rest, "{")
	if braceIdx < 0 {
		return nil
	}
	// Find matching closing }
	closeIdx := strings.Index(rest[braceIdx+1:], "}")
	if closeIdx < 0 {
		return nil
	}
	block := rest[braceIdx+1 : braceIdx+1+closeIdx]

	var result []string
	re := regexp.MustCompile(`"([^"]+)"`)
	for _, m := range re.FindAllStringSubmatch(block, -1) {
		result = append(result, m[1])
	}
	return result
}

// extractLuaIntArray extracts a named Lua integer array: key = { 1000, 500, 0 }
func extractLuaIntArray(body, key string) []int {
	idx := strings.Index(body, key+" =")
	if idx < 0 {
		idx = strings.Index(body, key+"=")
		if idx < 0 {
			return nil
		}
	}
	rest := body[idx:]
	braceIdx := strings.Index(rest, "{")
	if braceIdx < 0 {
		return nil
	}
	closeIdx := strings.Index(rest[braceIdx+1:], "}")
	if closeIdx < 0 {
		return nil
	}
	block := rest[braceIdx+1 : braceIdx+1+closeIdx]

	var result []int
	re := regexp.MustCompile(`(-?\d+)`)
	for _, m := range re.FindAllStringSubmatch(block, -1) {
		n, _ := strconv.Atoi(m[1])
		result = append(result, n)
	}
	return result
}
