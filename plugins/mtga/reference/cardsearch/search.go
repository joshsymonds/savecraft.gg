// Package cardsearch implements card lookup queries against Scryfall data.
package cardsearch

import (
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/reference/data"
)

// Query defines the parameters for a card search.
type Query struct {
	Name   string `json:"name"`   // substring match (case-insensitive)
	Colors string `json:"colors"` // color identity filter, e.g. "BR"
	CMC    *int   `json:"cmc"`    // converted mana cost
	CMCOp  string `json:"cmc_op"` // "<=", "=", ">=" (default "=")
	Type   string `json:"type"`   // substring match on type_line
	Text   string `json:"text"`   // substring match on oracle_text
	Format string `json:"format"` // format legality (e.g. "standard")
	Rarity string `json:"rarity"` // exact match
	Set    string `json:"set"`    // exact match on set code
	Sort   string `json:"sort"`   // "name" (default), "cmc"
	Limit  int    `json:"limit"`  // max results (default 20)
}

// Result is a card matching the search query.
type Result struct {
	ArenaID       int               `json:"arenaId"`
	Name          string            `json:"name"`
	ManaCost      string            `json:"manaCost"`
	CMC           float64           `json:"cmc"`
	TypeLine      string            `json:"typeLine"`
	OracleText    string            `json:"oracleText"`
	Colors        []string          `json:"colors"`
	ColorIdentity []string          `json:"colorIdentity"`
	Legalities    map[string]string `json:"legalities"`
	Rarity        string            `json:"rarity"`
	Set           string            `json:"set"`
	Keywords      []string          `json:"keywords"`
}

// Search executes a card search against the embedded Scryfall data.
func Search(q Query) []Result {
	if q.Limit <= 0 {
		q.Limit = 20
	}
	if q.CMCOp == "" {
		q.CMCOp = "="
	}

	nameLower := strings.ToLower(q.Name)
	typeLower := strings.ToLower(q.Type)
	textLower := strings.ToLower(q.Text)
	formatLower := strings.ToLower(q.Format)
	rarityLower := strings.ToLower(q.Rarity)
	setLower := strings.ToLower(q.Set)
	colorsUpper := strings.ToUpper(q.Colors)

	var results []Result

	for _, card := range data.Cards {
		// Name filter.
		if nameLower != "" && !strings.Contains(strings.ToLower(card.Name), nameLower) {
			continue
		}

		// Color identity filter.
		if colorsUpper != "" && !matchColors(card.ColorIdentity, colorsUpper) {
			continue
		}

		// CMC filter.
		if q.CMC != nil {
			cmc := *q.CMC
			switch q.CMCOp {
			case "<=":
				if card.CMC > float64(cmc) {
					continue
				}
			case ">=":
				if card.CMC < float64(cmc) {
					continue
				}
			default: // "="
				if card.CMC != float64(cmc) {
					continue
				}
			}
		}

		// Type filter.
		if typeLower != "" && !strings.Contains(strings.ToLower(card.TypeLine), typeLower) {
			continue
		}

		// Oracle text filter.
		if textLower != "" && !strings.Contains(strings.ToLower(card.OracleText), textLower) {
			continue
		}

		// Format legality filter.
		if formatLower != "" {
			legality, ok := card.Legalities[formatLower]
			if !ok || legality != "legal" {
				continue
			}
		}

		// Rarity filter.
		if rarityLower != "" && strings.ToLower(card.Rarity) != rarityLower {
			continue
		}

		// Set filter.
		if setLower != "" && strings.ToLower(card.Set) != setLower {
			continue
		}

		results = append(results, Result{
			ArenaID:       card.ArenaID,
			Name:          card.Name,
			ManaCost:      card.ManaCost,
			CMC:           card.CMC,
			TypeLine:      card.TypeLine,
			OracleText:    card.OracleText,
			Colors:        card.Colors,
			ColorIdentity: card.ColorIdentity,
			Legalities:    card.Legalities,
			Rarity:        card.Rarity,
			Set:           card.Set,
			Keywords:      card.Keywords,
		})
	}

	// Sort results.
	switch q.Sort {
	case "cmc":
		sort.Slice(results, func(i, j int) bool {
			if results[i].CMC != results[j].CMC {
				return results[i].CMC < results[j].CMC
			}
			return results[i].Name < results[j].Name
		})
	default: // "name"
		sort.Slice(results, func(i, j int) bool {
			return results[i].Name < results[j].Name
		})
	}

	if len(results) > q.Limit {
		results = results[:q.Limit]
	}

	return results
}

// matchColors checks if a card's color identity is a subset of the requested colors.
// A card with no colors only matches if "C" (colorless) is requested.
func matchColors(cardColors []string, requestedColors string) bool {
	if len(cardColors) == 0 {
		return strings.Contains(requestedColors, "C")
	}
	for _, c := range cardColors {
		if !strings.Contains(requestedColors, c) {
			return false
		}
	}
	return true
}
