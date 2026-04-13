package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// ── Commander page (json.edhrec.com/pages/commanders/{slug}.json) ──

type commanderPage struct {
	Similar   []commanderSimilar `json:"similar"`
	Panels    commanderPanels    `json:"panels"`
	Container struct {
		JSONDict struct {
			Card      commanderCard       `json:"card"`
			CardLists []commanderCardList `json:"cardlists"`
		} `json:"json_dict"`
	} `json:"container"`
}

type commanderCard struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Sanitized     string   `json:"sanitized"`
	ColorIdentity []string `json:"color_identity"`
	NumDecks      int      `json:"num_decks"`
	Rank          int      `json:"rank"`
	Salt          float64  `json:"salt"`
}

type commanderCardList struct {
	Tag       string              `json:"tag"`
	Header    string              `json:"header"`
	CardViews []commanderCardView `json:"cardviews"`
}

type commanderCardView struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Synergy        float64 `json:"synergy"`
	Inclusion      int     `json:"inclusion"`
	NumDecks       int     `json:"num_decks"`
	PotentialDecks int     `json:"potential_decks"`
	TrendZScore    float64 `json:"trend_zscore"`
}

type commanderSimilar struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type commanderPanels struct {
	ManaCurve map[string]float64 `json:"mana_curve"`
	TagLinks  []commanderTagLink `json:"taglinks"`
}

type commanderTagLink struct {
	Count int    `json:"count"`
	Slug  string `json:"slug"`
	Value string `json:"value"`
}

// Category tags we keep from cardlists. Everything else is dropped.
var keptCategories = map[string]bool{
	"newcards":         true,
	"highsynergycards": true,
	"topcards":         true,
	"gamechangers":     true,
	"creatures":        true,
	"instants":         true,
	"sorceries":        true,
	"utilityartifacts": true,
	"enchantments":     true,
	"planeswalkers":    true,
	"utilitylands":     true,
	"manaartifacts":    true,
	"lands":            true,
}

// ParsedCommander is the stripped, structured representation used downstream.
type ParsedCommander struct {
	ScryfallID    string
	Name          string
	Slug          string
	ColorIdentity []string
	DeckCount     int
	Rank          int
	Salt          float64

	Themes  []ThemeEntry
	Similar []SimilarCommander
	Curve   []CurvePoint
	Recs    []Recommendation
}

type ThemeEntry struct {
	Slug  string
	Value string
	Count int
}

type SimilarCommander struct {
	ScryfallID string
	Name       string
}

type CurvePoint struct {
	CMC      int
	AvgCount float64
}

type Recommendation struct {
	CardName       string
	Category       string
	Synergy        float64
	Inclusion      int
	PotentialDecks int
	TrendZScore    float64
}

// ParseCommanderPage parses a raw commander page JSON payload. Returns an
// error only on JSON decode failure.
func ParseCommanderPage(data []byte) (*ParsedCommander, error) {
	var p commanderPage
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("decode commander page: %w", err)
	}

	card := p.Container.JSONDict.Card
	pc := &ParsedCommander{
		ScryfallID:    card.ID,
		Name:          card.Name,
		Slug:          card.Sanitized,
		ColorIdentity: card.ColorIdentity,
		DeckCount:     card.NumDecks,
		Rank:          card.Rank,
		Salt:          card.Salt,
	}

	// Themes
	for _, t := range p.Panels.TagLinks {
		if t.Slug == "" {
			continue
		}
		pc.Themes = append(pc.Themes, ThemeEntry{Slug: t.Slug, Value: t.Value, Count: t.Count})
	}

	// Similar commanders
	for _, s := range p.Similar {
		if s.ID == "" {
			continue
		}
		pc.Similar = append(pc.Similar, SimilarCommander{ScryfallID: s.ID, Name: s.Name})
	}

	// Mana curve — map keys are strings, parse to ints
	for k, v := range p.Panels.ManaCurve {
		cmc, err := strconv.Atoi(k)
		if err != nil {
			continue
		}
		pc.Curve = append(pc.Curve, CurvePoint{CMC: cmc, AvgCount: v})
	}

	// Recommendations — only keep configured categories, dedupe by (card, category)
	seen := make(map[string]bool)
	for _, cl := range p.Container.JSONDict.CardLists {
		if !keptCategories[cl.Tag] {
			continue
		}
		for _, cv := range cl.CardViews {
			if cv.Name == "" {
				continue
			}
			key := cl.Tag + "|" + cv.Name
			if seen[key] {
				continue
			}
			seen[key] = true
			pc.Recs = append(pc.Recs, Recommendation{
				CardName:       cv.Name,
				Category:       cl.Tag,
				Synergy:        cv.Synergy,
				Inclusion:      cv.Inclusion,
				PotentialDecks: cv.PotentialDecks,
				TrendZScore:    cv.TrendZScore,
			})
		}
	}

	return pc, nil
}

