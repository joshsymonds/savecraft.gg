package main

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// StatDescTranslator translates stat IDs + values into human-readable text
// using PoB's StatDescriptions data.
type StatDescTranslator struct {
	entries map[string]*statDescEntry // keyed by stat ID
}

// statDescEntry is one stat description with ordered condition variants.
type statDescEntry struct {
	variants []statDescVariant
}

// statDescVariant is one conditional translation template.
type statDescVariant struct {
	limitMin *int   // nil = wildcard (#)
	limitMax *int   // nil = wildcard (#)
	negate   bool   // apply negate handler before substitution
	text     string // template with {0} placeholder
}

// Translate renders a single stat ID + value into human-readable text.
// Returns "" if the stat ID is unknown or no condition matches.
func (t *StatDescTranslator) Translate(statID string, value int) string {
	entry, ok := t.entries[statID]
	if !ok {
		return ""
	}
	for _, v := range entry.variants {
		if v.matches(value) {
			displayVal := value
			if v.negate {
				displayVal = -displayVal
			}
			return strings.ReplaceAll(v.text, "{0}", strconv.Itoa(displayVal))
		}
	}
	return ""
}

// TranslateAll translates a slice of constantStats, skipping untranslatable ones.
func (t *StatDescTranslator) TranslateAll(stats []SkillStat) []string {
	var result []string
	for _, s := range stats {
		text := t.Translate(s.ID, s.Value)
		if text != "" {
			result = append(result, text)
		}
	}
	return result
}

// Merge adds entries from another translator. First-added wins (no overwrite).
func (t *StatDescTranslator) Merge(other *StatDescTranslator) {
	for id, entry := range other.entries {
		if _, exists := t.entries[id]; !exists {
			t.entries[id] = entry
		}
	}
}

func (v *statDescVariant) matches(value int) bool {
	if v.limitMin != nil && value < *v.limitMin {
		return false
	}
	if v.limitMax != nil && value > *v.limitMax {
		return false
	}
	return true
}

// parseStatDescriptions parses a PoB StatDescriptions/*.lua file into a translator.
func parseStatDescriptions(content string) (*StatDescTranslator, error) {
	translator := &StatDescTranslator{entries: make(map[string]*statDescEntry)}

	// Split into top-level entries: \t[N]={...}
	// Each entry contains a stats={} and variant arrays.
	entryStartRe := regexp.MustCompile(`\n\t\[(\d+)\]=\{`)
	locs := entryStartRe.FindAllStringIndex(content, -1)

	for i, loc := range locs {
		// Entry body runs from after the opening { to the next entry (or EOF).
		bodyStart := loc[1]
		var bodyEnd int
		if i+1 < len(locs) {
			bodyEnd = locs[i+1][0]
		} else {
			bodyEnd = len(content)
		}
		body := content[bodyStart:bodyEnd]

		// Extract stat IDs from stats={[1]="id1", [2]="id2"}
		statIDs := extractStatIDs(body)
		if len(statIDs) == 0 {
			continue
		}

		// Extract variants from the [1]={...} array (first stat dimension).
		variants := extractVariants(body)
		if len(variants) == 0 {
			continue
		}

		entry := &statDescEntry{variants: variants}
		for _, id := range statIDs {
			if _, exists := translator.entries[id]; !exists {
				translator.entries[id] = entry
			}
		}
	}

	if len(translator.entries) == 0 {
		return nil, fmt.Errorf("no stat descriptions found")
	}
	return translator, nil
}

// statIDRe matches [N]="stat_id" inside a stats={} block.
var statIDRe = regexp.MustCompile(`\[\d+\]="([^"]+)"`)

// extractStatIDs pulls stat IDs from the stats={...} section.
func extractStatIDs(body string) []string {
	idx := strings.Index(body, "stats={")
	if idx < 0 {
		return nil
	}
	block := extractNestedBlock(body[idx+7:])
	var ids []string
	for _, m := range statIDRe.FindAllStringSubmatch(block, -1) {
		ids = append(ids, m[1])
	}
	return ids
}

