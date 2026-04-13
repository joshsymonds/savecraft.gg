package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// BuildCommanderSQL returns a SQL blob that deletes and re-inserts all rows
// for a single commander across all EDHREC tables. Safe to import as one
// transaction via cfapi.ImportD1SQL.
func BuildCommanderSQL(pc *ParsedCommander, combos []Combo, avg []AverageDeckEntry) string {
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
