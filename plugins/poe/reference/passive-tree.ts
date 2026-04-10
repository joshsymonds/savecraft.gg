/**
 * PoE passive_tree — native reference module.
 *
 * FTS5 search over the passive skill tree stored in D1. Supports filtering
 * by node type (keystone, notable, mastery, small) and ascendancy class.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";

const DEFAULT_LIMIT = 20;

interface PassiveNodeRow {
  node_id: number;
  name: string;
  is_keystone: number;
  is_notable: number;
  is_mastery: number;
  ascendancy: string | null;
  stats: string | null;
  icon: string | null;
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

function nodeRowToResult(row: PassiveNodeRow): Record<string, unknown> {
  let nodeType = "small";
  if (row.is_keystone === 1) nodeType = "keystone";
  else if (row.is_notable === 1) nodeType = "notable";
  else if (row.is_mastery === 1) nodeType = "mastery";

  return {
    node_id: row.node_id,
    name: row.name,
    type: nodeType,
    ascendancy: row.ascendancy,
    stats: parseJsonColumn(row.stats),
    icon: row.icon,
  };
}

/** Sanitize a string for FTS5 MATCH: wrap in double quotes, escape internal double quotes. */
function fts5Safe(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export const passiveTreeModule: NativeReferenceModule = {
  id: "passive_tree",
  name: "Passive Tree Search",
  description: [
    "Search the Path of Exile passive skill tree by node name, stats, or ascendancy.",
    "USE PROACTIVELY: query this module to verify keystone and notable names,",
    "check exact stat values on passive nodes, or find nodes by keyword before",
    "referencing them in build advice. Prevents hallucinating passive names or wrong stat values.",
  ].join(" "),
  parameters: {
    query: {
      type: "string",
      description:
        "Full-text search on node name, stats, and ascendancy. Example: 'Resolute Technique'",
    },
    type: {
      type: "string",
      description:
        "Filter by node type: 'keystone', 'notable', 'mastery', or 'small'.",
    },
    ascendancy: {
      type: "string",
      description:
        "Filter to a specific ascendancy class. Example: 'Juggernaut', 'Necromancer'",
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
    const nodeType =
      typeof query.type === "string" ? query.type.trim().toLowerCase() : undefined;
    const ascendancy =
      typeof query.ascendancy === "string" ? query.ascendancy.trim() : undefined;
    const limit =
      typeof query.limit === "number"
        ? Math.min(Math.max(query.limit, 1), 100)
        : DEFAULT_LIMIT;

    if (!searchQuery) {
      return {
        type: "text",
        content:
          "Provide a query parameter for full-text search on passive node name, stats, or ascendancy. Optional filters: type (keystone/notable/mastery/small), ascendancy.",
      };
    }

    const safeQuery = fts5Safe(searchQuery);
    const conditions: string[] = [
      "n.node_id IN (SELECT node_id FROM poe_passive_nodes_fts WHERE poe_passive_nodes_fts MATCH ?)",
    ];
    const bindings: unknown[] = [safeQuery];

    if (nodeType) {
      switch (nodeType) {
        case "keystone":
          conditions.push("n.is_keystone = 1");
          break;
        case "notable":
          conditions.push("n.is_notable = 1");
          break;
        case "mastery":
          conditions.push("n.is_mastery = 1");
          break;
        case "small":
          conditions.push("n.is_notable = 0 AND n.is_keystone = 0 AND n.is_mastery = 0");
          break;
      }
    }

    if (ascendancy) {
      conditions.push("n.ascendancy = ?");
      bindings.push(ascendancy);
    }

    let sql = `SELECT n.* FROM poe_passive_nodes n WHERE ${conditions.join(" AND ")}`;
    sql += " ORDER BY n.name LIMIT ?";
    bindings.push(limit);

    const rows = await db
      .prepare(sql)
      .bind(...bindings)
      .all<PassiveNodeRow>();

    return {
      type: "structured",
      data: {
        query: searchQuery,
        results: rows.results.map(nodeRowToResult),
        count: rows.results.length,
      },
    };
  },
};
