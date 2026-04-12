package main

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// GemMeta holds gem metadata parsed from Gems.lua.
type GemMeta struct {
	Name      string
	VariantID string
	TagString string
	ReqStr    int
	ReqDex    int
	ReqInt    int
	IsSupport bool
}

// SkillStat is a stat ID + value pair from a skill's constantStats.
type SkillStat struct {
	ID    string
	Value int
}

// SkillData holds skill data parsed from Skills/*.lua.
type SkillData struct {
	Description       string
	Color             int // 1=str/R, 2=dex/G, 3=int/B
	CastTime          float64
	IsSupport         bool
	ConstantStats     []SkillStat
	LevelStats        []SkillStat // stats from stats[] paired with levels[20][] values
	ManaCost          int         // from level 20 cost.Mana
	ManaMultiplier    int         // from levels[20].manaMultiplier (percentage, e.g. 130)
	IgnoreMinionTypes bool        // true = "Cannot modify the skills of minions"
	NotMinionStat     []string    // stat IDs excluded from minions/totems
	RequireSkillTypes []string    // skill types this support requires (e.g. ["Channel"])
	ExcludeSkillTypes []string    // skill types this support refuses (e.g. ["Blessing"])
}

// GemData is the final joined gem record ready for SQL generation.
type GemData struct {
	GemID             string // variantId
	Name              string
	IsSupport         bool
	Color             string // R, G, B, W
	TagString         string
	ReqStr            int
	ReqDex            int
	ReqInt            int
	Description       string
	CastTime          float64
	ManaCost          int
	ConstantStats     []SkillStat
	LevelStats        []SkillStat
	ManaMultiplier    int
	IgnoreMinionTypes bool
	NotMinionStat     []string
	RequireSkillTypes []string
	ExcludeSkillTypes []string
}

// parseGemsLua extracts gem metadata from PoB's Gems.lua content.
// Returns a map keyed by variantId.
func parseGemsLua(content string) (map[string]GemMeta, error) {
	gems := make(map[string]GemMeta)

	// Match each gem entry block. Entries look like:
	//   ["Metadata/Items/Gems/SkillGemXxx"] = {
	//     name = "...",
	//     variantId = "...",
	//     ...
	//   },
	entryRe := regexp.MustCompile(`(?s)\["Metadata/Items/Gems/(.*?)"\]\s*=\s*\{(.*?)\n\t\}`)
	for _, m := range entryRe.FindAllStringSubmatch(content, -1) {
		body := m[2]

		variantID := extractLuaString(body, "variantId")
		if variantID == "" {
			continue
		}
		name := extractLuaString(body, "name")
		if name == "" {
			continue
		}

		isSupport := strings.Contains(m[1], "SupportGem") ||
			strings.Contains(body, "support = true")

		gems[variantID] = GemMeta{
			Name:      name,
			VariantID: variantID,
			TagString: extractLuaString(body, "tagString"),
			ReqStr:    extractLuaInt(body, "reqStr"),
			ReqDex:    extractLuaInt(body, "reqDex"),
			ReqInt:    extractLuaInt(body, "reqInt"),
			IsSupport: isSupport,
		}
	}

	if len(gems) == 0 {
		return nil, fmt.Errorf("no gems found in Gems.lua")
	}
	return gems, nil
}

// parseSkillsLua extracts skill data from a PoB Skills/*.lua file.
// Returns a map keyed by skill ID (matches Gems.lua variantId).
func parseSkillsLua(content string) (map[string]SkillData, error) {
	skills := make(map[string]SkillData)

	// Match each skills["ID"] = { ... } block.
	// Use a state machine approach since the blocks contain nested braces.
	skillHeaderRe := regexp.MustCompile(`skills\["(\w+)"\]\s*=\s*\{`)

	for _, loc := range skillHeaderRe.FindAllStringSubmatchIndex(content, -1) {
		id := content[loc[2]:loc[3]]
		blockStart := loc[1] // position after the opening {

		// Find the matching closing brace by counting nesting depth.
		body := extractNestedBlock(content[blockStart:])
		if body == "" {
			continue
		}

		sd := SkillData{
			Description:       extractLuaString(body, "description"),
			CastTime:          extractLuaFloat(body, "castTime"),
			Color:             extractLuaInt(body, "color"),
			IsSupport:         strings.Contains(body, "support = true"),
			ConstantStats:     extractConstantStats(body),
			LevelStats:        extractLevelStats(body),
			ManaCost:          extractManaCostLevel20(body),
			ManaMultiplier:    extractManaMultiplierLevel20(body),
			IgnoreMinionTypes: strings.Contains(body, "ignoreMinionTypes = true"),
			NotMinionStat:     extractStringArray(body, "notMinionStat"),
			RequireSkillTypes: extractSkillTypeArray(body, "requireSkillTypes"),
			ExcludeSkillTypes: extractSkillTypeArray(body, "excludeSkillTypes"),
		}

		skills[id] = sd
	}

	return skills, nil
}

