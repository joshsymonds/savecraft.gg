/**
 * commander_deck_review — native reference module.
 *
 * Compares a user's Commander decklist against EDHREC's average decklist for
 * that commander. Flags missing staples, computes overlap percentage,
 * identifies extras, and returns a category breakdown comparison.
 *
 * Data source: EDHREC.com.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { safeParseJSON } from "../../../worker/src/reference/json";
import { resolveCommander } from "./commander-resolve";

const STAPLE_THRESHOLD = 0.25;
const MAX_MISSING_STAPLES = 20;
const MAX_STAPLE_CANDIDATES = 200;

const VALID_TIERS = ["budget", "upgraded", "optimized", "cedh"] as const;
type Tier = (typeof VALID_TIERS)[number];

interface RecRow {
  card_name: string;
  inclusion: number;
}

interface AverageDeckRow {
  card_name: string;
  quantity: number;
  category: string;
}

interface TierInfoRow {
  tier: string;
  avg_price: number;
  num_decks_avg: number;
  deck_size: number;
}

async function runReview(
  query: Record<string, unknown>,
  env: Env,
): Promise<ReferenceResult> {
  const commanderQuery = ((query.commander as string) ?? "").trim();
  if (!commanderQuery) {
    return { type: "text", content: "Missing required parameter: commander" };
  }

  const rawDecklist = Array.isArray(query.decklist)
    ? (query.decklist as unknown[])
    : [];
  const deckByLower = parseDecklist(rawDecklist);
  const deckNames = new Set(deckByLower.keys());
  if (deckNames.size === 0) {
    return {
      type: "text",
      content:
        "Missing or empty required parameter: decklist (array of card names).",
    };
  }

  const includeAverage = query.include_average === true;

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

  const commanderRow = await resolveCommander(env, commanderQuery);
  if (!commanderRow) {
    return {
      type: "text",
      content: `Commander not found: "${commanderQuery}". This module only has data for commanders that EDHREC tracks.`,
    };
  }

  const commanderId = commanderRow.scryfall_id;

  // Fire top-cards, average-deck, and (optional) tier-info queries in
  // parallel — they're independent once the commander is resolved.
  const minInclusion = Math.floor(commanderRow.deck_count * STAPLE_THRESHOLD);
  const averageDecksQuery = tier
    ? env.DB
        .prepare(
          `SELECT card_name, quantity, category
           FROM magic_edh_average_decks_by_tier
           WHERE commander_id = ? AND tier = ?`,
        )
        .bind(commanderId, tier)
        .all<AverageDeckRow>()
    : env.DB
        .prepare(
          `SELECT card_name, quantity, category
           FROM magic_edh_average_decks
           WHERE commander_id = ?`,
        )
        .bind(commanderId)
        .all<AverageDeckRow>();

  const tierInfoQuery: Promise<{ results?: TierInfoRow[] }> = tier
    ? env.DB
        .prepare(
          `SELECT tier, avg_price, num_decks_avg, deck_size
           FROM magic_edh_commander_tiers
           WHERE commander_id = ? AND tier = ?`,
        )
        .bind(commanderId, tier)
        .all<TierInfoRow>()
    : Promise.resolve({ results: [] });

  const [topCardsResult, averageResult, tierInfoResult] = await Promise.all([
    env.DB.prepare(
      `SELECT card_name, inclusion
         FROM magic_edh_recommendations
         WHERE commander_id = ? AND category = 'topcards' AND inclusion >= ?
         ORDER BY inclusion DESC
         LIMIT ?`,
    )
      .bind(commanderId, minInclusion, MAX_STAPLE_CANDIDATES)
      .all<RecRow>(),
    averageDecksQuery,
    tierInfoQuery,
  ]);

  const tierInfo = tier ? (tierInfoResult.results?.[0] ?? null) : undefined;

  const averageDeck = averageResult.results ?? [];
  const averageNameSet = new Set(
    averageDeck.map((e) => e.card_name.toLowerCase()),
  );

  const missingStaples = (topCardsResult.results ?? [])
    .filter((rec: RecRow) => !deckNames.has(rec.card_name.toLowerCase()))
    .slice(0, MAX_MISSING_STAPLES)
    .map((rec) => ({
      card_name: rec.card_name,
      inclusion: rec.inclusion,
      inclusion_pct:
        commanderRow.deck_count > 0
          ? rec.inclusion / commanderRow.deck_count
          : 0,
    }));

  let matching = 0;
  for (const entry of averageDeck) {
    if (deckNames.has(entry.card_name.toLowerCase())) {
      matching++;
    }
  }
  const overlapPct = averageDeck.length > 0 ? matching / averageDeck.length : 0;

  const extras: string[] = [];
  for (const [lower, original] of deckByLower) {
    if (!averageNameSet.has(lower)) {
      extras.push(original);
    }
  }

  const userCategoryCounts: Record<string, number> = {};
  const avgCategoryCounts: Record<string, number> = {};
  const avgByLowerName = new Map(
    averageDeck.map((e) => [e.card_name.toLowerCase(), e]),
  );
  for (const lower of deckByLower.keys()) {
    const avgEntry = avgByLowerName.get(lower);
    if (avgEntry?.category) {
      userCategoryCounts[avgEntry.category] =
        (userCategoryCounts[avgEntry.category] ?? 0) + 1;
    }
  }
  // Both sides count distinct cards per category (not copies) so the
  // comparison is apples-to-apples. Counting quantities on the avg side would
  // inflate land-heavy categories vs the user's distinct-card count.
  for (const entry of averageDeck) {
    if (entry.category) {
      avgCategoryCounts[entry.category] =
        (avgCategoryCounts[entry.category] ?? 0) + 1;
    }
  }
  const allCategories = new Set([
    ...Object.keys(userCategoryCounts),
    ...Object.keys(avgCategoryCounts),
  ]);
  const categoryBreakdown = [...allCategories]
    .toSorted((a, b) => a.localeCompare(b))
    .map((category) => ({
      category,
      user_count: userCategoryCounts[category] ?? 0,
      average_count: avgCategoryCounts[category] ?? 0,
    }));

  // Price the user's deck. EDHREC TCGPlayer first, Scryfall fallback,
  // unknown-price cards excluded from total_price and listed in
  // cards_without_prices so the LLM can flag them.
  const maxPrice = typeof query.max_price === "number" ? query.max_price : undefined;
  const { totalPrice, cardsWithoutPrices } = await priceDecklist(env, deckByLower);

  const data: Record<string, unknown> = {
    commander: {
      scryfall_id: commanderRow.scryfall_id,
      name: commanderRow.name,
      slug: commanderRow.slug,
      color_identity: safeParseJSON<string[]>(commanderRow.color_identity, []),
      deck_count: commanderRow.deck_count,
      rank: commanderRow.rank,
    },
    deck_size: deckNames.size,
    total_price: totalPrice,
    cards_without_prices: cardsWithoutPrices,
    missing_staples: missingStaples,
    overlap: {
      matching_cards: matching,
      total_average: averageDeck.length,
      percentage: overlapPct,
    },
    extras,
    category_breakdown: categoryBreakdown,
    attribution: {
      source: "EDHREC",
      url: `https://edhrec.com/commanders/${commanderRow.slug}`,
      note: `Staple threshold: ${Math.round(STAPLE_THRESHOLD * 100)}% inclusion or higher. Missing staples ordered by popularity.`,
    },
  };

  if (maxPrice !== undefined) {
    data.over_budget = totalPrice > maxPrice;
    data.budget = maxPrice;
  }

  // Surface tier_info only when tier was requested. tierInfo === null means
  // EDHREC didn't publish that tier for this commander; the LLM should
  // explain rather than treat as error.
  if (tier !== undefined) {
    data.tier_info = tierInfo ?? null;
  }

  if (includeAverage) {
    data.average_deck = averageDeck;
  }

  return { type: "structured", data };
}

interface PriceLookupRow {
  card_name: string;
  price_usd: number | null;
}

/**
 * Sum prices across the user's decklist. Returns the running total and a list
 * of card names that had no price source on either EDHREC or Scryfall —
 * those cards contribute 0 to the total but the caller should surface them so
 * the LLM can flag the price uncertainty.
 *
 * D1 has a 100-bind-parameter limit per statement; a 100-card Commander deck
 * fits comfortably. Two queries (EDHREC, then Scryfall fallback) so each stays
 * under the limit independently.
 */
