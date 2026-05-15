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
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { safeParseJSON } from "../../../worker/src/reference/json";
import { resolveCommander, type EdhCommanderRow } from "./commander-resolve";

const DEFAULT_LIMIT = 20;

const VALID_TIERS = ["budget", "upgraded", "optimized", "cedh"] as const;
type Tier = (typeof VALID_TIERS)[number];

interface RecommendationRow {
  card_name: string;
  category: string;
  synergy: number;
  inclusion: number;
  potential_decks: number;
  trend_zscore: number;
  price_usd: number | null;
}

interface TierAverageDeckRow {
  card_name: string;
  category: string;
  quantity: number;
}

interface TierInfoRow {
  tier: string;
  avg_price: number;
  num_decks_avg: number;
  deck_size: number;
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
      description:
        "Commander name (fuzzy match). Required. Examples: 'Atraxa', 'Muldrotha the Gravetide', 'Korvold'.",
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
    max_price: {
      type: "number",
      description:
        "Max USD price per card (resolves to EDHREC TCGPlayer mid first, then Scryfall default-printing fallback). Recommendations with no price source on either side are excluded when this filter is set.",
    },
    tier: {
      type: "string",
      description:
        "Optional EDHREC power/budget tier: 'budget' (~$150-300), 'upgraded' (~$1k), 'optimized' (~$2-3k), or 'cedh' (~$5k+). When set, recommendations come from the tier-specific average decklist instead of the cross-tier recommendation pool, and tier_info metadata is returned. Useful for 'show me what a budget Atraxa deck includes' style queries.",
    },
  },

  example: {
    game_id: "magic",
    module: "commander_lookup",
    queries: [
      {
        label: "Atraxa staples",
        commander: "Atraxa, Praetors' Voice",
        category: "topcards",
        limit: 20,
      },
    ],
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const commanderQuery = ((query.commander as string) ?? "").trim();
    if (!commanderQuery) {
      return { type: "text", content: "Missing required parameter: commander" };
    }
    const category = ((query.category as string) ?? "").trim();
    const limit = Math.max(
      1,
      Math.min(100, (query.limit as number | undefined) ?? DEFAULT_LIMIT),
    );
    const maxPrice =
      typeof query.max_price === "number" ? query.max_price : undefined;

    const rawTier = ((query.tier as string) ?? "").trim();
    let tier: Tier | undefined;
    if (rawTier !== "") {
      if (!(VALID_TIERS as readonly string[]).includes(rawTier)) {
        return {
          type: "text",
          content: `Invalid tier: "${rawTier}". Must be one of: ${VALID_TIERS.join(", ")}.`,
        };
      }
      tier = rawTier as Tier;
    }

    // 1. Resolve commander: try FTS5 first (handles partial names and token order)
    let commanderRow = await resolveCommander(env, commanderQuery);
    if (!commanderRow) {
      return {
        type: "text",
        content: `Commander not found: "${commanderQuery}". This module only has data for commanders that EDHREC tracks. Try a more specific name, or confirm the commander exists.`,
      };
    }

    const commanderId = commanderRow.scryfall_id;

    // 2a. Tier mode: pull recommendations from the tier-specific average deck
    // and surface tier_info metadata. Returns early since the tier path doesn't
    // need the recommendation pool / window function used by the default path.
    if (tier !== undefined) {
      return runTierLookup(env, commanderRow, tier);
    }

    // 2b. Default mode: fetch recommendations from the cross-tier pool. When
    // filtering to one category, use a simple LIMIT. When returning all
    // categories, use a window-function-backed per-category LIMIT so the
    // server caps each bucket at `limit` rows — critical because with ~13
    // categories × ~100 recs each, an unbounded query can return ~1300 rows
    // per request and exceed D1's per-sub-request row cap.
    //
    // Price resolution: COALESCE(EDHREC TCGPlayer, Scryfall default-printing).
    // EDHREC matches what users see on EDHREC; Scryfall fills in cards EDHREC
    // hasn't priced. NULL on both means "unknown price" — we exclude those
    // rows when max_price is set rather than treating NULL as $0.
    const priceFilter =
      maxPrice !== undefined
        ? `AND COALESCE(p.tcgplayer_price, c.price_usd) IS NOT NULL
         AND COALESCE(p.tcgplayer_price, c.price_usd) <= ?`
        : "";
    const priceFilterBindings = maxPrice !== undefined ? [maxPrice] : [];

    const recResult = category
      ? await env.DB.prepare(
          `SELECT
               r.card_name, r.category, r.synergy, r.inclusion,
               r.potential_decks, r.trend_zscore,
               COALESCE(p.tcgplayer_price, c.price_usd) AS price_usd
             FROM magic_edh_recommendations r
             LEFT JOIN magic_edh_card_prices p ON p.card_name = r.card_name
             LEFT JOIN magic_cards c ON c.name = r.card_name AND c.is_default = 1
             WHERE r.commander_id = ? AND r.category = ?
             ${priceFilter}
             ORDER BY r.synergy DESC, r.inclusion DESC
             LIMIT ?`,
        )
          .bind(commanderId, category, ...priceFilterBindings, limit)
          .all<RecommendationRow>()
      : await env.DB.prepare(
          `SELECT card_name, category, synergy, inclusion, potential_decks, trend_zscore, price_usd
             FROM (
               SELECT
                 r.card_name, r.category, r.synergy, r.inclusion,
                 r.potential_decks, r.trend_zscore,
                 COALESCE(p.tcgplayer_price, c.price_usd) AS price_usd,
                 ROW_NUMBER() OVER (
                   PARTITION BY r.category
                   ORDER BY r.synergy DESC, r.inclusion DESC
                 ) AS rn
               FROM magic_edh_recommendations r
               LEFT JOIN magic_edh_card_prices p ON p.card_name = r.card_name
               LEFT JOIN magic_cards c ON c.name = r.card_name AND c.is_default = 1
               WHERE r.commander_id = ?
               ${priceFilter}
             )
             WHERE rn <= ?
             ORDER BY category, synergy DESC, inclusion DESC`,
        )
          .bind(commanderId, ...priceFilterBindings, limit)
          .all<RecommendationRow>();

    // Group by category (already SQL-bounded, but keep the bucket for shape).
    const recommendations: Record<
      string,
      Omit<RecommendationRow, "category">[]
    > = {};
    for (const row of recResult.results ?? []) {
      const bucket =
        recommendations[row.category] ?? (recommendations[row.category] = []);
      bucket.push({
        card_name: row.card_name,
        synergy: row.synergy,
        inclusion: row.inclusion,
        potential_decks: row.potential_decks,
        trend_zscore: row.trend_zscore,
        price_usd: row.price_usd,
      });
    }

    // 3. Fetch mana curve
    const curveResult = await env.DB.prepare(
      `SELECT cmc, avg_count FROM magic_edh_mana_curves WHERE commander_id = ? ORDER BY cmc`,
    )
      .bind(commanderId)
      .all<CurveRow>();

    // 4. Parse JSON metadata columns
    const themes = safeParseJSON<
      Array<{ slug: string; value: string; count: number }>
    >(commanderRow.themes, []);
    const similar = safeParseJSON<Array<{ id: string; name: string }>>(
      commanderRow.similar,
      [],
    );
    const colorIdentity = safeParseJSON<string[]>(
      commanderRow.color_identity,
      [],
    );

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

async function runTierLookup(
  env: Env,
  commanderRow: EdhCommanderRow,
  tier: Tier,
): Promise<ReferenceResult> {
  const commanderId = commanderRow.scryfall_id;

  const [tierMetaResult, tierDeckResult] = await Promise.all([
    env.DB.prepare(
      `SELECT tier, avg_price, num_decks_avg, deck_size
         FROM magic_edh_commander_tiers
         WHERE commander_id = ? AND tier = ?`,
    )
      .bind(commanderId, tier)
      .all<TierInfoRow>(),
    env.DB.prepare(
      `SELECT card_name, category, quantity
         FROM magic_edh_average_decks_by_tier
         WHERE commander_id = ? AND tier = ?
         ORDER BY category, card_name`,
    )
      .bind(commanderId, tier)
      .all<TierAverageDeckRow>(),
  ]);

  const tierInfo = tierMetaResult.results?.[0] ?? null;
  const deck = tierDeckResult.results ?? [];

  // Group by category (mirrors the default path's recommendations shape).
  const recommendations: Record<
    string,
    { card_name: string; quantity: number }[]
  > = {};
  for (const row of deck) {
    const cat = row.category || "uncategorized";
    const bucket = recommendations[cat] ?? (recommendations[cat] = []);
    bucket.push({ card_name: row.card_name, quantity: row.quantity });
  }

  const themes = safeParseJSON<
    Array<{ slug: string; value: string; count: number }>
  >(commanderRow.themes, []);
  const similar = safeParseJSON<Array<{ id: string; name: string }>>(
    commanderRow.similar,
    [],
  );
  const colorIdentity = safeParseJSON<string[]>(
    commanderRow.color_identity,
    [],
  );

  // Empty deck + null tier_info means EDHREC didn't publish this tier for the
  // commander. Caller still gets a structured response so the LLM can
  // explain the gap rather than treating it as an error.
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
      tier_info: tierInfo,
      themes,
      similar,
      recommendations,
      attribution: {
        source: "EDHREC",
        url: `https://edhrec.com/commanders/${commanderRow.slug}/${tier}`,
        note: `Tier-specific average decklist. recommendations[category] entries reflect what an empirical ${tier}-tier ${commanderRow.name} deck typically runs.`,
      },
    },
  };
}
