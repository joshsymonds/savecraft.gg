// Package rulessearch provides structured search over MTG Comprehensive Rules
// and Scryfall per-card rulings.
package rulessearch

// RulesData is the complete indexed rules dataset.
type RulesData struct {
	EffectiveDate string                  `json:"effectiveDate"`
	Rules         []Rule                  `json:"rules"`
	CardRulings   map[string][]CardRuling `json:"cardRulings"` // oracle_id → rulings
}

// Rule is a single numbered rule with its text.
type Rule struct {
	Number  string   `json:"number"`
	Text    string   `json:"text"`
	Example string   `json:"example,omitempty"`
	SeeAlso []string `json:"seeAlso,omitempty"`
}

// CardRuling is an official ruling for a specific card.
type CardRuling struct {
	OracleID    string `json:"oracle_id"`
	PublishedAt string `json:"published_at"`
	Comment     string `json:"comment"`
}
