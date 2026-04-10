package main

import (
	"fmt"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// buildSQL generates the complete SQL string that wipes and repopulates all
// PoE data tables in D1. The generated SQL deletes all existing data first,
// then inserts gems, base items, stat translations, and passive nodes along
// with their corresponding FTS5 indexes.
func buildSQL(
	gems []ProcessedGem,
	baseItems []ProcessedBaseItem,
	statTranslations []ProcessedStatTranslation,
	passiveNodes []ProcessedPassiveNode,
) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	// Wipe all tables (FTS first, then data).
	b.WriteString("DELETE FROM poe_gems_fts;\n")
	b.WriteString("DELETE FROM poe_gems;\n")
	b.WriteString("DELETE FROM poe_passive_nodes_fts;\n")
	b.WriteString("DELETE FROM poe_passive_nodes;\n")
	b.WriteString("DELETE FROM poe_base_items_fts;\n")
	b.WriteString("DELETE FROM poe_base_items;\n")
	b.WriteString("DELETE FROM poe_stat_translations;\n")
	b.WriteString("DELETE FROM poe_uniques_fts;\n")
	b.WriteString("DELETE FROM poe_uniques;\n")
	b.WriteString("DELETE FROM poe_mods_fts;\n")
	b.WriteString("DELETE FROM poe_mods;\n")

	// ── Gems ──────────────────────────────────────────────────
	for _, g := range gems {
		isSupport := 0
		if g.IsSupport {
			isSupport = 1
		}

		tagsJSON := cfapi.JSONArray(g.Tags)

		// Nullable integer fields.
		levelReq := "NULL"
		if g.LevelReq > 0 {
			levelReq = fmt.Sprintf("%d", g.LevelReq)
		}
		strReq := "NULL"
		if g.StrReq > 0 {
			strReq = fmt.Sprintf("%d", g.StrReq)
		}
		dexReq := "NULL"
		if g.DexReq > 0 {
			dexReq = fmt.Sprintf("%d", g.DexReq)
		}
		intReq := "NULL"
		if g.IntReq > 0 {
			intReq = fmt.Sprintf("%d", g.IntReq)
		}

		// Nullable cast_time.
		castTime := "NULL"
		if g.CastTime > 0 {
			castTime = fmt.Sprintf("%g", g.CastTime)
		}

		// Nullable mana_cost.
		manaCost := "NULL"
		if g.ManaCost != "" {
			manaCost = q(g.ManaCost)
		}

		// Nullable supports_tags.
		supportsTags := "NULL"
		if g.SupportsTags != "" {
			supportsTags = q(g.SupportsTags)
		}

		fmt.Fprintf(&b, "INSERT INTO poe_gems (gem_id, name, is_support, color, tags, level_requirement, str_requirement, dex_requirement, int_requirement, cast_time, mana_cost, description, stats_at_20, quality_stats, supports_tags) VALUES (%s, %s, %d, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);\n",
			q(g.GemID), q(g.Name), isSupport, q(g.Color), q(tagsJSON),
			levelReq, strReq, dexReq, intReq,
			castTime, manaCost, q(g.Description),
			q(g.StatsAt20), q(g.QualityStats), supportsTags,
		)

		// FTS5 row.
		fmt.Fprintf(&b, "INSERT INTO poe_gems_fts (gem_id, name, tags, description) VALUES (%s, %s, %s, %s);\n",
			q(g.GemID), q(g.Name), q(tagsJSON), q(g.Description),
		)
	}

	// ── Passive Nodes ─────────────────────────────────────────
	for _, n := range passiveNodes {
		isNotable := 0
		if n.IsNotable {
			isNotable = 1
		}
		isKeystone := 0
		if n.IsKeystone {
			isKeystone = 1
		}
		isMastery := 0
		if n.IsMastery {
			isMastery = 1
		}
		isAscendancy := 0
		if n.IsAscendancy {
			isAscendancy = 1
		}

		groupID := "NULL"
		if n.GroupID != nil {
			groupID = fmt.Sprintf("%d", *n.GroupID)
		}
		orbit := "NULL"
		if n.Orbit != nil {
			orbit = fmt.Sprintf("%d", *n.Orbit)
		}
		orbitIndex := "NULL"
		if n.OrbitIndex != nil {
			orbitIndex = fmt.Sprintf("%d", *n.OrbitIndex)
		}

		fmt.Fprintf(&b, "INSERT INTO poe_passive_nodes (skill_id, name, is_notable, is_keystone, is_mastery, is_ascendancy, ascendancy_name, stats, group_id, orbit, orbit_index) VALUES (%d, %s, %d, %d, %d, %d, %s, %s, %s, %s, %s);\n",
			n.SkillID, q(n.Name), isNotable, isKeystone, isMastery, isAscendancy,
			q(n.AscendancyName), q(n.Stats), groupID, orbit, orbitIndex,
		)

		// FTS5 row.
		fmt.Fprintf(&b, "INSERT INTO poe_passive_nodes_fts (skill_id, name, stats, ascendancy_name) VALUES (%d, %s, %s, %s);\n",
			n.SkillID, q(n.Name), q(n.Stats), q(n.AscendancyName),
		)
	}

	// ── Base Items ────────────────────────────────────────────
	for _, item := range baseItems {
		levelReq := "NULL"
		if item.LevelReq > 0 {
			levelReq = fmt.Sprintf("%d", item.LevelReq)
		}

		fmt.Fprintf(&b, "INSERT INTO poe_base_items (item_id, name, item_class, level_requirement, implicit_mods, properties, tags) VALUES (%s, %s, %s, %s, %s, %s, %s);\n",
			q(item.ItemID), q(item.Name), q(item.ItemClass), levelReq,
			q(item.ImplicitMods), q(item.Properties), q(item.Tags),
		)

		// FTS5 row.
		fmt.Fprintf(&b, "INSERT INTO poe_base_items_fts (item_id, name, item_class) VALUES (%s, %s, %s);\n",
			q(item.ItemID), q(item.Name), q(item.ItemClass),
		)
	}

	// ── Stat Translations ─────────────────────────────────────
	for _, st := range statTranslations {
		formatType := "NULL"

		fmt.Fprintf(&b, "INSERT INTO poe_stat_translations (stat_id, translation, format_type) VALUES (%s, %s, %s);\n",
			q(st.StatID), q(st.Translation), formatType,
		)
	}

	return b.String()
}
