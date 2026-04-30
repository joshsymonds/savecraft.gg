/**
 * commander_deckbuild — native reference module.
 *
 * Builds a Commander deck given a commander name and a USD budget. Mirrors
 * EDHREC's tier-specific average decklist (M2.1 data) and applies budget /
 * exclude / game-changer filters. The output is a structured deck with
 * per-card prices, total cost, and warnings.
 *
 * This implementation covers the empty-starting-point path (M4.1). Precon
 * starting-point (M4.2) and output polish (M4.3 — data_confidence, mana
 * base re-allocation, full RL flagging) are layered in subsequent tasks.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { safeParseJSON } from "../../../worker/src/reference/json";
import { resolveCardPrices } from "./commander-prices";
import { resolveCommander } from "./commander-resolve";

const VALID_TIERS = ["budget", "upgraded", "optimized", "cedh"] as const;
type Tier = (typeof VALID_TIERS)[number];

interface TierInfoRow {
  tier: Tier;
  avg_price: number;
  num_decks_avg: number;
  deck_size: number;
}

interface TierDeckRow {
  card_name: string;
  quantity: number;
  category: string;
}


interface DeckEntry {
  card_name: string;
  quantity: number;
  category: string;
  price_usd: number | null;
  source: "tier" | "must_include" | "precon" | "upgrade" | "basic_substitution";
  game_changer: boolean;
  reserved: boolean;
}

/**
 * Derive a data_confidence label from the tier's num_decks_avg. EDHREC's
 * tier endpoints can have wildly different sample sizes — e.g. Atraxa
 * budget has 4072 decks, but cedh has 147; for an off-meta commander a
 * tier might have <50 decks. Surfacing this lets the LLM caveat its
 * recommendation appropriately.
 */
function dataConfidence(numDecksAvg: number): "low" | "medium" | "high" {
  if (numDecksAvg >= 1000) return "high";
  if (numDecksAvg >= 100) return "medium";
  return "low";
}

const COLOR_TO_BASIC: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

interface PreconRow {
  slug: string;
  name: string;
  msrp_usd: number | null;
  set_code: string | null;
  release_year: number | null;
}

interface PreconDeckRow {
  card_name: string;
  quantity: number;
  category: string;
}

interface PreconUpgradeRow {
  card_name: string;
  action: string;
  inclusion: number;
}

/**
 * Pick a tier from `max_price` when the user didn't specify one. Thresholds
 * are tuned to EDHREC's empirical avg_price ladder for popular commanders:
 * budget ≈ $150-300, upgraded ≈ $1k, optimized ≈ $2-3k, cedh ≈ $5k+.
 */
function autoTierFromPrice(maxPrice: number | undefined): Tier {
  if (maxPrice === undefined) return "upgraded";
  if (maxPrice < 300) return "budget";
  if (maxPrice < 1000) return "upgraded";
  if (maxPrice < 3000) return "optimized";
  return "cedh";
}

