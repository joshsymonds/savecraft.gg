/**
 * MTG Arena card_search — native reference module.
 *
 * Searches the Scryfall card database stored in D1. Supports FTS5 keyword
 * search on name/oracle_text/type_line, structured SQL filtering on all
 * fields, and Vectorize semantic search with RRF merge.
 */

import type { Env } from "../../../worker/src/types";
import type { NativeReferenceModule, ReferenceResult } from "../../../worker/src/reference/types";
import { mergeWithRRF } from "./rules-search";

const DEFAULT_LIMIT = 20;
const RRF_K = 60;

interface CardRow {
  arena_id: number;
  oracle_id: string;
  name: string;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  colors: string;
  color_identity: string;
  legalities: string;
  rarity: string;
  set_code: string;
  keywords: string;
}

function cardRowToResult(row: CardRow): Record<string, unknown> {
  return {
    arenaId: row.arena_id,
    oracleId: row.oracle_id,
    name: row.name,
    manaCost: row.mana_cost,
    cmc: row.cmc,
    typeLine: row.type_line,
    oracleText: row.oracle_text,
    colors: JSON.parse(row.colors || "[]") as string[],
    colorIdentity: JSON.parse(row.color_identity || "[]") as string[],
    legalities: JSON.parse(row.legalities || "{}") as Record<string, string>,
    rarity: row.rarity,
    set: row.set_code,
    keywords: JSON.parse(row.keywords || "[]") as string[],
  };
}

