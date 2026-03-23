package manabase

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/reference/data"
)

// DeckEntry is a card in the deck to analyze.
type DeckEntry struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// Query is the input for a mana base analysis.
type Query struct {
	Deck     []DeckEntry `json:"deck"`
	DeckSize int         `json:"deck_size"` // 40, 60, 80, 99 (default 60)
}

// ColorRequirement is the computed source requirement for one color.
type ColorRequirement struct {
	Color          string `json:"color"`
	SourcesNeeded  int    `json:"sourcesNeeded"`
	MostDemanding  string `json:"mostDemandingSpell"`
	CostPattern    string `json:"costPattern"`
	PipsRequired   int    `json:"pipsRequired"`
	IsGoldAdjusted bool   `json:"isGoldAdjusted,omitempty"`
}

// Result is the output of the mana base analysis.
type Result struct {
	Formatted string `json:"formatted"`
}

// Analyze computes mana source requirements for a decklist.
func Analyze(q Query) *Result {
	if q.DeckSize == 0 {
		q.DeckSize = 60
	}

	// Resolve card names to mana costs.
	type cardInfo struct {
		name     string
		manaCost string
		colors   []string
		count    int
	}

	var cards []cardInfo
	for _, entry := range q.Deck {
		card := findCard(entry.Name)
		if card == nil || card.ManaCost == "" {
			continue
		}
		cards = append(cards, cardInfo{
			name:     card.Name,
			manaCost: card.ManaCost,
			colors:   card.Colors,
			count:    entry.Count,
		})
	}

	if len(cards) == 0 {
		return &Result{Formatted: "No spells with mana costs found in deck.\n"}
	}

	// For each color, find the most demanding spell.
	colorDemands := map[string]struct {
		pips     int
		generic  int
		cardName string
		isGold   bool
		totalCMC int
	}{}

	allColors := []string{"W", "U", "B", "R", "G"}

	for _, c := range cards {
		pips := parsePips(c.manaCost)
		generic := parseGeneric(c.manaCost)
		isGold := len(c.colors) > 1
		totalCMC := generic
		for _, p := range pips {
			totalCMC += p
		}

		for _, color := range allColors {
			p := pips[color]
			if p == 0 {
				continue
			}

			existing, ok := colorDemands[color]
			if !ok || isDemanding(p, totalCMC, existing.pips, existing.totalCMC) {
				colorDemands[color] = struct {
					pips     int
					generic  int
					cardName string
					isGold   bool
					totalCMC int
				}{p, generic, c.name, isGold, totalCMC}
			}
		}
	}

	// Look up Karsten table for each color.
	var requirements []ColorRequirement
	for _, color := range allColors {
		demand, ok := colorDemands[color]
		if !ok {
			continue
		}

		pattern := CostPattern{Generic: demand.totalCMC - demand.pips, Pips: demand.pips}
		sources := SourceRequirement(pattern, q.DeckSize)

		// Gold card adjustment: +1 per color.
		adjusted := false
		if demand.isGold && sources > 0 {
			sources++
			adjusted = true
		}

		requirements = append(requirements, ColorRequirement{
			Color:          color,
			SourcesNeeded:  sources,
			MostDemanding:  demand.cardName,
			CostPattern:    patternKey(pattern),
			PipsRequired:   demand.pips,
			IsGoldAdjusted: adjusted,
		})
	}

	// Sort by sources needed descending.
	sort.Slice(requirements, func(i, j int) bool {
		return requirements[i].SourcesNeeded > requirements[j].SourcesNeeded
	})

	// Format output.
	spellCount := 0
	for _, c := range cards {
		spellCount += c.count
	}
	return &Result{Formatted: formatAnalysis(q, spellCount, requirements)}
}

// isDemanding returns true if (pips, totalCMC) is more demanding than (ePips, eTotalCMC).
// More colored pips = more demanding. At equal pips, lower total CMC = must be cast earlier = more demanding.
func isDemanding(pips, totalCMC, ePips, eTotalCMC int) bool {
	if pips != ePips {
		return pips > ePips
	}
	return totalCMC < eTotalCMC
}

// parsePips extracts the number of colored pips per color from a Scryfall mana cost string.
// e.g., "{2}{B}{B}" → {"B": 2}, "{W}{U}{B}" → {"W": 1, "U": 1, "B": 1}
func parsePips(manaCost string) map[string]int {
	pips := map[string]int{}
	for _, part := range strings.Split(manaCost, "{") {
		part = strings.TrimRight(part, "}")
		switch part {
		case "W", "U", "B", "R", "G":
			pips[part]++
		}
	}
	return pips
}

// parseGeneric extracts the generic mana from a Scryfall mana cost string.
// e.g., "{2}{B}{B}" → 2, "{W}{U}" → 0, "{X}{R}" → 0
func parseGeneric(manaCost string) int {
	total := 0
	for _, part := range strings.Split(manaCost, "{") {
		part = strings.TrimRight(part, "}")
		if n, err := strconv.Atoi(part); err == nil {
			total += n
		}
	}
	return total
}

func findCard(name string) *data.Card {
	nameLower := strings.ToLower(name)
	for _, card := range data.Cards {
		if strings.ToLower(card.Name) == nameLower {
			return &card
		}
	}
	// Substring match as fallback.
	for _, card := range data.Cards {
		if strings.Contains(strings.ToLower(card.Name), nameLower) {
			return &card
		}
	}
	return nil
}

var colorNames = map[string]string{
	"W": "White", "U": "Blue", "B": "Black", "R": "Red", "G": "Green",
}

func formatAnalysis(q Query, spellCount int, reqs []ColorRequirement) string {
	var b strings.Builder

	landCount := AssumedLandCounts[closestDeckSize(q.DeckSize)]

	fmt.Fprintf(&b, "Mana Base Analysis — %d-card deck (%d spells, ~%d lands assumed)\n", q.DeckSize, spellCount, landCount)
	fmt.Fprintf(&b, "Based on Frank Karsten's mana source requirements (~%d%%+ consistency on curve)\n\n", 89)

	if len(reqs) == 0 {
		b.WriteString("No colored mana requirements found.\n")
		return b.String()
	}

	fmt.Fprintf(&b, "%-8s %8s  %-8s  %s\n", "Color", "Sources", "Pattern", "Most Demanding Spell")
	for _, r := range reqs {
		colorLabel := fmt.Sprintf("%s (%s)", colorNames[r.Color], r.Color)
		adj := ""
		if r.IsGoldAdjusted {
			adj = " (+1 gold)"
		}
		fmt.Fprintf(&b, "%-14s %3d  %-8s  %s%s\n",
			colorLabel, r.SourcesNeeded, r.CostPattern, r.MostDemanding, adj)
	}

	// Total sources needed (sum, but note overlap from dual lands).
	totalSources := 0
	for _, r := range reqs {
		totalSources += r.SourcesNeeded
	}
	if len(reqs) > 1 {
		fmt.Fprintf(&b, "\nTotal colored sources needed: %d (dual/tri lands count toward multiple colors)\n", totalSources)
	}

	fmt.Fprintf(&b, "\nKarsten guidelines assume %d lands in a %d-card deck.\n", landCount, q.DeckSize)
	if len(reqs) > 1 {
		b.WriteString("For multicolor decks, dual lands and fetch lands satisfy multiple color requirements simultaneously.\n")
	}

	return b.String()
}
