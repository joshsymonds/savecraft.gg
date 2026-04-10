/**
 * PoE mod_search — native reference module.
 *
 * FTS5 search over crafting mods stored in D1. Each row is a mod group
 * (all tiers of one effect), stored with rendered human-readable text.
 * Supports filtering by generation type (prefix/suffix), domain, and
 * item class (via spawn weight tags). Populated by repoe-fetch.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { fts5Safe, parseJsonColumn } from "./shared";

const DEFAULT_LIMIT = 20;

interface ModRow {
  mod_id: string;
  mod_name: string;
  generation_type: string | null;
  mod_type: string | null;
  domain: string | null;
  item_class_spawns: string | null;
  stat_ids: string | null;
  tiers: string | null;
}

function modRowToResult(row: ModRow): Record<string, unknown> {
  const tiers = parseJsonColumn(row.tiers);
  return {
    mod_name: row.mod_name,
    generation_type: row.generation_type,
    domain: row.domain,
    tiers,
  };
}

/**
 * Check if a mod can spawn on a given item class by inspecting spawn weight tags.
 * Tags are derived from RePoE data, not a hardcoded map — matches the user's
 * input against actual tag keys in the mod's spawn weights JSON.
 */
function matchesItemClass(
  spawnsJson: string | null,
  itemClass: string,
): boolean {
  if (!spawnsJson) return false;
  try {
    const spawns: Record<string, number> = JSON.parse(spawnsJson);
    const lc = itemClass.toLowerCase().replace(/\s+/g, "_");

    // Exact match first (handles "ring", "amulet", "weapon", "flask", etc.)
    if (lc in spawns) return true;

    // Check if any spawn tag contains the user's term as a full word segment.
    // e.g., "sword" matches "one_hand_sword" but "a" doesn't match "amulet".
    // Split on _ to match whole segments only.
    for (const tag of Object.keys(spawns)) {
      const segments = tag.split("_");
      if (segments.includes(lc)) return true;
    }

    return false;
  } catch {
    return false;
  }
}

export const modSearchModule: NativeReferenceModule = {
  id: "mod_search",
  name: "Mod Search",
  description: [
    "Search Path of Exile item mods by effect text, with tier breakdowns.",
    "USE PROACTIVELY: query this module when advising on crafting to verify",
    "mod tier values, ilvl requirements, spawn weights, and which item classes",
    "a mod can appear on. Prevents hallucinating mod values or wrong tier ranges.",
    "Covers prefixes, suffixes, essences, corruptions, and influence implicits.",
  ].join(" "),
  parameters: {
    query: {
      type: "string",
      description:
        "Full-text search on mod effect text. Example: 'physical damage', 'fire resistance', 'attack speed'",
    },
    generation_type: {
      type: "string",
      description:
        "Filter by generation type: 'prefix', 'suffix', 'corrupted', 'essence', 'exarch_implicit', 'eater_implicit'",
    },
    domain: {
      type: "string",
      description:
        "Filter by domain: 'item', 'crafted', 'flask', 'abyss_jewel', 'affliction_jewel', 'unveiled'",
    },
    item_class: {
      type: "string",
      description:
        "Filter to mods that can spawn on this item class. Example: 'weapon', 'ring', 'amulet', 'helmet'",
    },
    limit: {
      type: "number",
      description: `Maximum results to return (default ${DEFAULT_LIMIT}).`,
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
    const domain =
      typeof query.domain === "string" ? query.domain.trim() : undefined;
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
          "Provide a query parameter for full-text search on mod effect text. Optional filters: generation_type (prefix/suffix), domain (item/flask), item_class (weapon/ring).",
      };
    }

    // Existence check (avoid full COUNT(*) table scan).
    const exists = await db
      .prepare("SELECT 1 FROM poe_mods LIMIT 1")
      .first<Record<string, unknown>>();
    if (!exists) {
      return {
        type: "text",
        content:
          "Mod data is not yet populated. Run repoe-fetch to import mod data.",
      };
    }

    // FTS5 JOIN — applies text matching and structured filters in one query.
    // No pre-filter truncation: SQLite evaluates the full FTS result set
    // against all WHERE conditions before applying LIMIT.
    const safeQuery = fts5Safe(searchQuery);
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (generationType) {
      conditions.push("m.generation_type = ?");
      bindings.push(generationType);
    }
    if (domain) {
      conditions.push("m.domain = ?");
      bindings.push(domain);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // FTS MATCH is in the JOIN condition, structured filters in WHERE.
    // item_class filter is applied in JS after the query because it requires
    // JSON parsing of spawn weight tags. We fetch extra rows to compensate.
    const sqlLimit = itemClass ? limit * 5 : limit;

    const sql = `SELECT m.* FROM poe_mods m INNER JOIN poe_mods_fts fts ON m.mod_id = fts.mod_id AND fts.poe_mods_fts MATCH ? ${whereClause} ORDER BY fts.rank, m.mod_name LIMIT ?`;
    bindings.unshift(safeQuery);
    bindings.push(sqlLimit);

    const rows = await db.prepare(sql).bind(...bindings).all<ModRow>();

    // Apply item_class filter in JS (checks JSON spawn weight tags).
    // Fetch extra rows above to avoid truncation, then trim to limit.
    let results = rows.results;
    if (itemClass) {
      results = results.filter((r) =>
        matchesItemClass(r.item_class_spawns, itemClass),
      );
    }
    results = results.slice(0, limit);

    return {
      type: "structured",
      data: {
        query: searchQuery,
        mods: results.map(modRowToResult),
        count: results.length,
      },
    };
  },
};
