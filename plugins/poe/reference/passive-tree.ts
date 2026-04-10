/**
 * PoE passive_tree — native reference module.
 *
 * Hybrid search: D1 FTS5 (keyword) + Vectorize (semantic), merged via RRF.
 * Falls back to FTS5-only when Vectorize is unavailable. Supports filtering
 * by node type (keystone, notable, mastery, small) and ascendancy class.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { mergeWithRRF } from "../../../worker/src/reference/rrf";
import { fts5Safe, parseJsonColumn } from "./shared";

const DEFAULT_LIMIT = 20;
const RRF_K = 60;
const MAX_RRF_IDS = 90; // Stay under D1's 100-parameter bind limit

interface PassiveNodeRow {
  skill_id: number;
  name: string;
  is_notable: number;
  is_keystone: number;
  is_mastery: number;
  is_ascendancy: number;
  ascendancy_name: string | null;
  stats: string | null;
  group_id: number | null;
  orbit: number | null;
  orbit_index: number | null;
}

function nodeType(row: PassiveNodeRow): string {
  if (row.is_keystone) return "keystone";
  if (row.is_notable) return "notable";
  if (row.is_mastery) return "mastery";
  return "small";
}

function nodeRowToResult(row: PassiveNodeRow): Record<string, unknown> {
  return {
    id: row.skill_id,
    name: row.name,
    type: nodeType(row),
    stats: parseJsonColumn(row.stats),
    ascendancy: row.ascendancy_name,
  };
}

export const passiveTreeModule: NativeReferenceModule = {
  id: "passive_tree",
  name: "Passive Tree Search",
  description: [
    "Search Path of Exile passive tree nodes by name or stat description.",
    "USE PROACTIVELY: query this module to verify keystone effects, find notable",
    "locations, or check ascendancy nodes before advising on tree pathing.",
    "Supports filtering by type (keystone, notable, mastery, small) and ascendancy.",
  ].join(" "),
  parameters: {
    query: {
      type: "string",
      description:
        "Full-text search on node name, stats, or ascendancy. Example: 'Mind Over Matter'",
    },
    type: {
      type: "string",
      description:
        "Filter by node type: 'keystone', 'notable', 'mastery', or 'small'.",
    },
    ascendancy: {
      type: "string",
      description:
        "Filter to a specific ascendancy class. Example: 'Hierophant', 'Necromancer'",
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
    const nodeTypeFilter =
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

    // FTS5 keyword search
    const safeQuery = fts5Safe(searchQuery);
    const ftsResults = await db
      .prepare("SELECT skill_id FROM poe_passive_nodes_fts WHERE poe_passive_nodes_fts MATCH ? LIMIT ?")
      .bind(safeQuery, MAX_RRF_IDS)
      .all<{ skill_id: number }>();
    let skillIds = ftsResults.results.map((r) => String(r.skill_id));

    // Vectorize semantic search (if available)
    const vectorIndex = env.POE_INDEX;
    if (env.AI && vectorIndex) {
      try {
        const embedding = (await env.AI.run("@cf/baai/bge-base-en-v1.5", {
          text: [searchQuery],
        })) as { data?: number[][] };
        if (embedding.data?.[0]) {
          const vectorResults = await vectorIndex.query(embedding.data[0], {
            topK: limit * 2,
            filter: { type: "node" },
          });
          const vectorIds = vectorResults.matches
            .map((m) => m.id.replace(/^node:/, ""))
            .filter((id) => id !== "");
          if (vectorIds.length > 0) {
            skillIds = mergeWithRRF(skillIds, vectorIds, RRF_K, MAX_RRF_IDS);
          }
        }
      } catch (error) {
        console.warn("Vectorize node query failed, falling back to FTS5-only:", error);
      }
    }

    if (skillIds.length === 0) {
      return {
        type: "structured",
        data: { query: searchQuery, results: [], count: 0 },
      };
    }

    // Fetch full rows with filters
    const placeholders = skillIds.map(() => "?").join(",");
    const conditions: string[] = [`n.skill_id IN (${placeholders})`];
    const bindings: unknown[] = [...skillIds.map(Number)];

    if (nodeTypeFilter) {
      switch (nodeTypeFilter) {
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
      conditions.push("n.ascendancy_name = ?");
      bindings.push(ascendancy);
    }

    bindings.push(limit);
    const sql = `SELECT n.* FROM poe_passive_nodes n WHERE ${conditions.join(" AND ")} LIMIT ?`;
    const rows = await db.prepare(sql).bind(...bindings).all<PassiveNodeRow>();

    // Re-sort by RRF rank order
    const rowMap = new Map(rows.results.map((r) => [r.skill_id, r]));
    const ordered = skillIds
      .map((id) => rowMap.get(Number(id)))
      .filter((r): r is PassiveNodeRow => r != null);

    return {
      type: "structured",
      data: {
        query: searchQuery,
        results: ordered.map(nodeRowToResult),
        count: ordered.length,
      },
    };
  },
};
