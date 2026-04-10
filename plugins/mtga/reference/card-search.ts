/**
 * MTG Arena card_search — native reference module.
 *
 * Searches the Scryfall card database stored in D1. Supports FTS5 keyword
 * search on name/oracle_text/type_line, structured SQL filtering on all
 * fields, and Vectorize semantic search with RRF merge.
 */

import type { Env } from "../../../worker/src/types";
import type { NativeReferenceModule, ReferenceResult } from "../../../worker/src/reference/types";
import { fts5Safe } from "../../../worker/src/reference/fts5";
import { mergeWithRRF } from "../../../worker/src/reference/rrf";

const DEFAULT_LIMIT = 20;
const RRF_K = 60;
// Vectorize topK cap — generous enough to capture semantic matches while
// staying within D1's 100-bind-parameter limit alongside structured filters.
const MAX_VECTOR_IDS = 80;

interface CardRow {
  scryfall_id: string;
  arena_id: number | null;
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
  power: string | null;
  toughness: string | null;
}

function cardRowToResult(row: CardRow): Record<string, unknown> {
  return {
    scryfallId: row.scryfall_id,
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
    ...(row.power != null && { power: row.power }),
    ...(row.toughness != null && { toughness: row.toughness }),
  };
}

export const cardSearchModule: NativeReferenceModule = {
  id: "card_search",
  name: "Card Search",
  description: [
    "Search the MTG Arena card database (Scryfall Oracle Cards).",
    "USE PROACTIVELY: query this module when you need to look up specific cards, find cards matching criteria, or verify card details.",
    "Supports searching by name, oracle text, type line, colors (with Scryfall-style operators: >=, =, <=, <, >), mana cost, format legality, rarity, and set.",
    "Results include full card data: name, mana cost, type line, oracle text, colors, legalities, rarity, set, and keywords.",
  ].join(" "),
  parameters: {
    name: { type: "string", description: "Card name search (keyword match via FTS5)." },
    text: { type: "string", description: "Oracle text search (keyword match via FTS5)." },
    colors: { type: "string", description: "Color identity filter using WUBRG letters (e.g. 'W', 'BR', 'WUB'). Behavior depends on colors_op. Matches Scryfall c: syntax." },
    colors_op: { type: "string", description: "Color comparison operator (Scryfall syntax). '>=' (default): contains all specified colors (c>=W includes multicolor). '=': exactly these colors (c=W is mono-white only). '<=': subset of specified (c<=WB includes mono-W, mono-B, Orzhov, and colorless). '<': strict subset. '>': strict superset (must have specified colors plus more)." },
    cmc: { type: "integer", description: "Converted mana cost filter." },
    cmc_op: { type: "string", description: "CMC comparison operator: '<=', '=', '>=' (default '=')." },
    type: { type: "string", description: "Type line substring filter (case-insensitive), e.g. 'creature'." },
    format: { type: "string", description: "Format legality filter, e.g. 'standard'. Excludes cards that are 'not_legal' in that format." },
    rarity: { type: "string", description: "Rarity filter: 'common', 'uncommon', 'rare', 'mythic'." },
    set: { type: "string", description: "Set code filter, e.g. 'DMU'." },
    sort: { type: "string", description: "Sort order: 'name' (default) or 'cmc'." },
    limit: { type: "integer", description: "Max results (default 20)." },
    include_tokens: { type: "boolean", description: "Include token cards in results (default false). Tokens are excluded by default." },
    include_alchemy: { type: "boolean", description: "Include Alchemy rebalanced cards (A- prefix) in results (default false). Alchemy cards are excluded by default since they are digital-only variants." },
  },


  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const name = (query.name as string) ?? "";
    const text = (query.text as string) ?? "";
    const colors = (query.colors as string) ?? "";
    const VALID_COLOR_OPS = [">=", "=", "<=", "<", ">"] as const;
    const rawColorsOp = (query.colors_op as string) || ">=";
    const colorsOp = (VALID_COLOR_OPS as readonly string[]).includes(rawColorsOp) ? rawColorsOp : ">=";
    const cmc = query.cmc as number | undefined;
    const cmcOp = (query.cmc_op as string) || "=";
    const type = (query.type as string) ?? "";
    const format = (query.format as string) ?? "";
    const rarity = (query.rarity as string) ?? "";
    const set = (query.set as string) ?? "";
    const sortBy = (query.sort as string) || "name";
    const limit = Math.min(Math.max(typeof query.limit === "number" ? query.limit : DEFAULT_LIMIT, 1), 100);
    const includeTokens = query.include_tokens === true;
    const includeAlchemy = query.include_alchemy === true;

    const hasFtsQuery = name !== "" || text !== "";

    // ── FTS5 MATCH expression ─────────────────────────────────
    let ftsMatchExpr = "";
    if (hasFtsQuery) {
      const matchParts: string[] = [];
      if (name) matchParts.push(`name : ${fts5Safe(name)}`);
      if (text) matchParts.push(`oracle_text : ${fts5Safe(text)}`);
      ftsMatchExpr = matchParts.join(" OR ");
    }

    // ── Vectorize semantic search (if available) ──────────────
    let vectorScryfallIds: string[] = [];
    if (hasFtsQuery) {
      const vectorIndex = env.MTGA_CARDS_INDEX;
      if (env.AI && vectorIndex) {
        try {
          const queryText = [name, text].filter(Boolean).join(" ");
          const embedding = (await env.AI.run("@cf/baai/bge-base-en-v1.5", {
            text: [queryText],
          })) as { data?: number[][] };
          if (embedding.data?.[0]) {
            const vectorResults = await vectorIndex.query(embedding.data[0], {
              topK: Math.min(limit * 3, MAX_VECTOR_IDS),
              filter: { type: "card" },
            });
            // Vector IDs are "card:{scryfall_id}" or "alias:{scryfall_id}".
            // Both formats have scryfall_id as parts[1].
            vectorScryfallIds = vectorResults.matches
              .map((m) => {
                const parts = m.id.split(":");
                return parts.length === 2 ? parts[1]! : "";
              })
              .filter((id) => id !== "");
          }
        } catch (error) {
          console.warn("Vectorize card query failed, falling back to FTS5-only:", error);
        }
      }
    }

    // ── Build SQL query with structured filters ────────────────
    // Uses a JOIN with FTS5 instead of pre-fetching IDs into an IN clause.
    // This ensures structured filters (cmc, colors, etc.) are applied to the
    // full FTS result set rather than a truncated top-N, fixing cases where
    // valid cards were dropped before filtering.
    const conditions: string[] = ["c.is_default = 1"];
    const params: unknown[] = [];
    let paramIdx = 1;

    // Exclude tokens by default — they dominate keyword searches and are rarely wanted
    if (!includeTokens) {
      conditions.push(`c.type_line NOT LIKE '%Token%'`);
    }

    // Exclude Alchemy rebalances (A- prefix) by default — digital-only variants
    // that clutter results for non-Alchemy players
    if (!includeAlchemy) {
      conditions.push(`c.name NOT LIKE 'A-%'`);
    }

    // Vectorize results are fetched in a separate query after the main FTS
    // JOIN query, using the same structured filters, then merged via RRF.

    if (colors) {
      const ALL_COLORS = ["W", "U", "B", "R", "G"];
      const specified = [...new Set(colors.toUpperCase().split("").filter((ch) => ALL_COLORS.includes(ch)))];

      if (colorsOp === "=" || colorsOp === ">=" || colorsOp === ">") {
        // Must contain all specified colors
        for (const ch of specified) {
          conditions.push(`c.color_identity LIKE ?${paramIdx++}`);
          params.push(`%"${ch}"%`);
        }
      }

      if (colorsOp === "=") {
        // Exactly these colors — no more, no fewer
        conditions.push(`json_array_length(c.color_identity) = ${specified.length}`);
      } else if (colorsOp === ">") {
        // Strict superset — must have extras beyond specified
        conditions.push(`json_array_length(c.color_identity) > ${specified.length}`);
      } else if (colorsOp === "<=" || colorsOp === "<") {
        // Every color in card must be in the specified set (colorless [] passes naturally)
        const excluded = ALL_COLORS.filter((ch) => !specified.includes(ch));
        for (const ch of excluded) {
          conditions.push(`c.color_identity NOT LIKE ?${paramIdx++}`);
          params.push(`%"${ch}"%`);
        }
        if (colorsOp === "<") {
          // Strict subset — must have fewer colors than specified
          conditions.push(`json_array_length(c.color_identity) < ${specified.length}`);
        }
      }
    }

    if (cmc !== undefined) {
      const op = cmcOp === "<=" ? "<=" : cmcOp === ">=" ? ">=" : "=";
      conditions.push(`c.cmc ${op} ?${paramIdx++}`);
      params.push(cmc);
    }

    if (type) {
      conditions.push(`c.type_line LIKE ?${paramIdx++} COLLATE NOCASE`);
      params.push(`%${type}%`);
    }

    if (format) {
      // Cards where the format key exists and value is NOT "not_legal"
      conditions.push(`json_extract(c.legalities, ?${paramIdx++}) IS NOT NULL`);
      params.push(`$.${format.toLowerCase()}`);
      conditions.push(`json_extract(c.legalities, ?${paramIdx++}) != 'not_legal'`);
      params.push(`$.${format.toLowerCase()}`);
    }

    if (rarity) {
      conditions.push(`c.rarity = ?${paramIdx++}`);
      params.push(rarity.toLowerCase());
    }

    if (set) {
      conditions.push(`c.set_code = ?${paramIdx++} COLLATE NOCASE`);
      params.push(set);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Snapshot structured filter state before adding FTS/LIMIT params.
    // Used by the vector-only query to apply the same filters.
    const structuredConditions = [...conditions];
    const structuredParams = [...params];

    // ── Build FROM clause: JOIN with FTS5 when text search is active ──
    let fromClause: string;
    let orderClause: string;

    if (hasFtsQuery) {
      // INNER JOIN with FTS5 applies text matching and structured filters in
      // one query. No pre-filter truncation — SQLite evaluates the full FTS
      // result set against all WHERE conditions before applying LIMIT.
      fromClause = `magic_cards c INNER JOIN magic_cards_fts fts ON c.scryfall_id = fts.scryfall_id AND fts.magic_cards_fts MATCH ?${paramIdx++}`;
      params.push(ftsMatchExpr);

      orderClause = sortBy === "cmc"
        ? "ORDER BY c.cmc ASC, c.name ASC"
        : "ORDER BY fts.rank, c.name ASC";
    } else {
      fromClause = "magic_cards c";
      orderClause = sortBy === "cmc"
        ? "ORDER BY c.cmc ASC, c.name ASC"
        : "ORDER BY c.name ASC";
    }

    const sql = `SELECT DISTINCT c.* FROM ${fromClause} ${whereClause} ${orderClause} LIMIT ?${paramIdx}`;
    params.push(limit);

    const results = await env.DB.prepare(sql)
      .bind(...params)
      .all<CardRow>();

    let cards: Record<string, unknown>[];

    if (hasFtsQuery && vectorScryfallIds.length > 0) {
      // Vectorize path: the main query (FTS JOIN) returned all text-matching
      // cards that pass structured filters. Now fetch vector-only matches
      // (semantic hits that FTS missed) and merge via RRF.
      const ftsIds = results.results.map((r) => r.scryfall_id);
      const ftsIdSet = new Set(ftsIds);
      const vectorOnlyIds = vectorScryfallIds.filter((id) => !ftsIdSet.has(id));

      let vectorRows: CardRow[] = [];
      if (vectorOnlyIds.length > 0) {
        // Apply the same structured filters (cmc, colors, type, etc.) to
        // vector-only hits so semantic results respect user criteria.
        // Cap IDs to stay within D1's 100-bind-parameter limit:
        // structuredParams (max ~15) + vectorOnlyIds + LIMIT must be < 100.
        const maxVecIds = 100 - structuredParams.length - 1;
        const cappedVecIds = vectorOnlyIds.slice(0, maxVecIds);

        const vecConditions = [...structuredConditions];
        const vecParams = [...structuredParams];
        let vecIdx = structuredParams.length + 1;

        const placeholders = cappedVecIds.map(() => `?${vecIdx++}`).join(",");
        vecConditions.push(`c.scryfall_id IN (${placeholders})`);
        vecParams.push(...cappedVecIds);

        const vecWhereClause = `WHERE ${vecConditions.join(" AND ")}`;
        const vecSql = `SELECT c.* FROM magic_cards c ${vecWhereClause} LIMIT ?${vecIdx}`;
        vecParams.push(limit);

        const vecResults = await env.DB.prepare(vecSql)
          .bind(...vecParams)
          .all<CardRow>();
        vectorRows = vecResults.results;
      }

      // Merge FTS results + vector-only results via RRF
      const allRows = [...results.results, ...vectorRows];
      const rrfIds = mergeWithRRF(ftsIds, vectorScryfallIds, RRF_K, limit);

      // Re-sort all rows by RRF order
      const rowMap = new Map(allRows.map((r) => [r.scryfall_id, r]));
      const sorted: CardRow[] = [];
      for (const id of rrfIds) {
        const row = rowMap.get(id);
        if (row) sorted.push(row);
      }
      // Append any FTS rows that RRF didn't include (if RRF capped at limit)
      const includedIds = new Set(sorted.map((s) => s.scryfall_id));
      for (const row of results.results) {
        if (!includedIds.has(row.scryfall_id)) {
          sorted.push(row);
        }
      }

      cards = sorted.slice(0, limit).map(cardRowToResult);
    } else {
      cards = results.results.map(cardRowToResult);
    }

    return {
      type: "structured",
      data: { cards, total: cards.length },
    };
  },
};