/** Sanitize a string for FTS5 MATCH: wrap in double quotes, escape internal double quotes. */
function fts5Safe(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export const cardSearchModule: NativeReferenceModule = {
  id: "card_search",
  name: "Card Search",
  description: [
    "Search the MTG Arena card database (Scryfall Oracle Cards).",
    "USE PROACTIVELY: query this module when you need to look up specific cards, find cards matching criteria, or verify card details.",
    "Supports searching by name, oracle text, type line, colors, mana cost, format legality, rarity, and set.",
    "Results include full card data: name, mana cost, type line, oracle text, colors, legalities, rarity, set, and keywords.",
  ].join(" "),
  parameters: {
    name: { type: "string", description: "Card name search (keyword match via FTS5)." },
    text: { type: "string", description: "Oracle text search (keyword match via FTS5)." },
    colors: { type: "string", description: "Color identity filter, e.g. 'BR' for black-red cards." },
    cmc: { type: "integer", description: "Converted mana cost filter." },
    cmc_op: { type: "string", description: "CMC comparison operator: '<=', '=', '>=' (default '=')." },
    type: { type: "string", description: "Type line substring filter (case-insensitive), e.g. 'creature'." },
    format: { type: "string", description: "Format legality filter, e.g. 'standard'. Excludes cards that are 'not_legal' in that format." },
    rarity: { type: "string", description: "Rarity filter: 'common', 'uncommon', 'rare', 'mythic'." },
    set: { type: "string", description: "Set code filter, e.g. 'DMU'." },
    sort: { type: "string", description: "Sort order: 'name' (default) or 'cmc'." },
    limit: { type: "integer", description: "Max results (default 20)." },
  },

  view_default: "hidden",
  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const name = (query.name as string) ?? "";
    const text = (query.text as string) ?? "";
    const colors = (query.colors as string) ?? "";
    const cmc = query.cmc as number | undefined;
    const cmcOp = (query.cmc_op as string) || "=";
    const type = (query.type as string) ?? "";
    const format = (query.format as string) ?? "";
    const rarity = (query.rarity as string) ?? "";
    const set = (query.set as string) ?? "";
    const sortBy = (query.sort as string) || "name";
    const limit = Math.min(Math.max(typeof query.limit === "number" ? query.limit : DEFAULT_LIMIT, 1), 100);

    const hasFtsQuery = name !== "" || text !== "";

    // ── FTS5 search for name/text queries ──────────────────────
    let ftsArenaIds: number[] | null = null;

    if (hasFtsQuery) {
      // Build FTS5 MATCH expression
      const matchParts: string[] = [];
      if (name) matchParts.push(`name : ${fts5Safe(name)}`);
      if (text) matchParts.push(`oracle_text : ${fts5Safe(text)}`);
      const matchExpr = matchParts.join(" OR ");

      const ftsResults = await env.DB.prepare(
        `SELECT arena_id FROM mtga_cards_fts WHERE mtga_cards_fts MATCH ?1 ORDER BY rank LIMIT ?2`,
      )
        .bind(matchExpr, limit * 3)
        .all<{ arena_id: number }>();

      ftsArenaIds = ftsResults.results.map((r) => r.arena_id);

      // Vectorize semantic search (if available)
      let vectorArenaIds: number[] = [];
      const vectorIndex = env.MTGA_CARDS_INDEX;
      if (env.AI && vectorIndex) {
        try {
          const queryText = [name, text].filter(Boolean).join(" ");
          const embedding = (await env.AI.run("@cf/baai/bge-base-en-v1.5", {
            text: [queryText],
          })) as { data?: number[][] };
          if (embedding.data?.[0]) {
            const vectorResults = await vectorIndex.query(embedding.data[0], {
              topK: limit * 3,
              filter: { type: "card" },
            });
            // Vector IDs are "card:{arena_id}"
            vectorArenaIds = vectorResults.matches
              .map((m) => {
                const parts = m.id.split(":");
                return parts.length === 2 ? parseInt(parts[1]!, 10) : NaN;
              })
              .filter((id) => !isNaN(id));
          }
        } catch (error) {
          console.warn("Vectorize card query failed, falling back to FTS5-only:", error);
        }
      }

      // Merge via RRF if we have vector results
      if (vectorArenaIds.length > 0) {
        const mergedIds = mergeWithRRF(
          ftsArenaIds.map(String),
          vectorArenaIds.map(String),
          RRF_K,
        );
        ftsArenaIds = mergedIds.map((id) => parseInt(id, 10));
      }

      if (ftsArenaIds.length === 0) {
        return { type: "structured", data: { cards: [], total: 0 } };
      }
    }

    // ── Build SQL query with structured filters ────────────────
    // Always filter to default printings (one result per card name).
    // Non-default printings exist for collection_diff arena_id lookups.
    // Redundant when FTS narrows results (FTS only indexes defaults), but
    // serves as defense-in-depth for non-FTS queries (e.g. rarity-only).
    const conditions: string[] = ["is_default = 1"];
    const params: unknown[] = [];
    let paramIdx = 1;

    // If FTS narrowed results, filter to those arena_ids
    if (ftsArenaIds !== null) {
      const placeholders = ftsArenaIds.map(() => `?${paramIdx++}`).join(",");
      conditions.push(`arena_id IN (${placeholders})`);
      params.push(...ftsArenaIds);
    }

    if (colors) {
      // Filter by color identity: card must contain all specified colors
      for (const c of colors.toUpperCase()) {
        conditions.push(`color_identity LIKE ?${paramIdx++}`);
        params.push(`%"${c}"%`);
      }
    }

    if (cmc !== undefined) {
      const op = cmcOp === "<=" ? "<=" : cmcOp === ">=" ? ">=" : "=";
      conditions.push(`cmc ${op} ?${paramIdx++}`);
      params.push(cmc);
    }

    if (type) {
      conditions.push(`type_line LIKE ?${paramIdx++} COLLATE NOCASE`);
      params.push(`%${type}%`);
    }

    if (format) {
      // Cards where the format key exists and value is NOT "not_legal"
      conditions.push(`json_extract(legalities, ?${paramIdx++}) IS NOT NULL`);
      params.push(`$.${format.toLowerCase()}`);
      conditions.push(`json_extract(legalities, ?${paramIdx++}) != 'not_legal'`);
      params.push(`$.${format.toLowerCase()}`);
    }

    if (rarity) {
      conditions.push(`rarity = ?${paramIdx++}`);
      params.push(rarity.toLowerCase());
    }

    if (set) {
      conditions.push(`set_code = ?${paramIdx++} COLLATE NOCASE`);
      params.push(set);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderClause = sortBy === "cmc" ? "ORDER BY cmc ASC, name ASC" : "ORDER BY name ASC";

    const sql = `SELECT * FROM mtga_cards ${whereClause} ${orderClause} LIMIT ?${paramIdx}`;
    params.push(limit);

    const results = await env.DB.prepare(sql)
      .bind(...params)
      .all<CardRow>();

    // If we had FTS results, re-sort by FTS/RRF rank order
    let cards: Record<string, unknown>[];
    if (ftsArenaIds !== null && sortBy !== "cmc") {
      const rankMap = new Map(ftsArenaIds.map((id, i) => [id, i]));
      const sorted = [...results.results].sort(
        (a, b) => (rankMap.get(a.arena_id) ?? Infinity) - (rankMap.get(b.arena_id) ?? Infinity),
      );
      cards = sorted.map(cardRowToResult);
    } else {
      cards = results.results.map(cardRowToResult);
    }

    return {
      type: "structured",
      data: { cards, total: cards.length },
    };
  },
};
