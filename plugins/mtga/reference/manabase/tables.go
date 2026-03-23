// Package manabase implements Frank Karsten's mana source requirement calculations.
//
// Data source: Frank Karsten, "How Many Sources Do You Need to Consistently
// Cast Your Spells? A 2022 Update" (ChannelFireball/TCGPlayer).
//
// The tables encode the minimum number of colored sources needed to cast a spell
// on curve with ~90+CMC% consistency, conditional on drawing enough lands, under
// the London Mulligan rule with realistic mulligan strategies.
package manabase

import "strconv"

// CostPattern represents a mana cost in terms of colored pips.
// "C" = one colored pip, "CC" = two, "1C" = one generic + one colored, etc.
type CostPattern struct {
	Generic int // number of generic mana
	Pips    int // number of colored pips of one color
}

// SourceRequirement returns the number of colored sources needed for a given
// cost pattern and deck size. Returns 0 if the pattern isn't in the tables.
func SourceRequirement(pattern CostPattern, deckSize int) int {
	key := patternKey(pattern)
	table, ok := karstenTables[deckSize]
	if !ok {
		// Interpolate: use closest deck size.
		table = karstenTables[closestDeckSize(deckSize)]
	}
	return table[key]
}

func patternKey(p CostPattern) string {
	if p.Generic == 0 {
		switch p.Pips {
		case 1:
			return "C"
		case 2:
			return "CC"
		case 3:
			return "CCC"
		case 4:
			return "CCCC"
		case 5:
			return "CCCCC"
		}
	}
	// Build key like "1C", "2CC", "3CCC"
	key := ""
	if p.Generic > 0 {
		key = strconv.Itoa(p.Generic)
	}
	for range p.Pips {
		key += "C"
	}
	return key
}

func closestDeckSize(n int) int {
	sizes := []int{40, 60, 80, 99}
	best := sizes[0]
	for _, s := range sizes {
		if abs(s-n) < abs(best-n) {
			best = s
		}
	}
	return best
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// Karsten's published tables: costPattern → required colored sources.
// From "How Many Sources Do You Need to Consistently Cast Your Spells? A 2022 Update"
//
// Consistency target: 89+CMC % on the play, conditional on drawing enough lands.
// Assumed land counts: 40-card=17, 60-card=25, 80-card=35, 99-card=41.
var karstenTables = map[int]map[string]int{
	60: {
		"C": 14, "1C": 13, "2C": 12, "3C": 10, "4C": 9, "5C": 9,
		"CC": 21, "1CC": 18, "2CC": 16, "3CC": 15, "4CC": 13, "5CC": 12,
		"CCC": 23, "1CCC": 21, "2CCC": 19, "3CCC": 17, "4CCC": 16,
		"CCCC": 24, "1CCCC": 22,
		"CCCCC": 0, // Not in Karsten's standard table
	},
	40: {
		"C": 9, "1C": 9, "2C": 8, "3C": 7, "4C": 6, "5C": 6,
		"CC": 14, "1CC": 12, "2CC": 11, "3CC": 10, "4CC": 9, "5CC": 8,
		"CCC": 16, "1CCC": 14, "2CCC": 13, "3CCC": 11, "4CCC": 10,
		"CCCC": 17, "1CCCC": 15,
	},
	80: {
		"C": 19, "1C": 18, "2C": 16, "3C": 15, "4C": 14, "5C": 12,
		"CC": 28, "1CC": 25, "2CC": 23, "3CC": 20, "4CC": 19, "5CC": 17,
		"CCC": 32, "1CCC": 29, "2CCC": 26, "3CCC": 24, "4CCC": 22,
		"CCCC": 34, "1CCCC": 31,
	},
	99: {
		"C": 19, "1C": 19, "2C": 18, "3C": 16, "4C": 15, "5C": 14,
		"CC": 30, "1CC": 28, "2CC": 26, "3CC": 23, "4CC": 22, "5CC": 20,
		"CCC": 36, "1CCC": 33, "2CCC": 30, "3CCC": 28, "4CCC": 26,
		"CCCC": 39, "1CCCC": 36,
	},
}

// AssumedLandCounts is the number of lands assumed for each deck size in Karsten's model.
var AssumedLandCounts = map[int]int{
	40: 17,
	60: 25,
	80: 35,
	99: 41,
}
