package main

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// UniqueItem holds a parsed unique item ready for SQL generation.
type UniqueItem struct {
	Name         string
	Variant      string
	BaseType     string
	LevelReq     int
	ImplicitMods []string
	ExplicitMods []string
}

// tagPrefixRe matches {tags:...} or {variant:...} or combined prefixes at the start of a line.
var tagPrefixRe = regexp.MustCompile(`^\{[^}]+\}`)

// variantTagRe extracts the variant numbers from a {variant:1,2,3} prefix.
var variantTagRe = regexp.MustCompile(`^\{variant:([0-9,]+)\}`)

// stripAllPrefixes removes all {...} prefixes from a mod line.
func stripAllPrefixes(line string) string {
	for strings.HasPrefix(line, "{") {
		line = tagPrefixRe.ReplaceAllString(line, "")
	}
	return line
}

// extractVariantNums returns the set of variant numbers from a {variant:N,M} prefix.
// Returns nil if no variant prefix is present (meaning the mod applies to all variants).
func extractVariantNums(line string) map[int]bool {
	m := variantTagRe.FindStringSubmatch(line)
	if m == nil {
		return nil
	}
	nums := map[int]bool{}
	for _, s := range strings.Split(m[1], ",") {
		if n, err := strconv.Atoi(strings.TrimSpace(s)); err == nil {
			nums[n] = true
		}
	}
	return nums
}

// variantInfo holds a parsed Variant: header line.
type variantInfo struct {
	index     int    // 1-based index in the file
	isCurrent bool   // whether it starts with "Current"
	label     string // the part after "Current " or "Pre X.Y.Z ", e.g. "(Armour)"
}

// parseVariantLabel extracts the display label from a Variant: value.
// "Current (Armour)" → "Armour", "Pre 3.0.0 (Armour)" → "Armour", "Current" → ""
func parseVariantLabel(v string) string {
	// Strip "Current" or "Pre X.Y.Z" prefix
	v = strings.TrimSpace(v)
	if idx := strings.Index(v, "("); idx >= 0 {
		end := strings.Index(v, ")")
		if end > idx {
			return v[idx+1 : end]
		}
	}
	return ""
}

