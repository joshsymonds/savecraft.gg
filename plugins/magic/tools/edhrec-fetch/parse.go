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

// ThemeBundle pairs the per-commander-per-theme metadata with the average
// decklist EDHREC publishes for that combination. Reuses the tier parser
// since the JSON shape is identical.
type ThemeBundle struct {
	Slug  string
	Value string // human-readable display name from the parent commander page
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

// ── Precon page (json.edhrec.com/pages/precon/{slug}.json) ──
//
// Decklist shape is unusual: deck.cards is keyed by card type ("Land",
// "Creature", etc.), each value is an array of [name, quantity] 2-tuples
// rather than an object array. We unmarshal into [][]json.RawMessage and
// hand-decode each pair.

type preconPage struct {
	Deck                  preconDeck         `json:"deck"`
	PreconCommanderCounts []preconCommanderC `json:"precon_commander_counts"`
	Container             struct {
		JSONDict struct {
			CardLists []commanderCardList `json:"cardlists"`
		} `json:"json_dict"`
	} `json:"container"`
}

type preconDeck struct {
	Commander []string                       `json:"commander"`
	Cards     map[string][][]json.RawMessage `json:"cards"`
}

type preconCommanderC struct {
	Value string `json:"value"`
	Count int    `json:"count"`
	Href  string `json:"href"`
}

// ParsedPrecon is the structured result for one precon.
type ParsedPrecon struct {
	Slug       string
	Name       string  // pulled from preconMSRP table — empty when unknown
	MSRPUSD    float64 // from preconMSRP table — 0 when unknown
	SetCode    string
	Year       int
	Deck       []AverageDeckEntry // (CardName, Quantity, Category=cardType)
	Upgrades   []PreconUpgrade
	Commanders []PreconCommanderRef
}

// PreconUpgrade represents one entry in the add/cut pools EDHREC publishes
// for upgrading a precon. Action ∈ {"add","cut","land_add","land_cut"} maps
// from the cardlist tag.
type PreconUpgrade struct {
	CardName  string
	Action    string
	Category  string // EDHREC tag (cardstoadd, landstocut, etc.) preserved for traceability
	Inclusion int    // raw inclusion count (across upgraders' decks)
}

// PreconCommanderRef is one of the commanders the precon can be helmed by.
// IsFace=true marks the dominant choice (highest deck_count).
type PreconCommanderRef struct {
	CommanderName string
	DeckCount     int
	IsFace        bool
}

// preconCardlistAction maps EDHREC's cardlist tag to the canonical action
// label we store. Tags outside this map are ignored (topcommanders is data
// for PreconCommanderRef, not Upgrades).
var preconCardlistAction = map[string]string{
	"cardstoadd": "add",
	"cardstocut": "cut",
	"landstoadd": "land_add",
	"landstocut": "land_cut",
}

// ParsePreconPage parses an EDHREC precon JSON payload. The slug isn't in
// the response; callers pass the slug they used to fetch it.
func ParsePreconPage(slug string, data []byte) (*ParsedPrecon, error) {
	var p preconPage
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("decode precon page: %w", err)
	}
	pp := &ParsedPrecon{Slug: slug}

	// Decklist: walk cards-by-type, decode each [name, quantity] tuple.
	commanderSet := map[string]bool{}
	for _, c := range p.Deck.Commander {
		commanderSet[c] = true
	}
	for cardType, pairs := range p.Deck.Cards {
		for _, pair := range pairs {
			if len(pair) != 2 {
				continue
			}
			var name string
			var qty int
			if err := json.Unmarshal(pair[0], &name); err != nil {
				continue
			}
			if err := json.Unmarshal(pair[1], &qty); err != nil {
				continue
			}
			if name == "" {
				continue
			}
			// Skip the commander itself — it's tracked separately under
			// Commanders, including it in Deck would inflate deck_count and
			// confuse downstream "is this card in the precon?" checks.
			if commanderSet[name] {
				continue
			}
			pp.Deck = append(pp.Deck, AverageDeckEntry{
				CardName: name,
				Quantity: qty,
				Category: cardType,
			})
		}
	}

	// Upgrades: from cardlists with tags in preconCardlistAction.
	for _, cl := range p.Container.JSONDict.CardLists {
		action, ok := preconCardlistAction[cl.Tag]
		if !ok {
			continue
		}
		for _, cv := range cl.CardViews {
			if cv.Name == "" {
				continue
			}
			pp.Upgrades = append(pp.Upgrades, PreconUpgrade{
				CardName:  cv.Name,
				Action:    action,
				Category:  cl.Tag,
				Inclusion: cv.Inclusion,
			})
		}
	}

	// Commanders: precon_commander_counts in input order — EDHREC sorts by
	// count DESC, so the first entry is the face commander.
	for i, c := range p.PreconCommanderCounts {
		if c.Value == "" {
			continue
		}
		pp.Commanders = append(pp.Commanders, PreconCommanderRef{
			CommanderName: c.Value,
			DeckCount:     c.Count,
			IsFace:        i == 0,
		})
	}

	return pp, nil
}

// ── Precon discovery ──

type linksPanel struct {
	Items []struct {
		Href  string `json:"href"`
		Value string `json:"value"`
	} `json:"items"`
}

type panelsWithLinks struct {
	Panels struct {
		Links []linksPanel `json:"links"`
	} `json:"panels"`
}

// discoverPreconSlugs walks a commander page's panels.links for hrefs of
// the form /precon/{slug} and returns the unique slug set. Callers across
// many commanders aggregate these for the runPreconsPhase.
func discoverPreconSlugs(commanderPageJSON []byte) []string {
	var p panelsWithLinks
	if err := json.Unmarshal(commanderPageJSON, &p); err != nil {
		return nil
	}
	seen := map[string]bool{}
	var out []string
	for _, group := range p.Panels.Links {
		for _, item := range group.Items {
			const prefix = "/precon/"
			if !strings.HasPrefix(item.Href, prefix) {
				continue
			}
			slug := strings.TrimPrefix(item.Href, prefix)
			// EDHREC includes alternate-commander-keyed paths:
			//   /precon/breed-lethality/ishai-...-tymna...
			// The first segment is the precon slug itself; drop the rest.
			if i := strings.Index(slug, "/"); i >= 0 {
				slug = slug[:i]
			}
			if slug == "" || seen[slug] {
				continue
			}
			seen[slug] = true
			out = append(out, slug)
		}
	}
	return out
}