// joinGemsAndSkills combines gem metadata with skill data.
func joinGemsAndSkills(gems map[string]GemMeta, skills map[string]SkillData) []GemData {
	var result []GemData

	for variantID, gem := range gems {
		gd := GemData{
			GemID:     variantID,
			Name:      gem.Name,
			IsSupport: gem.IsSupport,
			TagString: gem.TagString,
			ReqStr:    gem.ReqStr,
			ReqDex:    gem.ReqDex,
			ReqInt:    gem.ReqInt,
		}

		if skill, ok := skills[variantID]; ok {
			gd.Description = skill.Description
			gd.CastTime = skill.CastTime
			gd.ManaCost = skill.ManaCost
			gd.ConstantStats = skill.ConstantStats
			gd.LevelStats = skill.LevelStats
			gd.ManaMultiplier = skill.ManaMultiplier
			gd.IgnoreMinionTypes = skill.IgnoreMinionTypes
			gd.NotMinionStat = skill.NotMinionStat
			gd.RequireSkillTypes = skill.RequireSkillTypes
			gd.ExcludeSkillTypes = skill.ExcludeSkillTypes
			gd.IsSupport = gd.IsSupport || skill.IsSupport
			gd.Color = colorIntToString(skill.Color)
		} else {
			// No skill data — derive color from requirements
			gd.Color = colorFromRequirements(gem.ReqStr, gem.ReqDex, gem.ReqInt)
		}

		result = append(result, gd)
	}

	return result
}

func colorIntToString(c int) string {
	switch c {
	case 1:
		return "R"
	case 2:
		return "G"
	case 3:
		return "B"
	default:
		return "W"
	}
}

func colorFromRequirements(str, dex, int_ int) string {
	max := str
	color := "R"
	if dex > max {
		max = dex
		color = "G"
	}
	if int_ > max {
		max = int_
		color = "B"
	}
	if max == 0 {
		return "W"
	}
	return color
}

// --- Lua extraction helpers ---
// Regex cache: compiled once per key, reused across all calls.

var luaReCache = map[string]*regexp.Regexp{}

func cachedRe(pattern string) *regexp.Regexp {
	re, ok := luaReCache[pattern]
	if !ok {
		re = regexp.MustCompile(pattern)
		luaReCache[pattern] = re
	}
	return re
}

func extractLuaString(body, key string) string {
	re := cachedRe(key + `\s*=\s*"([^"]*)"`)
	m := re.FindStringSubmatch(body)
	if m == nil {
		return ""
	}
	return m[1]
}

