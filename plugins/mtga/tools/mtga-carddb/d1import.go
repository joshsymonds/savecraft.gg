package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/cfapi"
)

// buildFullCardImportSQL generates the SQL for D1 bulk import of full card data.
// Follows the same pattern as scryfall-fetch/cloudflare.go:buildCardImportSQL
// but includes power, toughness, and uses synthetic oracle_id for MTGA-only cards.
func buildFullCardImportSQL(cards []FullCard) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	// Clear existing data (FTS5 first, then structured table).
	b.WriteString("DELETE FROM mtga_cards_fts;\n")
	b.WriteString("DELETE FROM mtga_cards;\n")

	for _, c := range cards {
		colorsJSON := jsonArray(c.Colors)
		colorIdentityJSON := jsonArray(c.ColorIdentity)
		keywordsJSON := jsonArray(c.Keywords)
		producedManaJSON := jsonArray(c.ProducedMana)

		// Synthetic oracle_id for MTGA-sourced cards. Scryfall enrichment
		// will overwrite this with the real oracle_id later.
		oracleID := fmt.Sprintf("arena-%d", c.ArenaID)

		isDefault := 0
		if c.IsDefault {
			isDefault = 1
		}

		fmt.Fprintf(&b,
			"INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default, produced_mana, power, toughness) VALUES (%d, %s, %s, %s, %s, %g, %s, %s, %s, %s, %s, %s, %s, %s, %d, %s, %s, %s);\n",
			c.ArenaID, q(oracleID), q(c.Name), q(c.FrontFaceName), q(c.ManaCost), c.CMC,
			q(c.TypeLine), q(c.OracleText), q(colorsJSON), q(colorIdentityJSON),
			q("{}"), q(c.Rarity), q(c.Set), q(keywordsJSON), isDefault, q(producedManaJSON),
			q(c.Power), q(c.Toughness),
		)

		// FTS5 table (default printings only).
		if c.IsDefault {
			fmt.Fprintf(&b, "INSERT INTO mtga_cards_fts (arena_id, name, oracle_text, type_line) VALUES (%d, %s, %s, %s);\n",
				c.ArenaID, q(c.Name), q(c.OracleText), q(c.TypeLine),
			)
		}
	}

	return b.String()
}

// jsonArray marshals a string slice to JSON, returning "[]" for nil/empty.
func jsonArray(s []string) string {
	if len(s) == 0 {
		return "[]"
	}
	j, _ := json.Marshal(s)
	return string(j)
}

// importToD1 runs the full D1 import for the given cards.
func importToD1(accountID, databaseID, apiToken string, cards []FullCard) error {
	sql := buildFullCardImportSQL(cards)
	fmt.Printf("Importing %d cards to D1 (%d bytes SQL)...\n", len(cards), len(sql))
	return cfapi.ImportD1SQL(accountID, databaseID, apiToken, sql)
}