// extractVariants parses the ordered condition variants from a stat description entry.
// The structure is: [1]={ [1]={limit=..., text=...}, [2]={...} }
// where [1] is the stat-dimension index and inner [N] are the condition variants.
func extractVariants(body string) []statDescVariant {
	// Find the first [1]={ which is the stat-dimension array.
	// It appears before name= and stats=.
	dimIdx := strings.Index(body, "[1]={")
	if dimIdx < 0 {
		return nil
	}
	// Skip to the opening brace
	braceStart := strings.Index(body[dimIdx:], "{")
	if braceStart < 0 {
		return nil
	}
	dimBlock := extractNestedBlock(body[dimIdx+braceStart+1:])
	if dimBlock == "" {
		return nil
	}

	// Extract top-level [N]={...} blocks using brace counting (not regex split,
	// since nested structures also contain [N]={).
	return extractTopLevelVariants(dimBlock)
}

// extractTopLevelVariants splits a dimension block into its top-level [N]={...} entries
// using brace depth tracking to avoid matching nested [N]={ patterns.
func extractTopLevelVariants(dimBlock string) []statDescVariant {
	variantRe := regexp.MustCompile(`\[(\d+)\]=\{`)
	var variants []statDescVariant

	pos := 0
	for pos < len(dimBlock) {
		// Find next [N]={ at the current depth (top level)
		loc := variantRe.FindStringIndex(dimBlock[pos:])
		if loc == nil {
			break
		}
		blockStart := pos + loc[1] // position after the opening {
		// Extract the full block using brace counting
		vBody := extractNestedBlock(dimBlock[blockStart:])
		if vBody != "" {
			v := parseVariant(vBody)
			if v.text != "" {
				variants = append(variants, v)
			}
			pos = blockStart + len(vBody) + 1 // skip past closing }
		} else {
			pos = blockStart + 1
		}
	}

	return variants
}

// textRe matches text="..." in a variant body.
var textRe = regexp.MustCompile(`text="([^"]*)"`)

// parseVariant extracts condition, handlers, and text from a single variant body.
func parseVariant(body string) statDescVariant {
	var v statDescVariant

	// Extract text
	if m := textRe.FindStringSubmatch(body); m != nil {
		v.text = m[1]
	}

	// Check for negate handler: k="negate"
	if strings.Contains(body, `k="negate"`) {
		v.negate = true
	}

	// Extract limit conditions.
	// Pattern: limit={ [1]={ [1]=min, [2]=max } }
	// min/max can be integers or "#" (wildcard)
	limIdx := strings.Index(body, "limit={")
	if limIdx >= 0 {
		limBlock := extractNestedBlock(body[limIdx+7:])
		// Find the inner [1]={[1]=min,[2]=max} for the first (only) stat
		innerIdx := strings.Index(limBlock, "[1]={")
		if innerIdx >= 0 {
			innerBlock := extractNestedBlock(limBlock[innerIdx+5:])
			v.limitMin = extractLimitValue(innerBlock, "[1]=")
			v.limitMax = extractLimitValue(innerBlock, "[2]=")
		}
	}

	return v
}

// extractLimitValue extracts a limit bound value. Returns nil for "#" (wildcard).
func extractLimitValue(block, prefix string) *int {
	idx := strings.Index(block, prefix)
	if idx < 0 {
		return nil
	}
	rest := strings.TrimSpace(block[idx+len(prefix):])
	// Check for wildcard
	if strings.HasPrefix(rest, "\"#\"") {
		return nil
	}
	// Parse integer (possibly negative, possibly followed by comma/brace)
	numStr := ""
	for _, c := range rest {
		if c == '-' || (c >= '0' && c <= '9') {
			numStr += string(c)
		} else {
			break
		}
	}
	if numStr == "" {
		return nil
	}
	n, err := strconv.Atoi(numStr)
	if err != nil {
		return nil
	}
	return &n
}