func extractLuaInt(body, key string) int {
	re := cachedRe(key + `\s*=\s*(-?\d+)`)
	m := re.FindStringSubmatch(body)
	if m == nil {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

func extractLuaFloat(body, key string) float64 {
	re := cachedRe(key + `\s*=\s*(-?[0-9]+\.?[0-9]*)`)
	m := re.FindStringSubmatch(body)
	if m == nil {
		return 0
	}
	f, _ := strconv.ParseFloat(m[1], 64)
	return f
}

// extractNestedBlock finds the content between matching braces.
// content should start just after the opening {.
func extractNestedBlock(content string) string {
	depth := 1
	for i := 0; i < len(content); i++ {
		switch content[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return content[:i]
			}
		case '"':
			// Skip string contents (don't count braces inside strings)
			for i++; i < len(content) && content[i] != '"'; i++ {
				if content[i] == '\\' {
					i++ // skip escaped char
				}
			}
		case '-':
			// Skip Lua comments: -- until end of line
			if i+1 < len(content) && content[i+1] == '-' {
				for i += 2; i < len(content) && content[i] != '\n'; i++ {
				}
			}
		}
	}
	return ""
}

// extractConstantStats parses constantStats = { {"id", value}, ... } from a skill body.
func extractConstantStats(body string) []SkillStat {
	idx := strings.Index(body, "constantStats")
	if idx < 0 {
		return nil
	}
	// Find the opening { after constantStats
	rest := body[idx:]
	braceIdx := strings.Index(rest, "{")
	if braceIdx < 0 {
		return nil
	}
	block := extractNestedBlock(rest[braceIdx+1:])

	var stats []SkillStat
	// Match { "stat_id", value } entries
	entryRe := regexp.MustCompile(`\{\s*"([^"]+)"\s*,\s*(-?\d+)\s*\}`)
	for _, m := range entryRe.FindAllStringSubmatch(block, -1) {
		val, _ := strconv.Atoi(m[2])
		stats = append(stats, SkillStat{ID: m[1], Value: val})
	}
	return stats
}

// extractManaCostLevel20 extracts the Mana cost from the level 20 entry.
func extractManaCostLevel20(body string) int {
	// Find [20] = { ... cost = { Mana = N } ... }
	idx := strings.Index(body, "[20] = {")
	if idx < 0 {
		return 0
	}
	// Extract the level 20 block
	block := extractNestedBlock(body[idx+8:])
	// Find Mana = N within cost = { ... }
	re := regexp.MustCompile(`Mana\s*=\s*(\d+)`)
	m := re.FindStringSubmatch(block)
	if m == nil {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

// extractManaMultiplierLevel20 extracts the manaMultiplier from levels[20].
func extractManaMultiplierLevel20(body string) int {
	idx := strings.Index(body, "[20] = {")
	if idx < 0 {
		return 0
	}
	block := extractNestedBlock(body[idx+8:])
	re := regexp.MustCompile(`manaMultiplier\s*=\s*(\d+)`)
	m := re.FindStringSubmatch(block)
	if m == nil {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

// extractLevelStats pairs stats[] IDs with levels[20][] positional values.
// PoB format: stats = { "id1", "id2", ... } and levels = { [20] = { val1, val2, ... } }
// The positional values in levels[20] correspond to stats[] entries in order.
// Only stats with interpolated values (positional numbers before named keys) are paired.
func extractLevelStats(body string) []SkillStat {
	// 1. Extract stat IDs from the stats array
	statIDs := extractStringArray(body, "stats")
	if len(statIDs) == 0 {
		return nil
	}

	// 2. Extract positional values from levels[20]
	idx := strings.Index(body, "[20] = {")
	if idx < 0 {
		return nil
	}
	block := extractNestedBlock(body[idx+8:])

	// Extract positional (non-named) values from the level block.
	// Format: { val1, val2, ..., levelRequirement = N, manaMultiplier = N, ... }
	// Split by comma, take numeric-only tokens, stop at named keys.
	var values []int
	for _, token := range strings.Split(block, ",") {
		token = strings.TrimSpace(token)
		// Stop at named keys (contain "=")
		if strings.Contains(token, "=") {
			break
		}
		if token == "" {
			continue
		}
		// Parse as float first (PoB uses floats like 0.8), then truncate to int
		f, err := strconv.ParseFloat(token, 64)
		if err != nil {
			break
		}
		values = append(values, int(f))
	}

	// 3. Pair stat IDs with values (only as many as we have values)
	var stats []SkillStat
	for i := 0; i < len(statIDs) && i < len(values); i++ {
		stats = append(stats, SkillStat{ID: statIDs[i], Value: values[i]})
	}
	return stats
}

// extractStringArray extracts a Lua array of strings: key = { "a", "b", ... }
func extractStringArray(body, key string) []string {
	re := cachedRe(key + `\s*=\s*\{`)
	loc := re.FindStringIndex(body)
	if loc == nil {
		return nil
	}
	block := extractNestedBlock(body[loc[1]:])
	var result []string
	strRe := regexp.MustCompile(`"([^"]+)"`)
	for _, m := range strRe.FindAllStringSubmatch(block, -1) {
		result = append(result, m[1])
	}
	return result
}

// extractSkillTypeArray extracts a Lua array of SkillType references:
// key = { SkillType.Attack, SkillType.Melee, }
// Returns the type names without the "SkillType." prefix.
func extractSkillTypeArray(body, key string) []string {
	re := cachedRe(key + `\s*=\s*\{`)
	loc := re.FindStringIndex(body)
	if loc == nil {
		return nil
	}
	block := extractNestedBlock(body[loc[1]:])
	if strings.TrimSpace(block) == "" {
		return nil
	}
	var result []string
	typeRe := regexp.MustCompile(`SkillType\.(\w+)`)
	for _, m := range typeRe.FindAllStringSubmatch(block, -1) {
		result = append(result, m[1])
	}
	return result
}
