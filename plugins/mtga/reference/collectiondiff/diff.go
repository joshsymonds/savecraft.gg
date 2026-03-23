// Package collectiondiff computes the wildcard cost to complete a target decklist.
package collectiondiff

import (
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/reference/data"
)

// DeckEntry is a card in the target deck.
type DeckEntry struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// CollectionEntry is a card in the player's collection.
type CollectionEntry struct {
	ArenaID int `json:"arenaId"`
	Count   int `json:"count"`
}

// MissingCard is a card the player needs to craft.
type MissingCard struct {
	Name   string `json:"name"`
	Count  int    `json:"count"`
	Rarity string `json:"rarity"`
}

// WildcardCost summarizes the total wildcard cost by rarity.
type WildcardCost struct {
	Common   int `json:"common"`
	Uncommon int `json:"uncommon"`
	Rare     int `json:"rare"`
	Mythic   int `json:"mythic"`
	Total    int `json:"total"`
}

// DiffResult is the output of the collection diff.
type DiffResult struct {
	Missing      []MissingCard `json:"missing"`
	WildcardCost WildcardCost  `json:"wildcardCost"`
}

// Diff computes the cards missing from the collection to complete the target deck.
func Diff(target []DeckEntry, collection []CollectionEntry) DiffResult {
	// Build collection lookup: card name (lowercase) → count owned.
	// We need to map arena_id → name first.
	owned := make(map[string]int)
	for _, c := range collection {
		card := data.Cards[c.ArenaID]
		if card.Name != "" {
			owned[strings.ToLower(card.Name)] += c.Count
		}
	}

	// Build name → rarity from the owned cards + target cards only (not all 9K+ cards).
	rarityByName := make(map[string]string, len(collection))
	for _, c := range collection {
		card := data.Cards[c.ArenaID]
		if card.Name != "" {
			rarityByName[strings.ToLower(card.Name)] = card.Rarity
		}
	}
	// Also look up rarity for target cards not in collection.
	for _, t := range target {
		nameLower := strings.ToLower(t.Name)
		if _, ok := rarityByName[nameLower]; !ok {
			// Linear search through Cards for unowned cards — only for missing entries.
			for _, card := range data.Cards {
				if strings.ToLower(card.Name) == nameLower {
					rarityByName[nameLower] = card.Rarity
					break
				}
			}
		}
	}

	var result DiffResult
	for _, t := range target {
		nameLower := strings.ToLower(t.Name)
		have := owned[nameLower]
		need := t.Count - have
		if need <= 0 {
			continue
		}

		rarity := rarityByName[nameLower]
		result.Missing = append(result.Missing, MissingCard{
			Name:   t.Name,
			Count:  need,
			Rarity: rarity,
		})

		switch rarity {
		case "common":
			result.WildcardCost.Common += need
		case "uncommon":
			result.WildcardCost.Uncommon += need
		case "rare":
			result.WildcardCost.Rare += need
		case "mythic":
			result.WildcardCost.Mythic += need
		}
		result.WildcardCost.Total += need
	}

	return result
}