export const commanderDeckbuildModule: NativeReferenceModule = {
  id: "commander_deckbuild",
  name: "Commander Deck Build",
  description: [
    "Build a Magic: The Gathering Commander deck given a commander and a USD budget.",
    "USE PROACTIVELY when a player asks to build, generate, or assemble a Commander deck — especially with a budget cap.",
    "Mirrors EDHREC's tier-specific average decklist (budget/upgraded/optimized/cedh) so the output reflects what people actually play at that price level rather than a synthesized template.",
    "Auto-picks the tier from `max_price` (≤$300=budget, ≤$1000=upgraded, ≤$3000=optimized, else cedh); pass `tier` to override.",
    "Returns a structured deck with per-card prices, total_price, slots_remaining when budget runs out, and warnings (e.g. when budget falls below the empirical floor of the chosen tier).",
    "Use `excludes` to skip cards, `must_include` to pin pet cards (added even when over budget), and `exclude_game_changers` to enforce bracket constraints (default true at budget tier, false otherwise).",
  ].join(" "),
  parameters: {
    commander: {
      type: "string",
      description: "Commander name (fuzzy match). Required.",
    },
    max_price: {
      type: "number",
      description: "USD budget ceiling. Determines auto-picked tier and caps single-card and total deck cost.",
    },
    tier: {
      type: "string",
      description:
        "Override tier explicitly: 'budget' | 'upgraded' | 'optimized' | 'cedh'. When unset, auto-picks from max_price.",
    },
    excludes: {
      type: "array",
      items: { type: "string" },
      description: "Card names to omit from the build.",
    },
    must_include: {
      type: "array",
      items: { type: "string" },
      description:
        "Card names to pin into the deck regardless of budget (counts toward total_price). Useful for pet cards or required staples the user owns.",
    },
    exclude_game_changers: {
      type: "boolean",
      description:
        "When true, drops cards on the WotC Game Changers list — used to honor bracket-1/2 constraints. Defaults to true when tier='budget', false otherwise.",
    },
    budget_mode: {
      type: "string",
      description:
        "How strictly to honor max_price. 'ceiling' (default) never exceeds max_price — drops slots if needed. 'target' aims at max_price ± 10%, allowing a slight overshoot to fill the deck. Useful when 'around $100' is closer to user intent than 'strictly under $100'.",
    },
    starting_point: {
      type: "string",
      description:
        "How to seed the build. 'empty' (default) builds from scratch using the tier's average decklist. 'precon:<slug>' starts with that exact precon. 'precon:auto' picks the most-popular MSRP'd precon for this commander, charges its retail to the budget, then walks the cardstoadd / landstoadd pool to fill remaining budget with upgrades.",
    },
    theme: {
      type: "string",
      description:
        "Optional theme slug (e.g. 'infect', 'tokens', '+1-1-counters'). When set, the build mirrors EDHREC's per-theme average decklist for this commander instead of the cross-theme tier average. Useful for archetype-specific builds — 'infect Atraxa' will run a different deck shape than 'planeswalker Atraxa'. Returns text fallback when EDHREC has no data for that theme on this commander.",
    },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const commanderQuery = ((query.commander as string) ?? "").trim();
    if (!commanderQuery) {
      return { type: "text", content: "Missing required parameter: commander" };
    }

    const maxPrice = typeof query.max_price === "number" ? query.max_price : undefined;

    let tier: Tier;
    const rawTier = ((query.tier as string) ?? "").trim();
    if (rawTier !== "") {
      if (!(VALID_TIERS as readonly string[]).includes(rawTier)) {
        return {
          type: "text",
          content: `Invalid tier: "${rawTier}". Must be one of: ${VALID_TIERS.join(", ")}.`,
        };
      }
      tier = rawTier as Tier;
    } else {
      tier = autoTierFromPrice(maxPrice);
    }

    const excludes = new Set(
      (Array.isArray(query.excludes) ? (query.excludes as string[]) : [])
        .filter((s) => typeof s === "string")
        .map((s) => s.toLowerCase()),
    );
    const mustInclude = (Array.isArray(query.must_include)
      ? (query.must_include as string[])
      : []
    ).filter((s) => typeof s === "string" && s !== "");

    // Default exclude_game_changers: true at budget tier, false elsewhere.
    const excludeGameChangers =
      typeof query.exclude_game_changers === "boolean"
        ? (query.exclude_game_changers as boolean)
        : tier === "budget";

    const rawBudgetMode = ((query.budget_mode as string) ?? "ceiling").trim();
    if (rawBudgetMode !== "ceiling" && rawBudgetMode !== "target") {
      return {
        type: "text",
        content: `Invalid budget_mode: "${rawBudgetMode}". Must be 'ceiling' or 'target'.`,
      };
    }
    const budgetMode = rawBudgetMode as "ceiling" | "target";
    // 'target' allows a 10% overshoot; 'ceiling' is a hard cap.
    const effectiveCap =
      maxPrice !== undefined
        ? budgetMode === "target"
          ? maxPrice * 1.1
          : maxPrice
        : undefined;

    const startingPoint = ((query.starting_point as string) ?? "empty").trim();
    const theme = ((query.theme as string) ?? "").trim();

    // Resolve commander.
    const commanderRow = await resolveCommander(env, commanderQuery);
    if (!commanderRow) {
      return {
        type: "text",
        content: `Commander not found: "${commanderQuery}". This module only builds decks for commanders that EDHREC tracks.`,
      };
    }
    const commanderId = commanderRow.scryfall_id;

    // Precon-starting-point branches off here. The empty path continues below.
    if (startingPoint.startsWith("precon:")) {
      return runPreconBuild(env, commanderRow, startingPoint, {
        maxPrice,
        excludes,
        mustInclude,
        budgetMode,
      });
    }

    // Theme-mode branches off too. Theme path mirrors a per-theme average
    // decklist (Atraxa+infect ≠ Atraxa+planeswalkers) instead of the
    // cross-theme tier average.
    if (theme !== "") {
      return runThemeBuild(env, commanderRow, theme, {
        maxPrice,
        excludes,
        mustInclude,
        budgetMode,
        excludeGameChangers,
      });
    }

    // Load tier metadata + tier deck in parallel.
    const [tierInfoResult, tierDeckResult, gcResult] = await Promise.all([
      env.DB
        .prepare(
          `SELECT tier, avg_price, num_decks_avg, deck_size
           FROM magic_edh_commander_tiers
           WHERE commander_id = ? AND tier = ?`,
        )
        .bind(commanderId, tier)
        .all<TierInfoRow>(),
      env.DB
        .prepare(
          `SELECT card_name, quantity, category
           FROM magic_edh_average_decks_by_tier
           WHERE commander_id = ? AND tier = ?`,
        )
        .bind(commanderId, tier)
        .all<TierDeckRow>(),
      excludeGameChangers
        ? env.DB
            .prepare(`SELECT card_name FROM magic_game_changers`)
            .all<{ card_name: string }>()
        : Promise.resolve({ results: [] as { card_name: string }[] }),
    ]);

    const tierInfo = tierInfoResult.results?.[0];
    const tierDeck = tierDeckResult.results ?? [];

    if (!tierInfo || tierDeck.length === 0) {
      return {
        type: "text",
        content: `No data for ${commanderRow.name} at tier='${tier}'. EDHREC may not have indexed this tier yet (rare commanders) or the chosen tier doesn't fit this commander. Try a different tier or omit the parameter.`,
      };
    }

    const gameChangerSet = new Set(
      (gcResult.results ?? []).map((r) => r.card_name.toLowerCase()),
    );
    // Always look up the full game-changer set for output flagging, even
    // when not used as a filter.
    const allGameChangersResult = excludeGameChangers
      ? gcResult
      : await env.DB
          .prepare(`SELECT card_name FROM magic_game_changers`)
          .all<{ card_name: string }>();
    const allGameChangers = new Set(
      (allGameChangersResult.results ?? []).map((r) => r.card_name.toLowerCase()),
    );

    // Resolve prices for the tier deck + must_include cards.
    const allNames = new Set<string>();
    for (const c of tierDeck) allNames.add(c.card_name);
    for (const m of mustInclude) allNames.add(m);
    const namesArr = [...allNames];
    const priceLookup = await resolveCardPrices(env, namesArr);
    const priceByLower = priceLookup.prices;

    // Filter tier deck.
    const filtered: TierDeckRow[] = [];
    const dropped: { card_name: string; reason: string }[] = [];
    for (const c of tierDeck) {
      const lower = c.card_name.toLowerCase();
      if (excludes.has(lower)) {
        dropped.push({ card_name: c.card_name, reason: "excludes" });
        continue;
      }
      if (excludeGameChangers && gameChangerSet.has(lower)) {
        dropped.push({ card_name: c.card_name, reason: "game_changer" });
        continue;
      }
      const resolved = priceByLower.get(lower);
      // Single-card sanity: if max_price is set and the card costs >half the
      // budget on its own, skip — it'd starve the rest of the deck. Lands
      // get a free pass here since the mana base re-allocation step below
      // handles them differently (swap for basics rather than skip).
      if (
        maxPrice !== undefined &&
        resolved?.price != null &&
        resolved.price > maxPrice / 2 &&
        c.category !== "Land"
      ) {
        dropped.push({ card_name: c.card_name, reason: "single_card_too_expensive" });
        continue;
      }
      filtered.push(c);
    }

    // Greedy fill in inclusion-DESC order. The tier average is already
    // ordered by category for grouping purposes; here we just walk it and
    // accept while budget allows.
    const placed: DeckEntry[] = [];
    let runningTotal = 0;
    const slotsTarget = tierInfo.deck_size;

    // Pin must_include first — these are user intent and override budget.
    const mustIncludeLowerSet = new Set(mustInclude.map((m) => m.toLowerCase()));
    for (const m of mustInclude) {
      const lower = m.toLowerCase();
      const resolved = priceByLower.get(lower);
      placed.push({
        card_name: m,
        quantity: 1,
        category: "Pinned",
        price_usd: resolved?.price ?? null,
        source: "must_include",
        game_changer: allGameChangers.has(lower),
        reserved: resolved?.reserved ?? false,
      });
      if (resolved?.price != null) runningTotal += resolved.price;
    }

    for (const c of filtered) {
      if (placed.length >= slotsTarget) break;
      const lower = c.card_name.toLowerCase();
      if (mustIncludeLowerSet.has(lower)) continue; // already pinned
      const resolved = priceByLower.get(lower);
      const price = resolved?.price ?? null;
      const cost = (price ?? 0) * c.quantity;

      if (effectiveCap !== undefined && price != null) {
        if (runningTotal + cost > effectiveCap) {
          dropped.push({ card_name: c.card_name, reason: "would_exceed_budget" });
          continue;
        }
      }
      placed.push({
        card_name: c.card_name,
        quantity: c.quantity,
        category: c.category,
        price_usd: price,
        source: "tier",
        game_changer: allGameChangers.has(lower),
        reserved: resolved?.reserved ?? false,
      });
      runningTotal += cost;
    }

    // Mana base re-allocation: cap land spend at 40% of max_price by
    // swapping the most-expensive lands for basics in the commander's
    // color identity. Heuristic — works well for budget tier where the
    // tier average's land list still includes shocks/duals that bust the
    // cap on small budgets.
    const colorIdentity = safeParseJSON<string[]>(commanderRow.color_identity, []);
    const manaBaseSubs: { out: string; in: string; saved: number }[] = [];
    if (maxPrice !== undefined && colorIdentity.length > 0) {
      const landCap = maxPrice * 0.4;
      const reallocResult = reallocateManaBase(placed, colorIdentity, landCap);
      manaBaseSubs.push(...reallocResult.substitutions);
      runningTotal -= reallocResult.savings;
    }

    runningTotal = Math.round(runningTotal * 100) / 100;
    const slotsRemaining = Math.max(0, slotsTarget - placed.length);

    // Warnings.
    const warnings: string[] = [];
    if (maxPrice !== undefined && maxPrice < tierInfo.avg_price) {
      warnings.push(
        `Budget $${maxPrice} is below the empirical floor of the '${tier}' tier ($${tierInfo.avg_price} avg from ${tierInfo.num_decks_avg} decks). Output reflects aggressive cost-cutting beyond what the data supports.`,
      );
    }
    if (slotsRemaining > 0) {
      warnings.push(
        `${slotsRemaining} of ${slotsTarget} slots unfilled. Consider raising the budget or relaxing exclude_game_changers.`,
      );
    }
    const droppedSingle = dropped.filter((d) => d.reason === "single_card_too_expensive");
    if (droppedSingle.length > 0) {
      warnings.push(
        `${droppedSingle.length} cards skipped because their per-card price would exceed half the budget: ${droppedSingle.map((d) => d.card_name).join(", ")}.`,
      );
    }
    const cardsWithoutPrices = placed
      .filter((p) => p.price_usd == null)
      .map((p) => p.card_name);
    if (cardsWithoutPrices.length > 0) {
      warnings.push(
        `${cardsWithoutPrices.length} cards have no known price — total_price excludes them.`,
      );
    }

    // Category breakdown.
    const categoryBreakdown: Record<string, number> = {};
    for (const p of placed) {
      categoryBreakdown[p.category] = (categoryBreakdown[p.category] ?? 0) + 1;
    }

    runningTotal = Math.round(runningTotal * 100) / 100;

    if (manaBaseSubs.length > 0) {
      warnings.push(
        `Mana base re-allocated to fit budget: ${manaBaseSubs.length} expensive lands swapped for ${manaBaseSubs[0]!.in}.`,
      );
    }

    // priced_at is already aggregated from the price-resolution step.
    const pricedAt = priceLookup.pricedAt;

    return {
      type: "structured",
      data: {
        commander: {
          name: commanderRow.name,
          slug: commanderRow.slug,
          color_identity: colorIdentity,
          tier_used: tier,
        },
        tier_info: {
          tier: tierInfo.tier,
          avg_price: tierInfo.avg_price,
          num_decks_avg: tierInfo.num_decks_avg,
          deck_size: tierInfo.deck_size,
          data_confidence: dataConfidence(tierInfo.num_decks_avg),
        },
        budget: {
          max_price: maxPrice ?? null,
          mode: budgetMode,
          total_price: runningTotal,
          remaining: maxPrice !== undefined ? Math.round((maxPrice - runningTotal) * 100) / 100 : null,
        },
        deck: placed,
        category_breakdown: categoryBreakdown,
        slots_remaining: slotsRemaining,
        cards_without_prices: cardsWithoutPrices,
        mana_base_substitutions: manaBaseSubs,
        warnings,
        attribution: {
          source: "EDHREC",
          priced_at: pricedAt,
          note: `Mirrors EDHREC's '${tier}'-tier average decklist for ${commanderRow.name}. Prices from EDHREC TCGPlayer mid (Scryfall fallback).`,
        },
      },
    };
  },
};