// ── Combos page (json.edhrec.com/pages/combos/{slug}.json) ──

type combosPage struct {
	Container struct {
		JSONDict struct {
			CardLists []combosEntry `json:"cardlists"`
		} `json:"json_dict"`
	} `json:"container"`
}

type combosEntry struct {
	Combo     comboInfo       `json:"combo"`
	CardViews []comboCardView `json:"cardviews"`
}

type comboInfo struct {
	ComboID    string   `json:"comboId"`
	Colors     string   `json:"colors"`
	Count      int      `json:"count"`
	Percentage float64  `json:"percentage"`
	Rank       int      `json:"rank"`
	CardIDs    []string `json:"cardIds"`
	Results    []string `json:"results"`
	ComboVote  struct {
		Bracket string `json:"bracket"`
	} `json:"comboVote"`
}

type comboCardView struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Combo is the parsed representation we store.
type Combo struct {
	ComboID      string
	CardNames    []string
	CardIDs      []string
	Colors       string
	Results      []string
	DeckCount    int
	Percentage   float64
	BracketScore float64 // parsed from ComboVote.Bracket if numeric
}

// ParseCombosPage parses the combos JSON payload for a commander.
func ParseCombosPage(data []byte) ([]Combo, error) {
	var p combosPage
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("decode combos: %w", err)
	}
	var out []Combo
	for _, e := range p.Container.JSONDict.CardLists {
		if e.Combo.ComboID == "" {
			continue
		}
		names := make([]string, 0, len(e.CardViews))
		for _, cv := range e.CardViews {
			names = append(names, cv.Name)
		}
		var bracket float64
		if e.Combo.ComboVote.Bracket != "" {
			if v, err := strconv.ParseFloat(e.Combo.ComboVote.Bracket, 64); err == nil {
				bracket = v
			}
		}
		out = append(out, Combo{
			ComboID:      e.Combo.ComboID,
			CardNames:    names,
			CardIDs:      e.Combo.CardIDs,
			Colors:       e.Combo.Colors,
			Results:      e.Combo.Results,
			DeckCount:    e.Combo.Count,
			Percentage:   e.Combo.Percentage,
			BracketScore: bracket,
		})
	}
	return out, nil
}

// ── Average decks page (json.edhrec.com/pages/average-decks/{slug}.json) ──

type averageDecksPage struct {
	Deck      []string `json:"deck"`
	Container struct {
		JSONDict struct {
			CardLists []averageDeckList `json:"cardlists"`
		} `json:"json_dict"`
	} `json:"container"`
}

type averageDeckList struct {
	Tag       string            `json:"tag"`
	CardViews []averageCardView `json:"cardviews"`
}

type averageCardView struct {
	Name string `json:"name"`
}

// AverageDeckEntry is a single card in the "average" decklist.
type AverageDeckEntry struct {
	CardName string
	Quantity int
	Category string
}

// deckEntryRe matches "1 Card Name" or "4 Forest" lines from the deck array.
var deckEntryRe = regexp.MustCompile(`^(\d+)\s+(.+)$`)

// ParseAverageDecksPage parses the average-decks JSON, combining the flat
// "deck" array (for quantities) with cardlists (for categories).
func ParseAverageDecksPage(data []byte) ([]AverageDeckEntry, error) {
	var p averageDecksPage
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("decode average decks: %w", err)
	}

	// Build category map from cardlists
	category := make(map[string]string)
	for _, cl := range p.Container.JSONDict.CardLists {
		for _, cv := range cl.CardViews {
			if cv.Name != "" {
				category[cv.Name] = cl.Tag
			}
		}
	}

	seen := make(map[string]bool)
	var out []AverageDeckEntry
	for _, line := range p.Deck {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		m := deckEntryRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		qty, _ := strconv.Atoi(m[1])
		name := strings.TrimSpace(m[2])
		if seen[name] {
			continue
		}
		seen[name] = true
		out = append(out, AverageDeckEntry{
			CardName: name,
			Quantity: qty,
			Category: category[name],
		})
	}
	return out, nil
}
