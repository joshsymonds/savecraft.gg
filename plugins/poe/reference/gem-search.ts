/**
 * PoE gem_search — native reference module.
 *
 * FTS5 search over PoE skill and support gems stored in D1. Supports
 * filtering by gem color and support/active type.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";

const DEFAULT_LIMIT = 20;

interface GemRow {
  gem_id: string;
  name: string;
  is_support: number;
  color: string | null;
  description: string | null;
  tags: string | null;
  stats_at_20: string | null;
  quality_stats: string | null;
  supports_tags: string | null;
  icon: string | null;
  level_requirement: number | null;
}

function parseJsonColumn(value: string | null): unknown[] {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function gemRowToResult(row: GemRow): Record<string, unknown> {
  return {
    gem_id: row.gem_id,
    name: row.name,
    is_support: row.is_support === 1,
    color: row.color,
    description: row.description,
    tags: parseJsonColumn(row.tags),
    stats_at_20: parseJsonColumn(row.stats_at_20),
    quality_stats: parseJsonColumn(row.quality_stats),
    supports_tags: parseJsonColumn(row.supports_tags),
    icon: row.icon,
    level_requirement: row.level_requirement,
  };
}

/** Sanitize a string for FTS5 MATCH: wrap in double quotes, escape internal double quotes. */
function fts5Safe(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export const gemSearchModule: NativeReferenceModule = {
  id: "gem_search",
  name: "Gem Search",
  description: [
    "Search Path of Exile skill and support gems by name, tags, or description.",
    "USE PROACTIVELY: query this module to verify gem names, check gem colors,",
    "look up support gem interactions, or find gems by keyword before referencing",
    "them in build advice. Prevents hallucinating gem names or wrong gem colors.",
  ].join(" "),
  parameters: {
    query: {
      type: "string",
      description:
        "Full-text search on gem name, tags, and description. Example: 'Multistrike'",
    },
    is_support: {
      type: "boolean",
      description: "Filter to support gems only (true) or active gems only (false).",
    },
    color: {
      type: "string",
      description: "Filter by gem color: R (Strength), G (Dexterity), B (Intelligence), W (White).",
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
    const isSupport =
      typeof query.is_support === "boolean" ? query.is_support : undefined;
    const color =
      typeof query.color === "string" ? query.color.trim().toUpperCase() : undefined;
    const limit =
      typeof query.limit === "number"
        ? Math.min(Math.max(query.limit, 1), 100)
        : DEFAULT_LIMIT;

    if (!searchQuery) {
      return {
        type: "text",
        content:
          "Provide a query parameter for full-text search on gem name, tags, or description. Optional filters: is_support (boolean), color (R/G/B/W).",
      };
    }

    const safeQuery = fts5Safe(searchQuery);
    const conditions: string[] = [
      "g.gem_id IN (SELECT gem_id FROM poe_gems_fts WHERE poe_gems_fts MATCH ?)",
    ];
    const bindings: unknown[] = [safeQuery];

    if (isSupport !== undefined) {
      conditions.push("g.is_support = ?");
      bindings.push(isSupport ? 1 : 0);
    }
    if (color) {
      conditions.push("g.color = ?");
      bindings.push(color);
    }

    let sql = `SELECT g.* FROM poe_gems g WHERE ${conditions.join(" AND ")}`;
    sql += " ORDER BY g.name LIMIT ?";
    bindings.push(limit);

    const rows = await db
      .prepare(sql)
      .bind(...bindings)
      .all<GemRow>();

    return {
      type: "structured",
      data: {
        query: searchQuery,
        gems: rows.results.map(gemRowToResult),
        count: rows.results.length,
      },
    };
  },
};
