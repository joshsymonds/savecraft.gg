package main

import (
	"fmt"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// buildSQL generates the complete SQL that wipes and repopulates all PoE data tables.
func buildSQL(
	gems []GemData,
	translator *StatDescTranslator,
	uniques []UniqueItem,
	mods []ModTier,
	bases []BaseItem,
	nodes []PassiveNode,
) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	b.WriteString("BEGIN;\n")

	// Wipe all tables (FTS first, then data).
	for _, table := range []string{
		"poe_gems_fts", "poe_gems",
		"poe_uniques_fts", "poe_uniques",
		"poe_mods_fts", "poe_mods",
		"poe_base_items_fts", "poe_base_items",
		"poe_passive_nodes_fts", "poe_passive_nodes",
		"poe_stat_translations",
	} {
		fmt.Fprintf(&b, "DELETE FROM %s;\n", table)
	}

	// ── Gems ──────────────────────────────────────────────────
	for _, g := range gems {
		isSupport := 0
		if g.IsSupport {
			isSupport = 1
		}

		// Split TagString into array for JSON
		var tags []string
		for _, t := range strings.Split(g.TagString, ", ") {
			t = strings.TrimSpace(t)
			if t != "" {
				tags = append(tags, t)
			}
		}
		tagsJSON := cfapi.JSONArray(tags)

		strReq := nullableInt(g.ReqStr)
		dexReq := nullableInt(g.ReqDex)
		intReq := nullableInt(g.ReqInt)

		castTime := "NULL"
		if g.CastTime > 0 {
			castTime = fmt.Sprintf("%g", g.CastTime)
		}

		manaCost := "NULL"
		if g.ManaCost > 0 {
			manaCost = fmt.Sprintf("'%d'", g.ManaCost)
		}

		// Translate constantStats to human-readable strings for stats_at_20
		var statStrings []string
		if translator != nil {
			statStrings = translator.TranslateAll(g.ConstantStats)
		}
		statsJSON := cfapi.JSONArray(statStrings)

		description := g.Description

		fmt.Fprintf(&b, "INSERT INTO poe_gems (gem_id, name, is_support, color, tags, level_requirement, str_requirement, dex_requirement, int_requirement, cast_time, mana_cost, description, stats_at_20, quality_stats, supports_tags) VALUES (%s, %s, %d, %s, %s, NULL, %s, %s, %s, %s, %s, %s, %s, '[]', NULL);\n",
			q(g.GemID), q(g.Name), isSupport, q(g.Color), q(tagsJSON),
			strReq, dexReq, intReq,
			castTime, manaCost, q(description), q(statsJSON),
		)

		fmt.Fprintf(&b, "INSERT INTO poe_gems_fts (gem_id, name, tags, description) VALUES (%s, %s, %s, %s);\n",
			q(g.GemID), q(g.Name), q(tagsJSON), q(description),
		)
	}

	// ── Uniques ───────────────────────────────────────────────
	baseIndex := buildBaseTypeIndex(bases)
	for _, u := range uniques {
		levelReq := nullableInt(u.LevelReq)
		implicitsJSON := cfapi.JSONArray(u.ImplicitMods)
		explicitsJSON := cfapi.JSONArray(u.ExplicitMods)

		itemClass := baseIndex[u.BaseType]
		if itemClass == "" {
			itemClass = u.BaseType
		}

		fmt.Fprintf(&b, "INSERT INTO poe_uniques (name, variant, base_type, item_class, level_requirement, str_requirement, dex_requirement, int_requirement, properties, implicit_mods, explicit_mods, flavour_text, drop_level) VALUES (%s, %s, %s, %s, %s, NULL, NULL, NULL, '[]', %s, %s, NULL, NULL);\n",
			q(u.Name), q(u.Variant), q(u.BaseType), q(itemClass),
			levelReq, q(implicitsJSON), q(explicitsJSON),
		)

		fmt.Fprintf(&b, "INSERT INTO poe_uniques_fts (name, variant, base_type, item_class, explicit_mods) VALUES (%s, %s, %s, %s, %s);\n",
			q(u.Name), q(u.Variant), q(u.BaseType), q(itemClass),
			q(explicitsJSON),
		)
	}

	// ── Mods ──────────────────────────────────────────────────
	for _, m := range mods {
		itemClassesJSON := cfapi.JSONArray(m.ItemClasses)
		tagsJSON := cfapi.JSONArray(m.Tags)
		level := nullableInt(m.Level)

		fmt.Fprintf(&b, "INSERT INTO poe_mods (mod_id, mod_text, affix, generation_type, level, group_name, item_classes, tags) VALUES (%s, %s, %s, %s, %s, %s, %s, %s);\n",
			q(m.ModID), q(m.ModText), q(m.Affix), q(strings.ToLower(m.ModType)),
			level, q(m.Group), q(itemClassesJSON), q(tagsJSON),
		)

		fmt.Fprintf(&b, "INSERT INTO poe_mods_fts (mod_id, mod_text) VALUES (%s, %s);\n",
			q(m.ModID), q(m.ModText),
		)
	}

	// ── Base Items ────────────────────────────────────────────
	for _, item := range bases {
		levelReq := nullableInt(item.LevelReq)
		tagsJSON := cfapi.JSONArray(item.Tags)

		fmt.Fprintf(&b, "INSERT INTO poe_base_items (item_id, name, item_class, level_requirement, implicit_mods, properties, tags) VALUES (%s, %s, %s, %s, '[]', '{}', %s);\n",
			q(item.Name), q(item.Name), q(item.ItemClass), levelReq, q(tagsJSON),
		)

		fmt.Fprintf(&b, "INSERT INTO poe_base_items_fts (item_id, name, item_class) VALUES (%s, %s, %s);\n",
			q(item.Name), q(item.Name), q(item.ItemClass),
		)
	}

	// ── Passive Nodes ─────────────────────────────────────────
	for _, n := range nodes {
		isNotable := boolToInt(n.IsNotable)
		isKeystone := boolToInt(n.IsKeystone)
		isMastery := boolToInt(n.IsMastery)
		isAscendancy := boolToInt(n.AscendancyName != "")

		statsJSON := cfapi.JSONArray(n.Stats)

		groupID := nullableInt(n.Group)
		orbit := nullableInt(n.Orbit)
		orbitIndex := nullableInt(n.OrbitIndex)

		fmt.Fprintf(&b, "INSERT INTO poe_passive_nodes (skill_id, name, is_notable, is_keystone, is_mastery, is_ascendancy, ascendancy_name, stats, group_id, orbit, orbit_index) VALUES (%d, %s, %d, %d, %d, %d, %s, %s, %s, %s, %s);\n",
			n.SkillID, q(n.Name), isNotable, isKeystone, isMastery, isAscendancy,
			q(n.AscendancyName), q(statsJSON), groupID, orbit, orbitIndex,
		)

		fmt.Fprintf(&b, "INSERT INTO poe_passive_nodes_fts (skill_id, name, stats, ascendancy_name) VALUES (%d, %s, %s, %s);\n",
			n.SkillID, q(n.Name), q(statsJSON), q(n.AscendancyName),
		)
	}

	// ── Stat Translations ─────────────────────────────────────
	if translator != nil {
		for statID, entry := range translator.entries {
			// Store the first matching template as the translation
			translation := ""
			for _, v := range entry.variants {
				if v.text != "" {
					translation = v.text
					break
				}
			}
			if translation == "" {
				continue
			}

			fmt.Fprintf(&b, "INSERT INTO poe_stat_translations (stat_id, translation, format_type) VALUES (%s, %s, NULL);\n",
				q(statID), q(translation),
			)
		}
	}

	b.WriteString("COMMIT;\n")
	return b.String()
}

func nullableInt(n int) string {
	if n == 0 {
		return "NULL"
	}
	return fmt.Sprintf("%d", n)
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// buildBaseTypeIndex builds a map for fast base type → item class lookups.
func buildBaseTypeIndex(bases []BaseItem) map[string]string {
	m := make(map[string]string, len(bases))
	for _, b := range bases {
		m[b.Name] = b.ItemClass
	}
	return m
}
