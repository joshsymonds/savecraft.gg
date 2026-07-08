/**
 * PoE2 passive_tree — native reference module.
 *
 * Two operations, selected by which parameter is present:
 *
 *   1. Search: pass `query` (+ optional `type`/`ascendancy` filters) for
 *      FTS5 keyword search over node name and stat text.
 *   2. Resolve: pass `hashes` (an array of node hashes) to resolve them to
 *      `{hash, name, type, stats}`. Unknown hashes are silently skipped
 *      from the result list but reported back in `unknown_hashes`, and
 *      output order always matches input order — this is what turns a
 *      character's allocated-node hash array (poe2 adapter's `passives`
 *      section) into readable tree data.
 *
 * D1-only (no Vectorize/semantic search) — GGG's tree export has no prose
 * to embed beyond the stat lines FTS5 already covers.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { fts5Safe, parseJsonColumn } from "./shared";

const DEFAULT_LIMIT = 20;
// Stay under D1's 100-bound-parameter limit per statement.
const MAX_HASH_BATCH = 90;

interface PassiveNodeRow {
  hash: number;
  name: string;
  is_notable: number;
  is_keystone: number;
  is_mastery: number;
  ascendancy_name: string | null;
  stats: string | null;
}

function nodeType(row: PassiveNodeRow): string {
  if (row.is_keystone) return "keystone";
  if (row.is_notable) return "notable";
  if (row.is_mastery) return "mastery";
  return "small";
}

function nodeRowToResult(row: PassiveNodeRow): Record<string, unknown> {
  return {
    hash: row.hash,
    name: row.name,
    type: nodeType(row),
    stats: parseJsonColumn(row.stats),
    ascendancy: row.ascendancy_name,
  };
}

/** Parse a query.hashes entry into a node hash, or undefined if not a valid integer. */
function toNodeHash(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}

async function resolveHashes(
  db: Env["DB"],
  rawHashes: unknown[],
): Promise<ReferenceResult> {
  const parsed = rawHashes.map((raw) => ({ raw, hash: toNodeHash(raw) }));
  const validHashes = [
    ...new Set(
      parsed.map((p) => p.hash).filter((h): h is number => h !== undefined),
    ),
  ];

  const rowByHash = new Map<number, PassiveNodeRow>();
  for (let i = 0; i < validHashes.length; i += MAX_HASH_BATCH) {
    const chunk = validHashes.slice(i, i + MAX_HASH_BATCH);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT * FROM poe2_passive_nodes WHERE hash IN (${placeholders})`,
      )
      .bind(...chunk)
      .all<PassiveNodeRow>();
    for (const row of rows.results) {
      rowByHash.set(row.hash, row);
    }
  }

  const results: Record<string, unknown>[] = [];
  const unknownHashes: unknown[] = [];
  for (const { raw, hash } of parsed) {
    const row = hash !== undefined ? rowByHash.get(hash) : undefined;
    if (row) {
      results.push(nodeRowToResult(row));
    } else {
      unknownHashes.push(raw);
    }
  }

  return {
    type: "structured",
    data: {
      results,
      count: results.length,
      unknown_hashes: unknownHashes,
    },
  };
}

export const passiveTreeModule: NativeReferenceModule = {
  id: "passive_tree",
  name: "Passive Tree Search",
  description: [
    "Search or resolve Path of Exile 2 passive tree nodes.",
    "USE PROACTIVELY: query this module to verify keystone effects, find notable",
    "locations, or check ascendancy nodes before advising on tree pathing — and to",
    "resolve a character's allocated passive node hashes (the `hashes` array in a",
    "connected character's passives section) to readable names, types, and stats.",
    "Supports filtering search by type (keystone, notable, mastery, small) and ascendancy.",
  ].join(" "),
  parameters: {
    query: {
      type: "string",
      description:
        "Full-text search on node name or stat description. Example: 'Avatar of Fire'",
    },
    hashes: {
      type: "array",
      description:
        "Array of node hashes (integer skill ids from a character's allocated passives) to resolve to name/type/stats. Alternative to query — provide one or the other.",
    },
    type: {
      type: "string",
      description:
        "Filter search results by node type: 'keystone', 'notable', 'mastery', or 'small'.",
    },
    ascendancy: {
      type: "string",
      description:
        "Filter search results to a specific ascendancy class. Example: 'Infernalist', 'Titan'",
    },
    limit: {
      type: "number",
      description: `Maximum search results to return (default ${DEFAULT_LIMIT}).`,
    },
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const db = env.DB;

    if (Array.isArray(query.hashes)) {
      return resolveHashes(db, query.hashes);
    }

    const searchQuery =
      typeof query.query === "string" ? query.query.trim() : undefined;
    const nodeTypeFilter =
      typeof query.type === "string"
        ? query.type.trim().toLowerCase()
        : undefined;
    const ascendancy =
      typeof query.ascendancy === "string"
        ? query.ascendancy.trim()
        : undefined;
    const limit =
      typeof query.limit === "number"
        ? Math.min(Math.max(query.limit, 1), 100)
        : DEFAULT_LIMIT;

    if (!searchQuery) {
      return {
        type: "text",
        content:
          "Provide a query parameter for full-text search on passive node name or stats, or a hashes parameter (array of node hashes) to resolve allocated nodes. Optional search filters: type (keystone/notable/mastery/small), ascendancy.",
      };
    }

    const exists = await db
      .prepare("SELECT 1 FROM poe2_passive_nodes LIMIT 1")
      .first<Record<string, unknown>>();
    if (!exists) {
      return {
        type: "text",
        content:
          "Passive tree data is not yet populated. The data pipeline for the PoE2 passive tree is under development.",
      };
    }

    const safeQuery = fts5Safe(searchQuery);
    const conditions: string[] = [
      "n.hash IN (SELECT hash FROM poe2_passive_nodes_fts WHERE poe2_passive_nodes_fts MATCH ?)",
    ];
    const bindings: unknown[] = [safeQuery];

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
          conditions.push(
            "n.is_notable = 0 AND n.is_keystone = 0 AND n.is_mastery = 0",
          );
          break;
      }
    }

    if (ascendancy) {
      conditions.push("n.ascendancy_name = ?");
      bindings.push(ascendancy);
    }

    bindings.push(limit);
    const sql = `SELECT n.* FROM poe2_passive_nodes n WHERE ${conditions.join(" AND ")} LIMIT ?`;
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