async function priceDecklist(
  env: Env,
  deck: Map<string, string>,
): Promise<{ totalPrice: number; cardsWithoutPrices: string[] }> {
  const names = [...deck.values()];
  if (names.length === 0) {
    return { totalPrice: 0, cardsWithoutPrices: [] };
  }
  const placeholders = names.map(() => "?").join(",");

  const [edhRes, scryRes] = await Promise.all([
    env.DB
      .prepare(
        `SELECT card_name, tcgplayer_price AS price_usd
         FROM magic_edh_card_prices
         WHERE card_name IN (${placeholders})`,
      )
      .bind(...names)
      .all<PriceLookupRow>(),
    env.DB
      .prepare(
        `SELECT name AS card_name, price_usd
         FROM magic_cards
         WHERE is_default = 1 AND name IN (${placeholders})`,
      )
      .bind(...names)
      .all<PriceLookupRow>(),
  ]);

  // EDHREC wins when both sources have a price for the same name.
  const priceByName = new Map<string, number>();
  for (const row of scryRes.results ?? []) {
    if (row.price_usd != null) priceByName.set(row.card_name, row.price_usd);
  }
  for (const row of edhRes.results ?? []) {
    if (row.price_usd != null) priceByName.set(row.card_name, row.price_usd);
  }

  let total = 0;
  const missing: string[] = [];
  for (const name of names) {
    const p = priceByName.get(name);
    if (p == null) {
      missing.push(name);
    } else {
      total += p;
    }
  }
  // Round to cents — SQLite + JS float arithmetic produces dust like 0.7000000000000001.
  total = Math.round(total * 100) / 100;
  return { totalPrice: total, cardsWithoutPrices: missing };
}