/**
 * runPreconBuild handles starting_point='precon:auto' and 'precon:<slug>'.
 * Loads the precon decklist as the foundation, charges MSRP to the budget,
 * walks the cardstoadd / landstoadd pool to fill remaining budget with
 * upgrades. Cuts from cardstocut are returned in the diagnostic block but
 * not removed from `placed` — the user is choosing to keep the precon
 * intact and add to it (the canonical "buy precon + $60 of singles" path).
 */
async function runPreconBuild(
  env: Env,
  commanderRow: { scryfall_id: string; name: string; slug: string; color_identity: string },
  startingPoint: string,
  opts: {
    maxPrice: number | undefined;
    excludes: Set<string>;
    mustInclude: string[];
    budgetMode: "ceiling" | "target";
  },
): Promise<ReferenceResult> {
  const { maxPrice, excludes, mustInclude, budgetMode } = opts;
  const effectiveCap =
    maxPrice !== undefined
      ? budgetMode === "target"
        ? maxPrice * 1.1
        : maxPrice
      : undefined;

  // Resolve precon: explicit slug or auto-pick most-popular MSRP'd precon.
  let preconRow: PreconRow | undefined;
  if (startingPoint === "precon:auto") {
    const result = await env.DB
      .prepare(
        `SELECT p.slug, p.name, p.msrp_usd, p.set_code, p.release_year
         FROM magic_edh_precons p
         JOIN magic_edh_precon_commanders pc
           ON pc.precon_slug = p.slug AND pc.commander_name = ? AND pc.is_face = 1
         WHERE p.msrp_usd IS NOT NULL
         ORDER BY pc.deck_count DESC
         LIMIT 1`,
      )
      .bind(commanderRow.name)
      .all<PreconRow>();
    preconRow = result.results?.[0];
    if (!preconRow) {
      return {
        type: "text",
        content: `No MSRP'd precon found with ${commanderRow.name} as the face commander. Try starting_point='empty' to build from scratch, or starting_point='precon:<slug>' if you know a specific precon slug.`,
      };
    }
  } else {
    const slug = startingPoint.slice("precon:".length).trim();
    if (!slug) {
      return {
        type: "text",
        content: `Invalid starting_point: "${startingPoint}". Use 'empty', 'precon:auto', or 'precon:<slug>'.`,
      };
    }
    const result = await env.DB
      .prepare(
        `SELECT slug, name, msrp_usd, set_code, release_year
         FROM magic_edh_precons WHERE slug = ?`,
      )
      .bind(slug)
      .all<PreconRow>();
    preconRow = result.results?.[0];
    if (!preconRow) {
      return {
        type: "text",
        content: `Precon not found: "${slug}". Use precon_lookup to discover valid slugs.`,
      };
    }
  }

  const msrp = preconRow.msrp_usd;
  if (msrp == null) {
    return {
      type: "text",
      content: `Precon '${preconRow.slug}' has no MSRP in our catalog, so we can't budget against it. Use commander_deckbuild with starting_point='empty' instead, or pull the decklist via precon_lookup.`,
    };
  }
  if (maxPrice !== undefined && maxPrice < msrp) {
    return {
      type: "text",
      content: `Budget $${maxPrice} is below the precon's MSRP ($${msrp}). Raise the budget to at least $${msrp}, or use starting_point='empty' to build at the budget tier without the precon.`,
    };
  }

  // Fetch decklist + upgrade pool.
  const [deckResult, upgradesResult] = await Promise.all([
    env.DB
      .prepare(
        `SELECT card_name, quantity, category
         FROM magic_edh_precon_decks
         WHERE precon_slug = ?`,
      )
      .bind(preconRow.slug)
      .all<PreconDeckRow>(),
    env.DB
      .prepare(
        `SELECT card_name, action, inclusion
         FROM magic_edh_precon_upgrades
         WHERE precon_slug = ? AND action IN ('add', 'land_add')
         ORDER BY inclusion DESC`,
      )
      .bind(preconRow.slug)
      .all<PreconUpgradeRow>(),
  ]);

  const preconDeck = deckResult.results ?? [];
  const upgrades = upgradesResult.results ?? [];

  // Game changers (always look up for output flagging).
  const gcResult = await env.DB
    .prepare(`SELECT card_name FROM magic_game_changers`)
    .all<{ card_name: string }>();
  const allGameChangers = new Set(
    (gcResult.results ?? []).map((r) => r.card_name.toLowerCase()),
  );

  // Resolve prices for upgrades + must_include. Precon contents don't need
  // individual prices since they're rolled into MSRP.
  const priceNames = new Set<string>();
  for (const u of upgrades) priceNames.add(u.card_name);
  for (const m of mustInclude) priceNames.add(m);
  const priceLookup = await resolveCardPrices(env, [...priceNames]);
  const priceByLower = priceLookup.prices;

  // Seed placed[] from the precon decklist. The precon contents charge MSRP
  // collectively; per-card price_usd stays null so the LLM can see they
  // came from the box rather than singles.
  const placed: DeckEntry[] = [];
  const placedNames = new Set<string>();
  for (const c of preconDeck) {
    const lower = c.card_name.toLowerCase();
    if (excludes.has(lower)) continue; // user opted out
    const resolved = priceByLower.get(lower);
    placed.push({
      card_name: c.card_name,
      quantity: c.quantity,
      category: c.category,
      price_usd: null,
      source: "precon",
      game_changer: allGameChangers.has(lower),
      reserved: resolved?.reserved ?? false,
    });
    placedNames.add(lower);
  }

  let runningTotal = msrp;

  // Pin must_include cards (override budget — explicit user intent).
  for (const m of mustInclude) {
    const lower = m.toLowerCase();
    if (placedNames.has(lower)) continue; // already in precon
    const resolved = priceByLower.get(lower);
    placed.push({
      card_name: m,
      quantity: 1,
      category: "Pinned",
      price_usd: resolved?.price ?? null,
      source: "must_include",
      game_changer: allGameChangers.has(lower),
      reserved: resolved?.reserved ?? false,
    });
    placedNames.add(lower);
    if (resolved?.price != null) runningTotal += resolved.price;
  }

  // Walk upgrade pool in inclusion-DESC order. Add while budget allows.
  for (const u of upgrades) {
    const lower = u.card_name.toLowerCase();
    if (placedNames.has(lower)) continue; // dedupe vs precon + must_include
    if (excludes.has(lower)) continue;
    const resolved = priceByLower.get(lower);
    const price = resolved?.price ?? null;
    if (price == null) continue; // can't certify under budget
    if (effectiveCap !== undefined && runningTotal + price > effectiveCap) continue;
    placed.push({
      card_name: u.card_name,
      quantity: 1,
      category: u.action === "land_add" ? "Land" : "Upgrade",
      price_usd: price,
      source: "upgrade",
      game_changer: allGameChangers.has(lower),
      reserved: resolved?.reserved ?? false,
    });
    placedNames.add(lower);
    runningTotal += price;
  }

  runningTotal = Math.round(runningTotal * 100) / 100;

  const warnings: string[] = [];
  const cardsWithoutPrices = placed
    .filter((p) => p.source !== "precon" && p.price_usd == null)
    .map((p) => p.card_name);
  if (cardsWithoutPrices.length > 0) {
    warnings.push(
      `${cardsWithoutPrices.length} non-precon cards have no known price — total_price excludes them.`,
    );
  }

  const categoryBreakdown: Record<string, number> = {};
  for (const p of placed) {
    categoryBreakdown[p.category] = (categoryBreakdown[p.category] ?? 0) + 1;
  }

  return {
    type: "structured",
    data: {
      commander: {
        name: commanderRow.name,
        slug: commanderRow.slug,
        color_identity: safeParseJSON<string[]>(commanderRow.color_identity, []),
        tier_used: null, // precon path doesn't use tier average
      },
      precon: {
        slug: preconRow.slug,
        name: preconRow.name,
        msrp_usd: preconRow.msrp_usd,
        set_code: preconRow.set_code,
        release_year: preconRow.release_year,
      },
      budget: {
        max_price: maxPrice ?? null,
        mode: budgetMode,
        total_price: runningTotal,
        precon_msrp: msrp,
        upgrade_spend: Math.round((runningTotal - msrp) * 100) / 100,
        remaining: maxPrice !== undefined ? Math.round((maxPrice - runningTotal) * 100) / 100 : null,
      },
      deck: placed,
      category_breakdown: categoryBreakdown,
      cards_without_prices: cardsWithoutPrices,
      warnings,
      attribution: {
        source: "EDHREC",
        priced_at: priceLookup.pricedAt,
        note: `Precon '${preconRow.slug}' seeds the deck (charged at MSRP $${msrp}). Upgrades drawn from EDHREC's cardstoadd / landstoadd pool, sorted by inclusion. Singles prices via EDHREC TCGPlayer mid (Scryfall fallback).`,
      },
    },
  };
}

