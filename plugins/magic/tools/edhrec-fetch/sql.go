package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// BuildCommanderSQL returns a SQL blob that deletes and re-inserts all rows
// for a single commander across all EDHREC tables. Safe to import as one
// transaction via cfapi.ImportD1SQL.
func BuildCommanderSQL(pc *ParsedCommander, combos []Combo, avg []AverageDeckEntry, tiers map[string]*TierBundle) string {
	var b strings.Builder
	q := cfapi.SQLQuote
	id := q(pc.ScryfallID)

	// ── DELETEs (scoped to this commander) ───────────────────
	fmt.Fprintf(&b, "DELETE FROM magic_edh_commanders WHERE scryfall_id = %s;\n", id)
	fmt.Fprintf(&b, "DELETE FROM magic_edh_commanders_fts WHERE scryfall_id = %s;\n", id)
	fmt.Fprintf(&b, "DELETE FROM magic_edh_recommendations WHERE commander_id = %s;\n", id)
	fmt.Fprintf(&b, "DELETE FROM magic_edh_combos WHERE commander_id = %s;\n", id)
	fmt.Fprintf(&b, "DELETE FROM magic_edh_combos_fts WHERE commander_id = %s;\n", id)
	fmt.Fprintf(&b, "DELETE FROM magic_edh_average_decks WHERE commander_id = %s;\n", id)
	fmt.Fprintf(&b, "DELETE FROM magic_edh_mana_curves WHERE commander_id = %s;\n", id)
	// Tier tables also wipe-and-replace per commander so a re-import with
	// fewer tiers (e.g. EDHREC dropped one tier for this commander) doesn't
	// leave orphaned rows.
	fmt.Fprintf(&b, "DELETE FROM magic_edh_commander_tiers WHERE commander_id = %s;\n", id)
	fmt.Fprintf(&b, "DELETE FROM magic_edh_average_decks_by_tier WHERE commander_id = %s;\n", id)

	// ── Commander row ────────────────────────────────────────
	themesJSON := marshalThemes(pc.Themes)
	similarJSON := marshalSimilar(pc.Similar)
	colorJSON := cfapi.JSONArray(pc.ColorIdentity)

	fmt.Fprintf(&b,
		"INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, themes, similar, rank, salt) VALUES (%s, %s, %s, %s, %d, %s, %s, %d, %s);\n",
		id, q(pc.Name), q(pc.Slug), q(colorJSON), pc.DeckCount,
		q(themesJSON), q(similarJSON), pc.Rank, formatFloat(pc.Salt),
	)

	fmt.Fprintf(&b,
		"INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (%s, %s);\n",
		id, q(pc.Name),
	)

	// ── Recommendations ──────────────────────────────────────
	if len(pc.Recs) > 0 {
		b.WriteString("INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion, potential_decks, trend_zscore) VALUES ")
		for i, r := range pc.Recs {
			if i > 0 {
				b.WriteString(", ")
			}
			fmt.Fprintf(&b, "(%s, %s, %s, %s, %d, %d, %s)",
				id, q(r.CardName), q(r.Category),
				formatFloat(r.Synergy), r.Inclusion, r.PotentialDecks, formatFloat(r.TrendZScore),
			)
		}
		b.WriteString(";\n")
	}

	// ── Combos ───────────────────────────────────────────────
	if len(combos) > 0 {
		b.WriteString("INSERT INTO magic_edh_combos (commander_id, combo_id, card_names, card_ids, colors, results, deck_count, percentage, bracket_score) VALUES ")
		for i, c := range combos {
			if i > 0 {
				b.WriteString(", ")
			}
			namesJSON := cfapi.JSONArray(c.CardNames)
			idsJSON := cfapi.JSONArray(c.CardIDs)
			resultsJSON := cfapi.JSONArray(c.Results)
			fmt.Fprintf(&b, "(%s, %s, %s, %s, %s, %s, %d, %s, %s)",
				id, q(c.ComboID),
				q(namesJSON), q(idsJSON), q(c.Colors), q(resultsJSON),
				c.DeckCount, formatFloat(c.Percentage), formatFloat(c.BracketScore),
			)
		}
		b.WriteString(";\n")

		// FTS rows for combos
		b.WriteString("INSERT INTO magic_edh_combos_fts (commander_id, combo_id, card_names_text, results_text) VALUES ")
		for i, c := range combos {
			if i > 0 {
				b.WriteString(", ")
			}
			fmt.Fprintf(&b, "(%s, %s, %s, %s)",
				id, q(c.ComboID),
				q(strings.Join(c.CardNames, " ")),
				q(strings.Join(c.Results, " ")),
			)
		}
		b.WriteString(";\n")
	}

	// ── Average deck entries ─────────────────────────────────
	if len(avg) > 0 {
		b.WriteString("INSERT INTO magic_edh_average_decks (commander_id, card_name, quantity, category) VALUES ")
		for i, e := range avg {
			if i > 0 {
				b.WriteString(", ")
			}
			fmt.Fprintf(&b, "(%s, %s, %d, %s)",
				id, q(e.CardName), e.Quantity, q(e.Category),
			)
		}
		b.WriteString(";\n")
	}

	// ── Mana curve ───────────────────────────────────────────
	if len(pc.Curve) > 0 {
		b.WriteString("INSERT INTO magic_edh_mana_curves (commander_id, cmc, avg_count) VALUES ")
		for i, c := range pc.Curve {
			if i > 0 {
				b.WriteString(", ")
			}
			fmt.Fprintf(&b, "(%s, %d, %s)", id, c.CMC, formatFloat(c.AvgCount))
		}
		b.WriteString(";\n")
	}

	// ── Tier metadata + per-tier average decks ────────────────
	// Iterate in deterministic order so SQL output is stable across runs
	// (helps with caching, diffing, debugging).
	tierKeys := make([]string, 0, len(tiers))
	for k := range tiers {
		tierKeys = append(tierKeys, k)
	}
	sort.Strings(tierKeys)
	for _, tierName := range tierKeys {
		t := tiers[tierName]
		if t == nil || t.Meta == nil {
			continue
		}
		fmt.Fprintf(&b,
			"INSERT INTO magic_edh_commander_tiers (commander_id, tier, avg_price, num_decks_avg, deck_size) VALUES (%s, %s, %s, %d, %d);\n",
			id, q(tierName), formatFloat(t.Meta.AvgPrice), t.Meta.NumDecksAvg, t.Meta.DeckSize,
		)
		if len(t.Decks) > 0 {
			b.WriteString("INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES ")
			for i, e := range t.Decks {
				if i > 0 {
					b.WriteString(", ")
				}
				fmt.Fprintf(&b, "(%s, %s, %s, %d, %s)",
					id, q(tierName), q(e.CardName), e.Quantity, q(e.Category),
				)
			}
			b.WriteString(";\n")
		}
	}

	return b.String()
}

