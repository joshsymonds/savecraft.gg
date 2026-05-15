/**
 * commander_trends — native reference module.
 *
 * Lightweight aggregation over magic_edh_commanders to answer "what's hot
 * in Commander right now?" Supports three modes:
 *  - top:       commanders ordered by deck_count DESC
 *  - themes:    popular themes aggregated across all commanders
 *  - by_colors: top commanders filtered by color identity subset
 *
 * Data source: EDHREC.com (via the edhrec-fetch pipeline).
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { safeParseJSON } from "../../../worker/src/reference/json";
import { buildJSONSubsetExpr, isValidColors } from "./wubrg";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const VALID_MODES = new Set(["top", "themes", "by_colors", "cheapest"]);

interface CommanderRow {
  scryfall_id: string;
  name: string;
  slug: string;
  color_identity: string;
  deck_count: number;
  rank: number | null;
}

async function runTrends(
  query: Record<string, unknown>,
  env: Env,
): Promise<ReferenceResult> {
  const mode = ((query.mode as string) ?? "top").trim() || "top";
  if (!VALID_MODES.has(mode)) {
    return {
      type: "text",
      content: `Invalid mode: "${mode}". Must be one of: top, themes, by_colors.`,
    };
  }

  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, (query.limit as number | undefined) ?? DEFAULT_LIMIT),
  );

  if (mode === "themes") {
    return runThemesMode(env, limit);
  }

  if (mode === "cheapest") {
    const maxAvgPrice =
      typeof query.max_avg_price === "number" ? query.max_avg_price : undefined;
    return runCheapestMode(env, limit, maxAvgPrice);
  }

  // top + by_colors both return ranked commander lists; they differ only in WHERE clause.
  let whereClause = "";
  const binds: unknown[] = [];

  if (mode === "by_colors") {
    const hasColors = typeof query.colors === "string";
    if (!hasColors) {
      return {
        type: "text",
        content:
          "mode=by_colors requires a `colors` parameter (WUBRG letters, empty string for colorless).",
      };
    }
    const userColors = (query.colors as string).trim().toUpperCase();
    if (!isValidColors(userColors)) {
      return {
        type: "text",
        content: `Invalid colors value: "${query.colors as string}". Use WUBRG letters only.`,
      };
    }
    // color_identity is stored as a JSON array like '["W","U","B","G"]'.
    // Subset check strips JSON punctuation then the user's allowed letters.
    whereClause = `WHERE ${buildJSONSubsetExpr(userColors, "color_identity")} = ''`;
  }

  const sql = `
    SELECT scryfall_id, name, slug, color_identity, deck_count, rank
    FROM magic_edh_commanders
    ${whereClause}
    ORDER BY deck_count DESC
    LIMIT ?
  `;
  binds.push(limit);

  const result = await env.DB.prepare(sql)
    .bind(...binds)
    .all<CommanderRow>();
  const commanders = (result.results ?? []).map((row) => ({
    scryfall_id: row.scryfall_id,
    name: row.name,
    slug: row.slug,
    color_identity: safeParseJSON<string[]>(row.color_identity, []),
    deck_count: row.deck_count,
    rank: row.rank,
  }));

  return {
    type: "structured",
    data: {
      mode,
      commanders,
      count: commanders.length,
      attribution: {
        source: "EDHREC",
        note: "Top commanders ordered by deck count (number of decks on EDHREC).",
      },
    },
  };
}

interface ThemeAggregateRow {
  slug: string;
  value: string;
  total_count: number;
  commander_count: number;
}

interface CheapestRow {
  scryfall_id: string;
  name: string;
  slug: string;
  color_identity: string;
  deck_count: number;
  rank: number | null;
  budget_avg_price: number;
  budget_num_decks_avg: number;
}

async function runCheapestMode(
  env: Env,
  limit: number,
  maxAvgPrice: number | undefined,
): Promise<ReferenceResult> {
  const priceCap = maxAvgPrice !== undefined ? "AND t.avg_price <= ?" : "";
  const binds: unknown[] = [];
  if (maxAvgPrice !== undefined) binds.push(maxAvgPrice);
  binds.push(limit);

  const sql = `
    SELECT
      c.scryfall_id, c.name, c.slug, c.color_identity, c.deck_count, c.rank,
      t.avg_price AS budget_avg_price,
      t.num_decks_avg AS budget_num_decks_avg
    FROM magic_edh_commanders c
    JOIN magic_edh_commander_tiers t
      ON t.commander_id = c.scryfall_id AND t.tier = 'budget'
    WHERE 1=1 ${priceCap}
    ORDER BY t.avg_price ASC, c.deck_count DESC
    LIMIT ?
  `;

  const result = await env.DB.prepare(sql)
    .bind(...binds)
    .all<CheapestRow>();
  const commanders = (result.results ?? []).map((row) => ({
    scryfall_id: row.scryfall_id,
    name: row.name,
    slug: row.slug,
    color_identity: safeParseJSON<string[]>(row.color_identity, []),
    deck_count: row.deck_count,
    rank: row.rank,
    budget_avg_price: row.budget_avg_price,
    budget_num_decks_avg: row.budget_num_decks_avg,
  }));

  return {
    type: "structured",
    data: {
      mode: "cheapest",
      commanders,
      count: commanders.length,
      attribution: {
        source: "EDHREC",
        note: "Commanders ranked by lowest budget-tier avg_price. Tied prices break by EDHREC popularity (deck_count DESC).",
      },
    },
  };
}

async function runThemesMode(
  env: Env,
  limit: number,
): Promise<ReferenceResult> {
  // Read pre-aggregated themes from magic_edh_themes, populated by
  // edhrec-fetch at import time. Avoids scanning every commander row on
  // each request.
  const result = await env.DB.prepare(
    `SELECT slug, value, total_count, commander_count
     FROM magic_edh_themes
     ORDER BY total_count DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<ThemeAggregateRow>();

  const themes = result.results ?? [];

  return {
    type: "structured",
    data: {
      mode: "themes",
      themes,
      count: themes.length,
      attribution: {
        source: "EDHREC",
        note: "Themes aggregated across all commanders. total_count = sum of theme counts across commanders. commander_count = number of commanders featuring this theme.",
      },
    },
  };
}

export const commanderTrendsModule: NativeReferenceModule = {
  id: "commander_trends",
  name: "Commander Trends",
  description: [
    "Top Magic: The Gathering Commanders and popular themes from EDHREC — answers 'what's hot in Commander right now?'",
    "USE PROACTIVELY when a player asks about popular commanders, trending decks, what they should build next, or wants ideas filtered by color identity, or asks for cheap/budget commander suggestions.",
    "Four modes: `mode=top` (top commanders by deck count, the default), `mode=themes` (popular themes aggregated across all commanders, with total counts and commander coverage), `mode=by_colors` (top commanders whose color identity is a subset of the provided colors — e.g. colors='BG' returns mono-B, mono-G, BG, and colorless commanders), `mode=cheapest` (commanders ranked by lowest budget-tier average price; pass `max_avg_price` to cap by USD).",
  ].join(" "),
  parameters: {
    mode: {
      type: "string",
      description: "One of: top (default), themes, by_colors, cheapest.",
    },
    colors: {
      type: "string",
      description:
        "For mode=by_colors: WUBRG letters representing the colors your deck can support. Subset semantics — a 'BG' filter returns BG, mono-B, mono-G, and colorless commanders, but not BRG (has R) or WBG (has W). Use empty string '' for colorless-only.",
    },
    max_avg_price: {
      type: "number",
      description:
        "For mode=cheapest: USD ceiling on the budget-tier average price. Returns only commanders whose budget-tier deck typically costs less than this.",
    },
    limit: {
      type: "integer",
      description: "Max results (default 20, max 100).",
    },
  },
  example: {
    game_id: "magic",
    module: "commander_trends",
    queries: [{ label: "Top commanders", mode: "top", limit: 20 }],
  },
  execute: runTrends,
};
