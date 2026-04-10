/**
 * PoE unique_search — native reference module.
 *
 * FTS5 search over unique items stored in D1. Supports filtering by item
 * class (e.g. "Body Armour", "Amulet").
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";

const DEFAULT_LIMIT = 20;

interface UniqueRow {
  unique_id: string;
  name: string;
  base_type: string | null;
  item_class: string | null;
  properties: string | null;
  implicit_mods: string | null;
  explicit_mods: string | null;
  icon: string | null;
  flavour_text: string | null;
  required_level: number | null;
}

function parseJsonColumn(value: string | null): unknown {
  if (value === null) return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}

function uniqueRowToResult(row: UniqueRow): Record<string, unknown> {
  return {
    unique_id: row.unique_id,
    name: row.name,
    base_type: row.base_type,
    item_class: row.item_class,
    properties: parseJsonColumn(row.properties),
    implicit_mods: parseJsonColumn(row.implicit_mods),
    explicit_mods: parseJsonColumn(row.explicit_mods),
    icon: row.icon,
    flavour_text: row.flavour_text,
    required_level: row.required_level,
  };
}

/** Sanitize a string for FTS5 MATCH: wrap in double quotes, escape internal double quotes. */
function fts5Safe(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export const uniqueSearchModule: NativeReferenceModule = {
  id: "unique_search",
  name: "Unique Item Search",
  description: [
    "Search Path of Exile unique items by name, base type, item class, or mod text.",
    "USE PROACTIVELY: query this module to verify unique item names, check exact",
    "mod values, or find uniques by keyword before referencing them in build advice.",
    "Prevents hallucinating unique names or wrong mod values.",
  ].join(" "),
  parameters: {
    query: {
      type: "string",
      description:
        "Full-text search on unique name, base type, item class, and mods. Example: 'Kaom'",
    },
    item_class: {
      type: "string",
      description:
        "Filter by item class. Example: 'Body Armour', 'Amulet', 'Ring', 'Belt'",
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
    const itemClass =
      typeof query.item_class === "string" ? query.item_class.trim() : undefined;
    const limit =
      typeof query.limit === "number"
        ? Math.min(Math.max(query.limit, 1), 100)
        : DEFAULT_LIMIT;

    if (!searchQuery) {
      return {
        type: "text",
        content:
          "Provide a query parameter for full-text search on unique item name, base type, item class, or mods. Optional filter: item_class.",
      };
    }

    const safeQuery = fts5Safe(searchQuery);
    const conditions: string[] = [
      "u.unique_id IN (SELECT unique_id FROM poe_uniques_fts WHERE poe_uniques_fts MATCH ?)",
    ];
    const bindings: unknown[] = [safeQuery];

    if (itemClass) {
      conditions.push("u.item_class = ?");
      bindings.push(itemClass);
    }

    let sql = `SELECT u.* FROM poe_uniques u WHERE ${conditions.join(" AND ")}`;
    sql += " ORDER BY u.name LIMIT ?";
    bindings.push(limit);

    const rows = await db
      .prepare(sql)
      .bind(...bindings)
      .all<UniqueRow>();

    return {
      type: "structured",
      data: {
        query: searchQuery,
        items: rows.results.map(uniqueRowToResult),
        count: rows.results.length,
      },
    };
  },
};