interface ThemeMetaRow {
  theme_slug: string;
  theme_value: string;
  avg_price: number;
  num_decks_avg: number;
  deck_size: number;
}

interface ThemeDeckRow {
  card_name: string;
  quantity: number;
  category: string;
}

/**
 * runThemeBuild handles the `theme` parameter. Mirrors the theme-specific
 * average decklist instead of the cross-theme tier average. Greedy fill +
 * filters apply the same as the empty-path build, but the deck rows come
 * from magic_edh_average_decks_by_theme rather than magic_edh_average_decks_by_tier.
 */
async function runThemeBuild(
  env: Env,
  commanderRow: { scryfall_id: string; name: string; slug: string; color_identity: string },
  theme: string,
  opts: {
    maxPrice: number | undefined;
    excludes: Set<string>;
    mustInclude: string[];
    budgetMode: "ceiling" | "target";
    excludeGameChangers: boolean;
  },
): Promise<ReferenceResult> {
  const { maxPrice, excludes, mustInclude, budgetMode, excludeGameChangers } = opts;
  const commanderId = commanderRow.scryfall_id;
  const effectiveCap =
    maxPrice !== undefined
      ? budgetMode === "target"
        ? maxPrice * 1.1
        : maxPrice
      : undefined;

  const [themeMetaResult, themeDeckResult, gcResult] = await Promise.all([
    env.DB
      .prepare(
        `SELECT theme_slug, theme_value, avg_price, num_decks_avg, deck_size
         FROM magic_edh_commander_theme_meta
         WHERE commander_id = ? AND theme_slug = ?`,
      )
      .bind(commanderId, theme)
      .all<ThemeMetaRow>(),
    env.DB
      .prepare(
        `SELECT card_name, quantity, category
         FROM magic_edh_average_decks_by_theme
         WHERE commander_id = ? AND theme_slug = ?`,
      )
      .bind(commanderId, theme)
      .all<ThemeDeckRow>(),
    env.DB
      .prepare(`SELECT card_name FROM magic_game_changers`)
      .all<{ card_name: string }>(),
  ]);

  const themeInfo = themeMetaResult.results?.[0];
  const themeDeck = themeDeckResult.results ?? [];

  if (!themeInfo || themeDeck.length === 0) {
    return {
      type: "text",
      content: `No theme data for ${commanderRow.name} with theme='${theme}'. EDHREC may not have indexed this theme on this commander, or the theme slug is wrong (try slugs like 'infect', 'tokens', '+1-1-counters'). Use commander_lookup to see this commander's known themes.`,
    };
  }

  const allGameChangers = new Set(
    (gcResult.results ?? []).map((r) => r.card_name.toLowerCase()),
  );
  const gameChangerSet = excludeGameChangers ? allGameChangers : new Set<string>();

  const allNames = new Set<string>();
  for (const c of themeDeck) allNames.add(c.card_name);
  for (const m of mustInclude) allNames.add(m);
  const priceLookup = await resolveCardPrices(env, [...allNames]);
  const priceByLower = priceLookup.prices;

  const placed: DeckEntry[] = [];
  let runningTotal = 0;
  const slotsTarget = themeInfo.deck_size;
  const dropped: { card_name: string; reason: string }[] = [];

  // Pin must_include first.
  const mustIncludeLowerSet = new Set(mustInclude.map((m) => m.toLowerCase()));
  for (const m of mustInclude) {
    const lower = m.toLowerCase();
    const resolved = priceByLower.get(lower);
    placed.push({
      card_name: m,
      quantity: 1,
      category: "Pinned",
      price_usd: resolved?.price ?? null,
      source: "must_include",
      game_changer: allGameChangers.has(lower),
      reserved: resolved?.reserved ?? false,
    });
    if (resolved?.price != null) runningTotal += resolved.price;
  }

  // Walk theme deck.
  for (const c of themeDeck) {
    if (placed.length >= slotsTarget) break;
    const lower = c.card_name.toLowerCase();
    if (mustIncludeLowerSet.has(lower)) continue;
    if (excludes.has(lower)) {
      dropped.push({ card_name: c.card_name, reason: "excludes" });
      continue;
    }
    if (gameChangerSet.has(lower)) {
      dropped.push({ card_name: c.card_name, reason: "game_changer" });
      continue;
    }
    const resolved = priceByLower.get(lower);
    const price = resolved?.price ?? null;
    const cost = (price ?? 0) * c.quantity;
    if (effectiveCap !== undefined && price != null && runningTotal + cost > effectiveCap) {
      dropped.push({ card_name: c.card_name, reason: "would_exceed_budget" });
      continue;
    }
    placed.push({
      card_name: c.card_name,
      quantity: c.quantity,
      category: c.category,
      price_usd: price,
      source: "tier",
      game_changer: allGameChangers.has(lower),
      reserved: resolved?.reserved ?? false,
    });
    runningTotal += cost;
  }

  runningTotal = Math.round(runningTotal * 100) / 100;
  const slotsRemaining = Math.max(0, slotsTarget - placed.length);

  const warnings: string[] = [];
  if (maxPrice !== undefined && maxPrice < themeInfo.avg_price) {
    warnings.push(
      `Budget $${maxPrice} is below the empirical floor of the '${theme}' theme on ${commanderRow.name} ($${themeInfo.avg_price} avg from ${themeInfo.num_decks_avg} decks). Output reflects aggressive cost-cutting.`,
    );
  }
  if (slotsRemaining > 0) {
    warnings.push(
      `${slotsRemaining} of ${slotsTarget} slots unfilled. Consider raising the budget or relaxing exclude_game_changers.`,
    );
  }
  const cardsWithoutPrices = placed
    .filter((p) => p.price_usd == null)
    .map((p) => p.card_name);
  if (cardsWithoutPrices.length > 0) {
    warnings.push(
      `${cardsWithoutPrices.length} cards have no known price — total_price excludes them.`,
    );
  }

  const categoryBreakdown: Record<string, number> = {};
  for (const p of placed) {
    categoryBreakdown[p.category] = (categoryBreakdown[p.category] ?? 0) + 1;
  }

  return {
    type: "structured",
    data: {
      commander: {
        name: commanderRow.name,
        slug: commanderRow.slug,
        color_identity: safeParseJSON<string[]>(commanderRow.color_identity, []),
        tier_used: null,
      },
      theme_info: {
        theme_slug: themeInfo.theme_slug,
        theme_value: themeInfo.theme_value,
        avg_price: themeInfo.avg_price,
        num_decks_avg: themeInfo.num_decks_avg,
        deck_size: themeInfo.deck_size,
        data_confidence: dataConfidence(themeInfo.num_decks_avg),
      },
      budget: {
        max_price: maxPrice ?? null,
        mode: budgetMode,
        total_price: runningTotal,
        remaining: maxPrice !== undefined ? Math.round((maxPrice - runningTotal) * 100) / 100 : null,
      },
      deck: placed,
      category_breakdown: categoryBreakdown,
      slots_remaining: slotsRemaining,
      cards_without_prices: cardsWithoutPrices,
      warnings,
      attribution: {
        source: "EDHREC",
        priced_at: priceLookup.pricedAt,
        note: `Mirrors EDHREC's ${themeInfo.theme_value} theme decklist for ${commanderRow.name} ($${themeInfo.avg_price} avg from ${themeInfo.num_decks_avg} decks).`,
      },
    },
  };
}

