/**
 * PoE unique_search — native reference module.
 *
 * FTS5 search over unique items stored in D1. Supports filtering by item
 * class (e.g. "Body Armour", "Amulet"). Variant items (e.g., Atziri's
 * Splendour with different defense types) are stored as separate rows.
 * Populated by poeninja-fetch from poe.ninja.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { fts5Safe, parseJsonColumn } from "./shared";

const DEFAULT_LIMIT = 20;

interface UniqueRow {
  name: string;
  variant: string | null;
  base_type: string | null;
  item_class: string | null;
  level_requirement: number | null;
  str_requirement: number | null;
  dex_requirement: number | null;
  int_requirement: number | null;
  properties: string | null;
  implicit_mods: string | null;
  explicit_mods: string | null;
  flavour_text: string | null;
  drop_level: number | null;
}

function uniqueRowToResult(row: UniqueRow): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: row.name,
    base_type: row.base_type,
    item_class: row.item_class,
    level_requirement: row.level_requirement,
    properties: parseJsonColumn(row.properties),
    implicit_mods: parseJsonColumn(row.implicit_mods),
    explicit_mods: parseJsonColumn(row.explicit_mods),
    flavour_text: row.flavour_text,
    drop_level: row.drop_level,
  };
  if (row.variant) {
    result.variant = row.variant;
  }
  return result;
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
          "Provide a query parameter for full-text search on unique item name, base type, item class, or mods. Optional filter: item_class.",
      };
    }

    // Existence check (avoid full COUNT(*) table scan).
    const exists = await db
      .prepare("SELECT 1 FROM poe_uniques LIMIT 1")
      .first<Record<string, unknown>>();
    if (!exists) {
      return {
        type: "text",
        content:
          "Unique item data is not yet populated. The data pipeline for uniques is under development. Use the build_planner module to inspect items on specific builds.",
      };
    }

    const safeQuery = fts5Safe(searchQuery);
    const conditions: string[] = [
      "u.name IN (SELECT name FROM poe_uniques_fts WHERE poe_uniques_fts MATCH ?)",
    ];
    const bindings: unknown[] = [safeQuery];

    if (itemClass) {
      conditions.push("u.item_class = ?");
      bindings.push(itemClass);
    }

    let sql = `SELECT u.* FROM poe_uniques u WHERE ${conditions.join(" AND ")}`;
    sql += " ORDER BY u.name, u.variant LIMIT ?";
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
