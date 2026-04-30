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

// commanderSimilar accepts both shapes EDHREC publishes:
//  1. {"id": "...", "name": "..."} — older format
//  2. "Card Name" — newer flat-string format observed 2026-04-30
//
// We treat the name as the source of truth; ID is best-effort and may be
// empty, since no downstream consumer reads it.
type commanderSimilar struct {
	ID   string
	Name string
}

func (c *commanderSimilar) UnmarshalJSON(data []byte) error {
	if len(data) > 0 && data[0] == '"' {
		var name string
		if err := json.Unmarshal(data, &name); err != nil {
			return err
		}
		c.Name = name
		return nil
	}
	type raw struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	var r raw
	if err := json.Unmarshal(data, &r); err != nil {
		return err
	}
	c.ID = r.ID
	c.Name = r.Name
	return nil
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

	// Similar commanders. Filter on Name rather than ID — the newer EDHREC
	// flat-string format omits IDs entirely.
	for _, s := range p.Similar {
		if s.Name == "" {
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

// ── Tier page (json.edhrec.com/pages/commanders/{slug}/{tier}.json) ──
//
// EDHREC publishes four power/budget tiers per commander: budget,
// upgraded, optimized, cedh. Each is an empirical "average decklist for
// commander X at tier Y" — same schema as the default average-decks page,
// plus tier-level metadata fields (avg_price, num_decks_avg, deck_size).

type tierPage struct {
	AvgPrice    float64  `json:"avg_price"`
	NumDecksAvg int      `json:"num_decks_avg"`
	DeckSize    int      `json:"deck_size"`
	Deck        []string `json:"deck"`
	Container   struct {
		JSONDict struct {
			CardLists []averageDeckList `json:"cardlists"`
		} `json:"json_dict"`
	} `json:"container"`
}

// TierMeta captures the per-tier metadata published with each
// commander/tier average decklist.
type TierMeta struct {
	AvgPrice    float64
	NumDecksAvg int
	DeckSize    int
}

// TierBundle is the parsed tier-page result: metadata + the categorized
// average decklist for that tier.
type TierBundle struct {
	Meta  *TierMeta
	Decks []AverageDeckEntry
}

// ParseTierPage parses an EDHREC tier endpoint payload. The deck array
// uses the same "1 Card Name" / "10 Forest" string format as the default
// average-decks page, so we reuse the same line-parsing path. Empty
// payloads (rare commander with no data at this tier) return zero-valued
// metadata and an empty deck list — not an error.
func ParseTierPage(data []byte) (*TierMeta, []AverageDeckEntry, error) {
	var p tierPage
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, nil, fmt.Errorf("decode tier page: %w", err)
	}
	meta := &TierMeta{
		AvgPrice:    p.AvgPrice,
		NumDecksAvg: p.NumDecksAvg,
		DeckSize:    p.DeckSize,
	}

	// Build category map from cardlists (same shape as ParseAverageDecksPage).
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
	return meta, out, nil
}

// ── Card page (json.edhrec.com/pages/cards/{slug}.json) ──
//
// Each page has a card.prices object with multiple vendor sub-objects, e.g.:
//
//	"tcgplayer":   {"price": 1.29, "subType": "Normal", "priceSource": "midPrice"},
//	"cardkingdom": {"price": 1.99},
//	"scg":         {"price": 1.49},
//	"mtgstocks":   {"price": 1.19}
//
// We capture USD-denominated paper-singles vendors only — not cardhoarder
// (MTGO tickets), tcgl (online platform), face2face (foil/special), or
// cardmarket (EUR-denominated).

type cardPage struct {
	Container struct {
		JSONDict struct {
			Card struct {
				Prices map[string]cardPriceVendor `json:"prices"`
			} `json:"card"`
		} `json:"json_dict"`
	} `json:"container"`
}

type cardPriceVendor struct {
	Price   *float64 `json:"price"`
	SubType string   `json:"subType,omitempty"` // TCGPlayer-only: "Normal" or "Foil"
}

// CardPrice is the parsed multi-vendor price record for one card.
type CardPrice struct {
	CardName         string
	TCGPlayerPrice   *float64 // mid-market, Normal printing only
	CardKingdomPrice *float64
	SCGPrice         *float64
	MTGStocksPrice   *float64
}

// ParseCardPage parses an EDHREC per-card JSON payload and extracts the
// vendor prices we care about. The card name is passed in (not parsed from
// the JSON) so callers can preserve the canonical name they used to slug.
func ParseCardPage(name string, data []byte) (*CardPrice, error) {
	var p cardPage
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("decode card page: %w", err)
	}
	cp := &CardPrice{CardName: name}
	prices := p.Container.JSONDict.Card.Prices
	if v, ok := prices["tcgplayer"]; ok && v.SubType == "Normal" {
		cp.TCGPlayerPrice = v.Price
	}
	if v, ok := prices["cardkingdom"]; ok {
		cp.CardKingdomPrice = v.Price
	}
	if v, ok := prices["scg"]; ok {
		cp.SCGPrice = v.Price
	}
	if v, ok := prices["mtgstocks"]; ok {
		cp.MTGStocksPrice = v.Price
	}
	return cp, nil
}
