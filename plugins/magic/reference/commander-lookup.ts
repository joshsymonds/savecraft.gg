/**
 * commander_lookup — native reference module.
 *
 * Given a Commander name, returns card recommendations by category, synergy
 * scores, inclusion rates, themes, similar commanders, and mana curve pulled
 * from the magic_edh_* D1 tables (populated by the edhrec-fetch tool).
 *
 * Data source: EDHREC.com — a community-built statistics site that aggregates
 * decklists from Archidekt, Moxfield, and others. Synergy scores are the
 * difference between how often a card appears in a given commander's decks
 * and how often it appears across all decks in the same color identity.
 */

import type { Env } from "../../../worker/src/types";
import type { NativeReferenceModule, ReferenceResult } from "../../../worker/src/reference/types";
import { safeParseJSON } from "../../../worker/src/reference/json";
import { resolveCommander } from "./commander-resolve";

const DEFAULT_LIMIT = 20;

interface RecommendationRow {
  card_name: string;
  category: string;
  synergy: number;
  inclusion: number;
  potential_decks: number;
  trend_zscore: number;
}

interface CurveRow {
  cmc: number;
  avg_count: number;
}

export const commanderLookupModule: NativeReferenceModule = {
  id: "commander_lookup",
  name: "Commander Lookup",
  description: [
    "Look up a Magic: The Gathering Commander and get card recommendations, synergy scores, themes, and popular inclusions from EDHREC data.",
    "USE PROACTIVELY when a user asks about building, improving, or evaluating a Commander (EDH) deck for a specific commander.",
    "Returns categorized card recommendations (high synergy cards, top cards, creatures, instants, sorceries, artifacts, enchantments, planeswalkers, lands, mana artifacts, utility lands, etc.), each with synergy score and inclusion rate (% of decks that run the card).",
    "Also returns commander metadata: color identity, total deck count on EDHREC, themes (infect, +1/+1 counters, etc.), similar commanders, and average mana curve.",
    "Supports fuzzy name matching — 'atraxa' finds 'Atraxa, Praetors' Voice'. Pass `category` to filter recommendations to a single category, or `limit` to cap results per category.",
  ].join(" "),
  parameters: {
    commander: {
      type: "string",
      description: "Commander name (fuzzy match). Required. Examples: 'Atraxa', 'Muldrotha the Gravetide', 'Korvold'.",
    },
    category: {
      type: "string",
      description:
        "Optional single category filter. One of: newcards, highsynergycards, topcards, gamechangers, creatures, instants, sorceries, utilityartifacts, enchantments, planeswalkers, utilitylands, manaartifacts, lands.",
    },
    limit: {
      type: "integer",
      description: "Max recommendations per category (default 20).",
    },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const commanderQuery = ((query.commander as string) ?? "").trim();
    if (!commanderQuery) {
      return { type: "text", content: "Missing required parameter: commander" };
    }
    const category = ((query.category as string) ?? "").trim();
    const limit = Math.max(
      1,
      Math.min(100, (query.limit as number | undefined) ?? DEFAULT_LIMIT),
    );

    // 1. Resolve commander: try FTS5 first (handles partial names and token order)
    let commanderRow = await resolveCommander(env, commanderQuery);
    if (!commanderRow) {
      return {
        type: "text",
        content: `Commander not found: "${commanderQuery}". This module only has data for commanders that EDHREC tracks. Try a more specific name, or confirm the commander exists.`,
      };
    }

    const commanderId = commanderRow.scryfall_id;

    // 2. Fetch recommendations. When filtering to one category, use a simple
    // LIMIT. When returning all categories, use a window-function-backed
    // per-category LIMIT so the server caps each bucket at `limit` rows —
    // critical because with ~13 categories × ~100 recs each, an unbounded
    // query can return ~1300 rows per request and exceed D1's per-sub-request
    // row cap.
    const recResult = category
      ? await env.DB
          .prepare(
            `SELECT card_name, category, synergy, inclusion, potential_decks, trend_zscore
             FROM magic_edh_recommendations
             WHERE commander_id = ? AND category = ?
             ORDER BY synergy DESC, inclusion DESC
             LIMIT ?`,
          )
          .bind(commanderId, category, limit)
          .all<RecommendationRow>()
      : await env.DB
          .prepare(
            `SELECT card_name, category, synergy, inclusion, potential_decks, trend_zscore
             FROM (
               SELECT
                 card_name, category, synergy, inclusion, potential_decks, trend_zscore,
                 ROW_NUMBER() OVER (
                   PARTITION BY category
                   ORDER BY synergy DESC, inclusion DESC
                 ) AS rn
               FROM magic_edh_recommendations
               WHERE commander_id = ?
             )
             WHERE rn <= ?
             ORDER BY category, synergy DESC, inclusion DESC`,
          )
          .bind(commanderId, limit)
          .all<RecommendationRow>();

    // Group by category (already SQL-bounded, but keep the bucket for shape).
    const recommendations: Record<string, Omit<RecommendationRow, "category">[]> = {};
    for (const row of recResult.results ?? []) {
      const bucket = recommendations[row.category] ?? (recommendations[row.category] = []);
      bucket.push({
        card_name: row.card_name,
        synergy: row.synergy,
        inclusion: row.inclusion,
        potential_decks: row.potential_decks,
        trend_zscore: row.trend_zscore,
      });
    }

    // 3. Fetch mana curve
    const curveResult = await env.DB
      .prepare(`SELECT cmc, avg_count FROM magic_edh_mana_curves WHERE commander_id = ? ORDER BY cmc`)
      .bind(commanderId)
      .all<CurveRow>();

    // 4. Parse JSON metadata columns
    const themes = safeParseJSON<Array<{ slug: string; value: string; count: number }>>(
      commanderRow.themes,
      [],
    );
    const similar = safeParseJSON<Array<{ id: string; name: string }>>(commanderRow.similar, []);
    const colorIdentity = safeParseJSON<string[]>(commanderRow.color_identity, []);

    return {
      type: "structured",
      data: {
        commander: {
          scryfall_id: commanderRow.scryfall_id,
          name: commanderRow.name,
          slug: commanderRow.slug,
          color_identity: colorIdentity,
          deck_count: commanderRow.deck_count,
          rank: commanderRow.rank,
          salt: commanderRow.salt,
        },
        themes,
        similar,
        mana_curve: curveResult.results ?? [],
        recommendations,
        attribution: {
          source: "EDHREC",
          url: `https://edhrec.com/commanders/${commanderRow.slug}`,
          note: "Synergy = how much more a card appears in this commander's decks vs. all decks in the same color identity. Inclusion = number of decks running this card.",
        },
      },
    };
  },
};

