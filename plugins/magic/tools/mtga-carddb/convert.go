package main

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// convertManaCost converts MTGA's mana notation (e.g., "o2oUoB") to
// Scryfall's format (e.g., "{2}{U}{B}").
func convertManaCost(s string) string {
	if s == "" {
		return ""
	}
	var b strings.Builder
	// Split on "o" prefix — each segment after the first is a mana symbol.
	parts := strings.Split(s, "o")
	for _, p := range parts {
		if p == "" {
			continue
		}
		b.WriteByte('{')
		b.WriteString(p)
		b.WriteByte('}')
	}
	return b.String()
}

// computeCMC computes converted mana cost from a Scryfall-format mana cost string.
// Each {N} contributes N, each color symbol contributes 1, {X} contributes 0.
func computeCMC(manaCost string) float64 {
	if manaCost == "" {
		return 0
	}
	var total float64
	for _, part := range strings.Split(manaCost, "{") {
		sym := strings.TrimSuffix(part, "}")
		if sym == "" || sym == "X" {
			continue
		}
		n, err := strconv.Atoi(sym)
		if err == nil {
			total += float64(n)
		} else {
			// Color symbol (W, U, B, R, G) = 1 each
			total++
		}
	}
	return total
}

// colorMap maps MTGA color enum values to Scryfall color letters.
var colorMap = map[int]string{
	1: "W",
	2: "U",
	3: "B",
	4: "R",
	5: "G",
}

// mapColors converts a comma-separated MTGA color enum string to a Scryfall color array.
func mapColors(csv string) []string {
	if csv == "" {
		return nil
	}
	parts := strings.Split(csv, ",")
	var result []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		n, err := strconv.Atoi(p)
		if err != nil {
			continue
		}
		if c, ok := colorMap[n]; ok {
			result = append(result, c)
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

// buildTypeLine constructs a Magic type line from MTGA enum ID strings.
// Format: "Supertypes Types — Subtypes" (em dash separator).
func buildTypeLine(supertypes, types, subtypes string, enumMap map[string]map[int]string) string {
	resolve := func(csv string, category string) []string {
		if csv == "" {
			return nil
		}
		var result []string
		for _, p := range strings.Split(csv, ",") {
			p = strings.TrimSpace(p)
			n, err := strconv.Atoi(p)
			if err != nil {
				continue
			}
			if name, ok := enumMap[category][n]; ok {
				result = append(result, name)
			}
		}
		return result
	}

	var parts []string
	parts = append(parts, resolve(supertypes, "SuperType")...)
	parts = append(parts, resolve(types, "CardType")...)

	main := strings.Join(parts, " ")
	subs := resolve(subtypes, "SubType")
	if len(subs) > 0 {
		return main + " \u2014 " + strings.Join(subs, " ")
	}
	return main
}

// producedManaRe matches MTGA mana ability patterns like "{oT}: Add {oU}."
var producedManaRe = regexp.MustCompile(`\{oT\}: Add \{o([WUBRGC])\}`)

// parseProducedMana extracts the set of mana colors a card can produce
// from its ability texts. Returns a sorted, deduplicated slice.
func parseProducedMana(abilityTexts []string) []string {
	seen := make(map[string]bool)
	for _, text := range abilityTexts {
		for _, match := range producedManaRe.FindAllStringSubmatch(text, -1) {
			color := match[1]
			if color != "C" { // Skip colorless
				seen[color] = true
			}
		}
		// Handle "Add one mana of any color"
		if strings.Contains(text, "Add one mana of any color") {
			for _, c := range []string{"W", "U", "B", "R", "G"} {
				seen[c] = true
			}
		}
	}
	if len(seen) == 0 {
		return nil
	}
	result := make([]string, 0, len(seen))
	for c := range seen {
		result = append(result, c)
	}
	sort.Strings(result)
	return result
}

// manaNotationRe matches MTGA mana notation {oX} in oracle text.
var manaNotationRe = regexp.MustCompile(`\{o([^}]+)\}`)

// assembleOracleText joins ability texts with newlines, replaces CARDNAME
// with the card's actual name, strips UI markup, and converts MTGA mana
// notation ({oU}) to Scryfall notation ({U}).
func assembleOracleText(abilityTexts []string, cardName string) string {
	if len(abilityTexts) == 0 {
		return ""
	}
	var parts []string
	for _, text := range abilityTexts {
		text = strings.ReplaceAll(text, "CARDNAME", cardName)
		text = stripMarkup(text)
		text = manaNotationRe.ReplaceAllString(text, "{$1}")
		parts = append(parts, text)
	}
	return strings.Join(parts, "\n")
}