export const commanderDeckReviewModule: NativeReferenceModule = {
  id: "commander_deck_review",
  name: "Commander Deck Review",
  description: [
    "Review a Magic: The Gathering Commander (EDH) decklist by comparing it against EDHREC's average build for a given commander.",
    "USE PROACTIVELY when the player asks to rate, review, audit, critique, or improve a Commander deck. Detects missing staples, off-meta extras, overall overlap with the community consensus, and category-by-category composition differences.",
    "Pass the player's full decklist as an array of strings — supports both plain card names ('Sol Ring') and quantity-prefixed entries ('1 Sol Ring', '10 Forest').",
    "Returns: missing_staples (top cards above 25% inclusion that the user isn't running), overlap (how much of the deck aligns with the average), extras (cards not in the average), and category_breakdown.",
  ].join(" "),
  parameters: {
    commander: {
      type: "string",
      description: "Commander name (fuzzy match). Required.",
    },
    decklist: {
      type: "array",
      items: { type: "string" },
      description:
        "Array of card names. Accepts plain names ('Sol Ring') or quantity-prefixed entries ('1 Sol Ring', '10 Forest').",
    },
    include_average: {
      type: "boolean",
      description:
        "When true, returns the full EDHREC average decklist alongside the review. Default false.",
    },
    deck_section: {
      type: "string",
      description:
        'Section name containing the deck (e.g., "deck:Atraxa Superfriends"). Requires save_id.',
    },
    save_id: {
      type: "string",
      description:
        "Save UUID. Required when using deck_section to reference a deck from save data.",
    },
    max_price: {
      type: "number",
      description:
        "USD budget cap. When set, the response includes over_budget (true if total_price exceeds this) and budget (the cap echoed back). Cards without known prices are listed in cards_without_prices regardless.",
    },
    tier: {
      type: "string",
      description:
        "Optional EDHREC tier ('budget' | 'upgraded' | 'optimized' | 'cedh'). When set, comparison is against the tier-specific average decklist instead of the cross-tier average, and tier_info metadata is returned. Useful for 'rate my $200 deck against EDHREC's budget Atraxa' queries.",
    },
  },
  sectionMappings: [
    {
      sectionParam: "deck_section",
      extract: (sectionData: unknown) => {
        const data = sectionData as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        if (Array.isArray(data.cards)) {
          const list: string[] = [];
          for (const entry of data.cards) {
            const e = entry as { name?: string; count?: number };
            if (e.name) {
              const qty = e.count ?? 1;
              list.push(`${qty} ${e.name}`);
            }
          }
          result.decklist = list;
        }
        return result;
      },
    },
  ],
  execute: runReview,
};

/**
 * Parse a decklist array into a Map<lowercase, original-casing>. Supports
 * both plain names ("Sol Ring") and quantity-prefixed entries ("1 Sol Ring",
 * "10 Forest"). Quantities are discarded. Deduplication is case-insensitive;
 * the first-seen casing wins.
 */
function parseDecklist(entries: unknown[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const raw of entries) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const match = /^(\d+)\s+(.+)$/.exec(trimmed);
    const name = (match ? match[2]! : trimmed).trim();
    const lower = name.toLowerCase();
    if (!result.has(lower)) {
      result.set(lower, name);
    }
  }
  return result;
}