/**
 * reallocateManaBase enforces a soft cap on land spend. When the placed
 * deck's land subtotal exceeds `landCap`, swap the most-expensive lands
 * for basics in the commander's color identity until the cap is met.
 *
 * Two-stage strategy: prefer to bump the quantity on an existing basic
 * (so the deck contains "12 Forest" instead of "11 Forest + 1 Plains" if
 * G is in identity but the existing basic is Plains). When no basic of an
 * appropriate color is in the deck, append a new basic entry.
 *
 * Mutates `placed` in-place. Returns the substitution log + total savings
 * so the caller can subtract from runningTotal.
 */
function reallocateManaBase(
  placed: DeckEntry[],
  colorIdentity: string[],
  landCap: number,
): { substitutions: { out: string; in: string; saved: number }[]; savings: number } {
  // Compute current land subtotal (only counts lands with known prices).
  const subtotal = placed
    .filter((p) => p.category === "Land" && p.price_usd != null)
    .reduce((s, p) => s + (p.price_usd ?? 0) * p.quantity, 0);
  if (subtotal <= landCap) return { substitutions: [], savings: 0 };

  // Sort lands by price DESC; we'll swap the costliest ones first.
  const lands = placed
    .map((p, i) => ({ entry: p, index: i }))
    .filter(({ entry }) => entry.category === "Land")
    .sort((a, b) => (b.entry.price_usd ?? 0) - (a.entry.price_usd ?? 0));

  const subs: { out: string; in: string; saved: number }[] = [];
  let savings = 0;
  let remaining = subtotal;

  // Pick the basic to substitute. Prefer one in commander's color identity;
  // fall back to a colorless wasteland if no colors (shouldn't happen for
  // EDH commanders but defensive).
  const preferredBasic =
    colorIdentity.find((c) => COLOR_TO_BASIC[c]) !== undefined
      ? COLOR_TO_BASIC[colorIdentity.find((c) => COLOR_TO_BASIC[c])!]!
      : "Wastes";

  // Indices to splice out at the end. Avoid mutating placed[] during the
  // iteration — sentinel-string approaches collide with cards legitimately
  // named the sentinel value.
  const indicesToRemove = new Set<number>();

  for (const { entry, index } of lands) {
    if (remaining <= landCap) break;
    if (entry.price_usd == null) continue;
    // Skip cards that ARE basics (we'd be swapping a basic for itself).
    const lower = entry.card_name.toLowerCase();
    if (
      lower === "forest" ||
      lower === "island" ||
      lower === "plains" ||
      lower === "mountain" ||
      lower === "swamp" ||
      lower === "wastes"
    )
      continue;

    const saved = entry.price_usd * entry.quantity;
    subs.push({ out: entry.card_name, in: preferredBasic, saved });
    savings += saved;
    remaining -= saved;

    // Replace the entry: bump existing basic if present, else swap in place.
    const existingBasicIdx = placed.findIndex(
      (p) => p.card_name === preferredBasic && p.category === "Land",
    );
    if (existingBasicIdx >= 0) {
      placed[existingBasicIdx]!.quantity += entry.quantity;
      indicesToRemove.add(index);
    } else {
      placed[index] = {
        card_name: preferredBasic,
        quantity: entry.quantity,
        category: "Land",
        price_usd: 0,
        source: "basic_substitution",
        game_changer: false,
        reserved: false,
      };
    }
  }

  // Splice in reverse order so earlier indices stay valid as we shrink.
  const sortedRemove = [...indicesToRemove].sort((a, b) => b - a);
  for (const i of sortedRemove) {
    placed.splice(i, 1);
  }

  return { substitutions: subs, savings: Math.round(savings * 100) / 100 };
}