// parseUniqueBlock parses a single [[ ... ]] text block into one or more UniqueItems.
// Multi-variant items produce one UniqueItem per "Current" variant.
func parseUniqueBlock(block string) []UniqueItem {
	lines := strings.Split(strings.TrimSpace(block), "\n")
	if len(lines) < 2 {
		return nil
	}

	name := strings.TrimSpace(lines[0])
	baseType := strings.TrimSpace(lines[1])

	var variants []variantInfo
	levelReq := 0
	implicitCount := -1 // -1 means no Implicits header found
	var modLines []string

	// Parse headers and collect mod lines.
	inMods := false
	for _, rawLine := range lines[2:] {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		if !inMods {
			if val, ok := strings.CutPrefix(line, "Variant: "); ok {
				variants = append(variants, variantInfo{
					index:     len(variants) + 1,
					isCurrent: strings.HasPrefix(val, "Current"),
					label:     parseVariantLabel(val),
				})
				continue
			}
			if after, ok := strings.CutPrefix(line, "Requires Level "); ok {
				if n, err := strconv.Atoi(after); err == nil {
					levelReq = n
				}
				continue
			}
			if after, ok := strings.CutPrefix(line, "LevelReq: "); ok {
				if n, err := strconv.Atoi(after); err == nil {
					levelReq = n
				}
				continue
			}
			if after, ok := strings.CutPrefix(line, "Implicits: "); ok {
				if n, err := strconv.Atoi(after); err == nil {
					implicitCount = n
				}
				inMods = true
				continue
			}
			// Skip other header lines (League:, Source:, Sockets:, Has Alt Variant, etc.)
			if strings.Contains(line, ":") || strings.HasPrefix(line, "Has ") {
				continue
			}
			// If we hit a non-header line without seeing Implicits:, treat remaining as mods
			inMods = true
			modLines = append(modLines, line)
		} else {
			modLines = append(modLines, line)
		}
	}

	if implicitCount < 0 {
		implicitCount = 0
	}

	// If no variants, emit a single item with all mods.
	if len(variants) == 0 {
		implicits, explicits := splitMods(modLines, implicitCount, nil)
		return []UniqueItem{{
			Name:         name,
			BaseType:     baseType,
			LevelReq:     levelReq,
			ImplicitMods: implicits,
			ExplicitMods: explicits,
		}}
	}

	// Find which variants are "Current". If none marked Current, use all.
	currentVariants := []variantInfo{}
	for _, v := range variants {
		if v.isCurrent {
			currentVariants = append(currentVariants, v)
		}
	}
	if len(currentVariants) == 0 {
		// No "Current" tag — treat all as current (legacy items)
		currentVariants = variants
	}

	// If only one Current variant, emit one item without a variant label.
	if len(currentVariants) == 1 {
		allowed := map[int]bool{currentVariants[0].index: true}
		implicits, explicits := splitMods(modLines, implicitCount, allowed)
		return []UniqueItem{{
			Name:         name,
			BaseType:     baseType,
			LevelReq:     levelReq,
			ImplicitMods: implicits,
			ExplicitMods: explicits,
		}}
	}

	// Multiple Current variants — one item per variant.
	var items []UniqueItem
	for _, cv := range currentVariants {
		allowed := map[int]bool{cv.index: true}
		implicits, explicits := splitMods(modLines, implicitCount, allowed)
		items = append(items, UniqueItem{
			Name:         name,
			Variant:      cv.label,
			BaseType:     baseType,
			LevelReq:     levelReq,
			ImplicitMods: implicits,
			ExplicitMods: explicits,
		})
	}
	return items
}

// splitMods separates mod lines into implicits and explicits, filtering by variant
// and stripping prefixes. allowedVariants is nil for non-variant items (include all).
// For variant items, a mod is included if it has no variant tag OR its variant set
// intersects allowedVariants.
func splitMods(modLines []string, implicitCount int, allowedVariants map[int]bool) ([]string, []string) {
	var implicits, explicits []string
	modIdx := 0

	for _, line := range modLines {
		// Check variant filter before stripping.
		if allowedVariants != nil {
			varNums := extractVariantNums(line)
			if varNums != nil {
				// Mod is variant-specific — check if any allowed variant matches.
				match := false
				for v := range allowedVariants {
					if varNums[v] {
						match = true
						break
					}
				}
				if !match {
					// This mod doesn't apply to our variant. Still count toward implicit boundary.
					modIdx++
					continue
				}
			}
		}

		clean := stripAllPrefixes(line)
		if clean == "" {
			continue
		}

		if modIdx < implicitCount {
			implicits = append(implicits, clean)
		} else {
			explicits = append(explicits, clean)
		}
		modIdx++
	}

	return implicits, explicits
}

// parseUniquesFile extracts all [[ ... ]] blocks from a PoB Uniques/*.lua file.
func parseUniquesFile(content string) ([]UniqueItem, error) {
	blocks := extractLuaBlocks(content)
	if len(blocks) == 0 {
		return nil, fmt.Errorf("no [[ ... ]] blocks found")
	}

	var items []UniqueItem
	for _, block := range blocks {
		items = append(items, parseUniqueBlock(block)...)
	}
	return items, nil
}

// extractLuaBlocks splits content on [[ ... ]] Lua long string boundaries.
func extractLuaBlocks(content string) []string {
	var blocks []string
	rest := content
	for {
		start := strings.Index(rest, "[[")
		if start < 0 {
			break
		}
		rest = rest[start+2:]
		end := strings.Index(rest, "]]")
		if end < 0 {
			break
		}
		block := strings.TrimSpace(rest[:end])
		if block != "" {
			blocks = append(blocks, block)
		}
		rest = rest[end+2:]
	}
	return blocks
}
