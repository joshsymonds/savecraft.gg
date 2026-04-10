package main

import (
	"fmt"
	"math"
	"regexp"
	"strings"
)

// RawStatTranslation is one entry from RePoE's stat_translations.json.
type RawStatTranslation struct {
	IDs     []string             `json:"ids"`
	English []TranslationVariant `json:"English"`
	Hidden  bool                 `json:"hidden"`
}

// TranslationVariant is one conditional translation within an entry.
// The English array is evaluated top-to-bottom; first match wins.
type TranslationVariant struct {
	Condition     []Condition `json:"condition"`
	Format        []string    `json:"format"`
	IndexHandlers [][]string  `json:"index_handlers"`
	String        string      `json:"string"`
}

// Condition tests whether a stat value falls within a range.
// Empty/nil fields mean "any value" (wildcard).
type Condition struct {
	Min     *int `json:"min"`
	Max     *int `json:"max"`
	Negated bool `json:"negated"`
}

// StatValue is a stat ID + value pair for translation.
type StatValue struct {
	ID    string
	Value int
}

// StatTranslator translates stat IDs + values into human-readable text.
type StatTranslator struct {
	// byID maps a stat ID to its parent entry.
	byID map[string]*translationEntry
}

type translationEntry struct {
	ids     []string
	english []TranslationVariant
	hidden  bool
}

// NewStatTranslator builds a translator from parsed stat_translations.json entries.
func NewStatTranslator(entries []RawStatTranslation) *StatTranslator {
	t := &StatTranslator{
		byID: make(map[string]*translationEntry, len(entries)),
	}
	for i := range entries {
		e := &translationEntry{
			ids:     entries[i].IDs,
			english: entries[i].English,
			hidden:  entries[i].Hidden,
		}
		for _, id := range entries[i].IDs {
			t.byID[id] = e
		}
	}
	return t
}

// Template returns the raw template string for a set of stat values (first
// matching condition variant). Used to extract mod names without specific values.
// Returns "" if unknown or no condition matches.
func (t *StatTranslator) Template(stats []StatValue) string {
	if len(stats) == 0 {
		return ""
	}
	entry, ok := t.byID[stats[0].ID]
	if !ok {
		return ""
	}
	values := make([]int, len(entry.ids))
	idToIdx := make(map[string]int, len(entry.ids))
	for i, id := range entry.ids {
		idToIdx[id] = i
	}
	for _, sv := range stats {
		if idx, ok := idToIdx[sv.ID]; ok {
			values[idx] = sv.Value
		}
	}
	for _, variant := range entry.english {
		if matchesConditions(variant.Condition, values) {
			return variant.String
		}
	}
	return ""
}

// Translate renders a list of stat values into a human-readable string.
// All stats must belong to the same translation entry (multi-stat entries).
// Returns "" if the stat ID is unknown or no condition matches.
func (t *StatTranslator) Translate(stats []StatValue) string {
	if len(stats) == 0 {
		return ""
	}

	entry, ok := t.byID[stats[0].ID]
	if !ok {
		return ""
	}

	// Build value array indexed by position in entry.ids.
	values := make([]int, len(entry.ids))
	idToIdx := make(map[string]int, len(entry.ids))
	for i, id := range entry.ids {
		idToIdx[id] = i
	}
	for _, sv := range stats {
		if idx, ok := idToIdx[sv.ID]; ok {
			values[idx] = sv.Value
		}
	}

	// Evaluate conditions top-to-bottom.
	for _, variant := range entry.english {
		if !matchesConditions(variant.Condition, values) {
			continue
		}
		return renderVariant(variant, values)
	}

	return ""
}

// matchesConditions checks if all conditions match the given values.
func matchesConditions(conditions []Condition, values []int) bool {
	for i, cond := range conditions {
		if i >= len(values) {
			return false
		}
		v := values[i]
		inRange := true
		if cond.Min != nil && v < *cond.Min {
			inRange = false
		}
		if cond.Max != nil && v > *cond.Max {
			inRange = false
		}
		if cond.Negated {
			inRange = !inRange
		}
		if !inRange {
			return false
		}
	}
	return true
}