func marshalThemes(themes []ThemeEntry) string {
	if len(themes) == 0 {
		return "[]"
	}
	type outEntry struct {
		Slug  string `json:"slug"`
		Value string `json:"value"`
		Count int    `json:"count"`
	}
	out := make([]outEntry, len(themes))
	for i, t := range themes {
		out[i] = outEntry{Slug: t.Slug, Value: t.Value, Count: t.Count}
	}
	j, _ := json.Marshal(out)
	return string(j)
}

func marshalSimilar(similar []SimilarCommander) string {
	if len(similar) == 0 {
		return "[]"
	}
	type outEntry struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	out := make([]outEntry, len(similar))
	for i, s := range similar {
		out[i] = outEntry{ID: s.ScryfallID, Name: s.Name}
	}
	j, _ := json.Marshal(out)
	return string(j)
}

// formatFloat returns a SQL-safe numeric literal.
func formatFloat(f float64) string {
	return fmt.Sprintf("%g", f)
}

// formatPriceLiteral formats a nullable price pointer as a SQL literal.
// nil → "NULL"; non-nil → numeric literal.
func formatPriceLiteral(p *float64) string {
	if p == nil {
		return "NULL"
	}
	return formatFloat(*p)
}

// BuildCardPricesSQL returns SQL that wipes and repopulates the
// magic_edh_card_prices table with the given prices. priced_at is set by
// the column default at INSERT time so the snapshot timestamp reflects when
// the row landed in D1.
func BuildCardPricesSQL(prices []*CardPrice) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	b.WriteString("DELETE FROM magic_edh_card_prices;\n")

	for _, p := range prices {
		if p == nil || p.CardName == "" {
			continue
		}
		fmt.Fprintf(&b,
			"INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price, cardkingdom_price, scg_price, mtgstocks_price) VALUES (%s, %s, %s, %s, %s);\n",
			q(p.CardName),
			formatPriceLiteral(p.TCGPlayerPrice),
			formatPriceLiteral(p.CardKingdomPrice),
			formatPriceLiteral(p.SCGPrice),
			formatPriceLiteral(p.MTGStocksPrice),
		)
	}
	return b.String()
}
