/**
 * PoE mod_search — native reference module.
 *
 * FTS5 search over crafting mods stored in D1. Each row is one mod tier
 * with pre-rendered text from PoB. Results are grouped by group_name to
 * show all tiers of a matching effect. Populated by pob-fetch.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { fts5Safe } from "./shared";

const DEFAULT_LIMIT = 20;

interface ModRow {
  mod_id: string;
  mod_text: string;
  affix: string | null;
  generation_type: string | null;
  level: number | null;
  group_name: string | null;
  item_classes: string | null;
  tags: string | null;
}

/** Grouped mod result: one effect with all its tiers. */
interface ModGroup {
  mod_name: string; // display name from highest tier's mod_text
  generation_type: string;
  tiers: Array<{
    tier: number;
    name: string;
    level: number;
    text: string;
  }>;
}

/**
 * Check if a mod can spawn on a given item class.
 * item_classes is a JSON array of tag strings: ["ring","amulet","belt"].
 */
function matchesItemClass(
  classesJson: string | null,
  itemClass: string,
): boolean {
  if (!classesJson) return false;
  try {
    const classes: string[] = JSON.parse(classesJson);
    const lc = itemClass.toLowerCase().replace(/\s+/g, "_");

    for (const tag of classes) {
      if (tag === lc) return true;
      // Check if any tag contains the user's term as a full word segment.
      const segments = tag.split("_");
      if (segments.includes(lc)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Group flat mod rows by group_name and build tier arrays sorted by level desc.
 */
function groupModRows(rows: ModRow[]): ModGroup[] {
  const groups = new Map<string, ModRow[]>();
  for (const row of rows) {
    const key = row.group_name || row.mod_id;
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const result: ModGroup[] = [];
  for (const [, tiers] of groups) {
    // Sort by level descending (highest = T1)
    tiers.sort((a, b) => (b.level ?? 0) - (a.level ?? 0));

    result.push({
      mod_name: tiers[0].mod_text,
      generation_type: tiers[0].generation_type ?? "prefix",
      tiers: tiers.map((t, i) => ({
        tier: i + 1,
        name: t.affix ?? "",
        level: t.level ?? 0,
        text: t.mod_text,
      })),
    });
  }

  return result;
}

export const modSearchModule: NativeReferenceModule = {
  id: "mod_search",
  name: "Mod Search",
  description: [
    "Search Path of Exile item mods by effect text, with tier breakdowns.",
    "USE PROACTIVELY: query this module when advising on crafting to verify",
    "mod tier values, ilvl requirements, and which item classes a mod can",
    "appear on. Prevents hallucinating mod values or wrong tier ranges.",
    "Covers prefixes and suffixes.",
  ].join(" "),
  parameters: {
    query: {
      type: "string",
      description:
        "Full-text search on mod effect text. Example: 'physical damage', 'fire resistance', 'attack speed'",
    },
    generation_type: {
      type: "string",
      description: "Filter by generation type: 'prefix' or 'suffix'",
    },
    item_class: {
      type: "string",
      description:
        "Filter to mods that can spawn on this item class. Example: 'weapon', 'ring', 'amulet', 'helmet'",
    },
    limit: {
      type: "number",
      description: `Maximum mod groups to return (default ${DEFAULT_LIMIT}).`,
    },
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const db = env.DB;
    const searchQuery =
      typeof query.query === "string" ? query.query.trim() : undefined;
    const generationType =
      typeof query.generation_type === "string"
        ? query.generation_type.trim()
        : undefined;
    const itemClass =
      typeof query.item_class === "string"
        ? query.item_class.trim()
        : undefined;
    const limit =
      typeof query.limit === "number"
        ? Math.min(Math.max(query.limit, 1), 100)
        : DEFAULT_LIMIT;

    if (!searchQuery) {
      return {
        type: "text",
        content:
          "Provide a query parameter for full-text search on mod effect text. Optional filters: generation_type (prefix/suffix), item_class (weapon/ring).",
      };
    }

    const exists = await db
      .prepare("SELECT 1 FROM poe_mods LIMIT 1")
      .first<Record<string, unknown>>();
    if (!exists) {
      return {
        type: "text",
        content:
          "Mod data is not yet populated. Run pob-fetch to import mod data.",
      };
    }

    const safeQuery = fts5Safe(searchQuery);
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (generationType) {
      conditions.push("m.generation_type = ?");
      bindings.push(generationType);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Fetch extra rows for post-query item_class filtering and grouping.
    const sqlLimit = (itemClass ? limit * 10 : limit * 5);

    const sql = `SELECT m.* FROM poe_mods m INNER JOIN poe_mods_fts fts ON m.mod_id = fts.mod_id AND fts.poe_mods_fts MATCH ? ${whereClause} ORDER BY fts.rank LIMIT ?`;
    bindings.unshift(safeQuery);
    bindings.push(sqlLimit);

    const rows = await db.prepare(sql).bind(...bindings).all<ModRow>();

    // Apply item_class filter in JS.
    let results = rows.results;
    if (itemClass) {
      results = results.filter((r) =>
        matchesItemClass(r.item_classes, itemClass),
      );
    }

    // Group by group_name and build tier arrays.
    const grouped = groupModRows(results);

    return {
      type: "structured",
      data: {
        query: searchQuery,
        mods: grouped.slice(0, limit),
        count: Math.min(grouped.length, limit),
      },
    };
  },
};