// renderVariant applies handlers, formats values, and substitutes into the template.
func renderVariant(variant TranslationVariant, values []int) string {
	result := variant.String

	for i, val := range values {
		if i >= len(variant.Format) {
			break
		}

		format := variant.Format[i]
		if format == "ignore" {
			continue
		}

		// Apply handlers.
		fval := float64(val)
		var handlers []string
		if i < len(variant.IndexHandlers) && variant.IndexHandlers[i] != nil {
			handlers = variant.IndexHandlers[i]
		}
		dp := -1 // -1 means auto (no trailing zeros)
		ifRequired := false

		for _, h := range handlers {
			switch h {
			case "negate":
				fval = -fval
			case "double":
				fval *= 2
			case "negate_and_double":
				fval *= -2
			case "times_twenty":
				fval *= 20
			case "times_one_point_five":
				fval *= 1.5
			case "30%_of_value":
				fval *= 0.3
			case "60%_of_value":
				fval *= 0.6
			case "multiplicative_damage_modifier":
				fval += 100
			case "multiply_by_four":
				fval *= 4
			case "divide_by_one_hundred":
				fval /= 100
			case "divide_by_one_hundred_2dp":
				fval /= 100
				dp = 2
			case "divide_by_one_hundred_2dp_if_required":
				fval /= 100
				dp = 2
				ifRequired = true
			case "divide_by_one_hundred_and_negate":
				fval = -fval / 100
			case "divide_by_ten_0dp":
				fval /= 10
				dp = 0
			case "divide_by_ten_1dp":
				fval /= 10
				dp = 1
			case "divide_by_ten_1dp_if_required":
				fval /= 10
				dp = 1
				ifRequired = true
			case "divide_by_twelve":
				fval /= 12
			case "divide_by_fifteen_0dp":
				fval /= 15
				dp = 0
			case "divide_by_twenty_then_double_0dp":
				fval = fval / 20 * 2
				dp = 0
			case "divide_by_two_0dp":
				fval /= 2
				dp = 0
			case "divide_by_three":
				fval /= 3
			case "divide_by_four":
				fval /= 4
			case "divide_by_five":
				fval /= 5
			case "divide_by_six":
				fval /= 6
			case "divide_by_fifty":
				fval /= 50
			case "divide_by_one_thousand":
				fval /= 1000
			case "per_minute_to_per_second":
				fval /= 60
			case "per_minute_to_per_second_0dp":
				fval /= 60
				dp = 0
			case "per_minute_to_per_second_1dp":
				fval /= 60
				dp = 1
			case "per_minute_to_per_second_2dp":
				fval /= 60
				dp = 2
			case "per_minute_to_per_second_2dp_if_required":
				fval /= 60
				dp = 2
				ifRequired = true
			case "milliseconds_to_seconds":
				fval /= 1000
			case "milliseconds_to_seconds_0dp":
				fval /= 1000
				dp = 0
			case "milliseconds_to_seconds_1dp":
				fval /= 1000
				dp = 1
			case "milliseconds_to_seconds_2dp":
				fval /= 1000
				dp = 2
			case "milliseconds_to_seconds_2dp_if_required":
				fval /= 1000
				dp = 2
				ifRequired = true
			case "deciseconds_to_seconds":
				fval /= 10
			case "old_leech_percent", "old_leech_permyriad":
				// Legacy leech formula — approximate as divide by 100 for permyriad
				if h == "old_leech_permyriad" {
					fval /= 100
				}
			default:
				// Lookup handlers (affliction_reward_type, passive_hash, etc.)
				// Rare and not relevant for crafting mods — pass value through.
			}
		}

		// Format the value.
		formatted := formatValue(fval, dp, ifRequired)

		// Apply +# format.
		if format == "+#" && fval >= 0 {
			formatted = "+" + formatted
		}

		// Substitute placeholder.
		placeholder := fmt.Sprintf("{%d}", i)
		result = strings.Replace(result, placeholder, formatted, 1)
	}

	return result
}

// formatValue renders a float as a string, handling decimal places.
func formatValue(v float64, dp int, ifRequired bool) string {
	if dp >= 0 {
		if ifRequired && isWhole(v) {
			return fmt.Sprintf("%g", v)
		}
		return fmt.Sprintf("%.*f", dp, v)
	}
	// Auto: show decimals only if fractional.
	if isWhole(v) {
		return fmt.Sprintf("%d", int(math.Round(v)))
	}
	return fmt.Sprintf("%g", v)
}

// isWhole returns true if the float has no significant fractional part.
func isWhole(v float64) bool {
	return v == math.Trunc(v)
}

// placeholderRe matches {0}, {1}, etc. in template strings.
var placeholderRe = regexp.MustCompile(`\{[0-9]+\}`)

// extractModName strips numeric placeholders from a translation template
// to produce a clean mod effect description (e.g., "% increased Physical Damage").
func extractModName(template string) string {
	result := placeholderRe.ReplaceAllString(template, "")
	// Clean up: collapse multiple spaces, trim leading +/- with spaces.
	result = strings.Join(strings.Fields(result), " ")
	result = strings.TrimLeft(result, "+- ")
	return result
}
