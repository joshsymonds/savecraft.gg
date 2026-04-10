package main

import (
	"fmt"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// buildUniqueSQL generates the SQL that wipes and repopulates the poe_uniques
// table and its FTS5 index. Only touches poe_uniques — does not affect other
// PoE tables (those are managed by repoe-fetch).
func buildUniqueSQL(uniques []ProcessedUnique) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	// Wipe uniques tables only (FTS first, then data).
	b.WriteString("DELETE FROM poe_uniques_fts;\n")
	b.WriteString("DELETE FROM poe_uniques;\n")

	for _, u := range uniques {
		levelReq := "NULL"
		if u.LevelReq > 0 {
			levelReq = fmt.Sprintf("%d", u.LevelReq)
		}

		flavourText := "NULL"
		if u.FlavourText != "" {
			flavourText = q(u.FlavourText)
		}

		// poe.ninja doesn't provide str/dex/int requirements, properties, or drop_level.
		fmt.Fprintf(&b, "INSERT INTO poe_uniques (name, variant, base_type, item_class, level_requirement, str_requirement, dex_requirement, int_requirement, properties, implicit_mods, explicit_mods, flavour_text, drop_level) VALUES (%s, %s, %s, %s, %s, NULL, NULL, NULL, '[]', %s, %s, %s, NULL);\n",
			q(u.Name), q(u.Variant), q(u.BaseType), q(u.ItemClass), levelReq,
			q(u.ImplicitMods), q(u.ExplicitMods), flavourText,
		)

		// FTS5 row: searchable by name, base_type, item_class, and explicit mod text.
		// variant is UNINDEXED (stored but not searchable).
		fmt.Fprintf(&b, "INSERT INTO poe_uniques_fts (name, variant, base_type, item_class, explicit_mods) VALUES (%s, %s, %s, %s, %s);\n",
			q(u.Name), q(u.Variant), q(u.BaseType), q(u.ItemClass), q(u.ExplicitMods),
		)
	}

	return b.String()
}
