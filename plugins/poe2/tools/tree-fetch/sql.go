package main

import (
	"fmt"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// buildSQL generates the complete SQL that wipes and repopulates
// poe2_passive_nodes (+ its FTS5 index) from parsed tree nodes.
func buildSQL(nodes []PassiveNode) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	// No BEGIN/COMMIT — D1's bulk import API manages transaction semantics
	// server-side. Explicit transaction statements cause import errors.

	for _, table := range []string{"poe2_passive_nodes_fts", "poe2_passive_nodes"} {
		fmt.Fprintf(&b, "DELETE FROM %s;\n", table)
	}

	for _, n := range nodes {
		isNotable := boolToInt(n.IsNotable)
		isKeystone := boolToInt(n.IsKeystone)
		isMastery := boolToInt(n.IsMastery)
		statsJSON := cfapi.JSONArray(n.Stats)
		ascendancyName := nullableString(n.AscendancyName)

		fmt.Fprintf(&b, "INSERT OR REPLACE INTO poe2_passive_nodes (hash, name, is_notable, is_keystone, is_mastery, ascendancy_name, stats) VALUES (%d, %s, %d, %d, %d, %s, %s);\n",
			n.Hash, q(n.Name), isNotable, isKeystone, isMastery, ascendancyName, q(statsJSON),
		)

		fmt.Fprintf(&b, "INSERT OR REPLACE INTO poe2_passive_nodes_fts (hash, name, stats, ascendancy_name) VALUES (%d, %s, %s, %s);\n",
			n.Hash, q(n.Name), q(statsJSON), ascendancyName,
		)
	}

	return b.String()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// nullableString returns SQL NULL for an empty string, else a quoted literal.
func nullableString(s string) string {
	if s == "" {
		return "NULL"
	}
	return cfapi.SQLQuote(s)
}
