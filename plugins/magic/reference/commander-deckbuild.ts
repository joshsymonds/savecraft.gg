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
import { buildAndUpgradeDeck, type CompletionResult } from "./deck-completion";
import {
  assessQuality,
  type DeckEntry as RawDeckEntry,
  type QualityReport,
} from "./deck-quality";

const BASIC_LAND_NAMES = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
]);

/**
 * deriveCategory infers a category label from a Scryfall type_line string.
 * Used to populate the structured output's per-card `category` field
 * after buildAndUpgradeDeck (which doesn't track categories).
 */
function deriveCategory(cardName: string, typeLine: string): string {
  if (BASIC_LAND_NAMES.has(cardName)) return "basics";
  const t = typeLine.toLowerCase();
  if (t.includes("land")) return "Land";
  if (t.includes("creature")) return "Creature";
  if (t.includes("planeswalker")) return "Planeswalker";
  if (t.includes("battle")) return "Battle";
  if (t.includes("artifact")) return "Artifact";
  if (t.includes("enchantment")) return "Enchantment";
  if (t.includes("sorcery")) return "Sorcery";
  if (t.includes("instant")) return "Instant";
  return "Other";
}

interface typeLineRow {
  front_face_name: string;
  type_line: string;
}

async function loadTypeLines(
  env: Env,
  names: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (names.length === 0) return out;
  const unique = [...new Set(names.map((n) => n.toLowerCase()))];
  const CHUNK = 90;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `SELECT front_face_name, type_line FROM magic_cards
         WHERE LOWER(front_face_name) IN (${placeholders})
           AND is_default = 1 AND type_line != 'Card // Card'`,
    )
      .bind(...slice)
      .all<typeLineRow>();
    for (const row of result.results ?? []) {
      out.set(row.front_face_name.toLowerCase(), row.type_line ?? "");
    }
  }
  return out;
}

const VALID_TIERS = ["budget", "upgraded", "optimized", "cedh"] as const;
type Tier = (typeof VALID_TIERS)[number];

interface TierInfoRow {
  tier: Tier;
  avg_price: number;
  num_decks_avg: number;
  deck_size: number;
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
      description:
        "USD budget ceiling. Determines auto-picked tier and caps single-card and total deck cost.",
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
    verbosity: {
      type: "string",
      description:
        "Output detail level. 'summary' (default) trims redundant fields — composition.X.cards arrays are omitted (names already in deck), completion.added_from_recommendations is truncated to top 10 with +N more indicator, default-false flags (game_changer, reserved) are stripped. 'full' returns every field for debugging or UIs that consume the full breakdown.",
    },
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const verbosity = parseVerbosity(query);
    const commanderQuery = ((query.commander as string) ?? "").trim();
    if (!commanderQuery) {
      return { type: "text", content: "Missing required parameter: commander" };
    }

    const maxPrice =
      typeof query.max_price === "number" ? query.max_price : undefined;

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
    const mustInclude = (
      Array.isArray(query.must_include) ? (query.must_include as string[]) : []
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
        verbosity,
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
        verbosity,
      });
    }

    // Load tier metadata for warnings layer (data confidence + budget-vs-
    // tier-floor warning). With the marginal-utility pipeline the tier deck
    // itself is no longer the baseline — buildMinimalShell handles that —
    // but tier_info is still surfaced for context.
    const tierInfoResult = await env.DB.prepare(
      `SELECT tier, avg_price, num_decks_avg, deck_size
         FROM magic_edh_commander_tiers
         WHERE commander_id = ? AND tier = ?`,
    )
      .bind(commanderId, tier)
      .all<TierInfoRow>();
    const tierInfo = tierInfoResult.results?.[0];

    if (!tierInfo) {
      return {
        type: "text",
        content: `No tier metadata for ${commanderRow.name} at tier='${tier}'. EDHREC may not have indexed this tier yet for this commander. Try a different tier or omit the parameter.`,
      };
    }

    // Always look up game changers for output flagging.
    const allGameChangersResult = await env.DB.prepare(
      `SELECT card_name FROM magic_game_changers`,
    ).all<{ card_name: string }>();
    const allGameChangers = new Set(
      (allGameChangersResult.results ?? []).map((r) =>
        r.card_name.toLowerCase(),
      ),
    );

    const colorIdentity = safeParseJSON<string[]>(
      commanderRow.color_identity,
      [],
    );
    const commanderRef = { scryfall_id: commanderId, name: commanderRow.name };

    // Run the marginal-utility pipeline: minimal-shell baseline → upgrade
    // loop → Karsten validation. Always returns 100 cards.
    const buildResult = await buildAndUpgradeDeck(env, commanderRef, {
      budget: effectiveCap ?? Number.MAX_SAFE_INTEGER,
      excludes: [...excludes],
      excludeGameChangers,
      mustInclude,
    });

    // Resolve prices + type lines for everything in the resulting deck so we
    // can build the structured output schema (categories, GC flags, etc.).
    const deckNames = buildResult.deck.map((entry) => entry.card_name);
    const [priceLookup, typeLines] = await Promise.all([
      resolveCardPrices(env, deckNames),
      loadTypeLines(env, deckNames),
    ]);
    const priceByLower = priceLookup.prices;

    // Map BuildResult.deck → DeckEntry[] (the structured output's `placed`).
    // Exclude the commander (it's surfaced separately in `data.commander`).
    const commanderLower = commanderRow.name.toLowerCase();
    const mustIncludeLowerSet = new Set(
      mustInclude.map((m) => m.toLowerCase()),
    );
    const upgradeInLower = new Set(
      buildResult.steps.flatMap((step) => step.in_).map((n) => n.toLowerCase()),
    );

    const placed: DeckEntry[] = [];
    for (const entry of buildResult.deck) {
      const lower = entry.card_name.toLowerCase();
      if (lower === commanderLower) continue;
      const isBasic = BASIC_LAND_NAMES.has(entry.card_name);
      const resolved = priceByLower.get(lower);
      const typeLine = typeLines.get(lower) ?? "";

      let source: DeckEntry["source"] = "tier";
      if (mustIncludeLowerSet.has(lower)) source = "must_include";
      else if (isBasic) source = "basic_substitution";
      else if (upgradeInLower.has(lower)) source = "upgrade";

      placed.push({
        card_name: entry.card_name,
        quantity: entry.quantity ?? 1,
        category: deriveCategory(entry.card_name, typeLine),
        price_usd: isBasic ? 0 : (resolved?.price ?? null),
        source,
        game_changer: allGameChangers.has(lower),
        reserved: resolved?.reserved ?? false,
      });
    }

    const runningTotal = Math.round(buildResult.totalCost * 100) / 100;
    const totalCount = placed.reduce((s, p) => s + p.quantity, 0);
    const slotsRemaining = Math.max(0, 99 - totalCount);

    // Reconstruct the `completion` block from BuildResult for back-compat:
    // upgrade-introduced cards become `added_from_recommendations`; basic
    // lands in the deck become `added_basics`; Karsten warnings filter out
    // from the aggregated warnings list.
    const completion: CompletionResult = {
      filled: [],
      added_from_recommendations: buildResult.steps.flatMap((step) =>
        step.in_.map((name) => ({
          card_name: name,
          reason: "high_inclusion_fill" as const,
          inclusion: undefined,
          price: priceByLower.get(name.toLowerCase())?.price ?? null,
        })),
      ),
      added_basics: placed
        .filter((p) => BASIC_LAND_NAMES.has(p.card_name))
        .map((p) => ({ name: p.card_name, quantity: p.quantity })),
      karsten_swaps: [],
      warnings: buildResult.warnings.filter((w) =>
        w.includes("Mana base thin"),
      ),
    };

    // Strategic warnings (combo casualties from `dropped`) no longer apply —
    // the new pipeline doesn't track per-card budget rejection. Pass empty
    // to preserve the helper signature; warnings list won't be augmented.
    const dropped: { card_name: string; reason: string }[] = [];

    // M3.2-style strategic warning placeholder (intentionally empty).
    const manaBaseSubs: { out: string; in: string; saved: number }[] = [];

    // Warnings.
    const warnings: string[] = [];
    if (maxPrice !== undefined && maxPrice < tierInfo.avg_price) {
      warnings.push(
        `Budget $${maxPrice} is below the empirical floor of the '${tier}' tier ($${tierInfo.avg_price} avg from ${tierInfo.num_decks_avg} decks). Output reflects aggressive cost-cutting beyond what the data supports.`,
      );
    }
    // slots_remaining is always 0 with the new pipeline (deck always 100
    // cards), but keep the warning shape if a future pipeline change leaves
    // it unfilled.
    if (slotsRemaining > 0) {
      warnings.push(
        `${slotsRemaining} of 99 slots unfilled. Consider raising the budget or relaxing exclude_game_changers.`,
      );
    }
    // BuildResult.warnings already contains baseline + upgrade + Karsten
    // diagnostics. Surface them in the user-facing list.
    for (const warning of buildResult.warnings) {
      // Karsten warnings are already echoed in completion.karsten_warnings;
      // skip them here to avoid duplicate output.
      if (warning.includes("Mana base thin")) continue;
      warnings.push(warning);
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

    // M3.2: surface combo / win-condition casualties from budget cuts.
    warnings.push(
      ...(await buildStrategicWarnings(env, commanderId, placed, dropped)),
    );

    // M4: assess quality on the completed 99-card deck.
    const quality: QualityReport = await assessQuality(
      env,
      placed.map((p) => ({ card_name: p.card_name, quantity: p.quantity })),
      commanderRef,
      tier,
    );

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
          remaining:
            maxPrice !== undefined
              ? Math.round((maxPrice - runningTotal) * 100) / 100
              : null,
        },
        deck: placed.map(trimDeckEntry),
        category_breakdown: categoryBreakdown,
        slots_remaining: slotsRemaining,
        ...(cardsWithoutPrices.length > 0
          ? { cards_without_prices: cardsWithoutPrices }
          : {}),
        ...(manaBaseSubs.length > 0
          ? { mana_base_substitutions: manaBaseSubs }
          : {}),
        quality: trimQuality(quality, verbosity),
        completion: trimCompletion(
          {
            added_from_recommendations: completion.added_from_recommendations,
            added_basics: completion.added_basics,
            karsten_warnings: completion.warnings,
          },
          verbosity,
        ),
        warnings,
        attribution: {
          source: "EDHREC",
          priced_at: pricedAt,
          note: `Mirrors EDHREC's '${tier}'-tier average decklist for ${commanderRow.name}, padded to 99 cards via completion (high-inclusion recommendations + Karsten-aware basic distribution). Prices from EDHREC TCGPlayer mid (Scryfall fallback).`,
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
  commanderRow: {
    scryfall_id: string;
    name: string;
    slug: string;
    color_identity: string;
  },
  startingPoint: string,
  opts: {
    maxPrice: number | undefined;
    excludes: Set<string>;
    mustInclude: string[];
    budgetMode: "ceiling" | "target";
    verbosity: Verbosity;
  },
): Promise<ReferenceResult> {
  const { maxPrice, excludes, mustInclude, budgetMode, verbosity } = opts;
  const effectiveCap =
    maxPrice !== undefined
      ? budgetMode === "target"
        ? maxPrice * 1.1
        : maxPrice
      : undefined;

  // Resolve precon: explicit slug or auto-pick most-popular MSRP'd precon.
  let preconRow: PreconRow | undefined;
  if (startingPoint === "precon:auto") {
    const result = await env.DB.prepare(
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
    const result = await env.DB.prepare(
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

  // Fetch decklist (upgrade pool no longer used — replaced by upgradeDeck's
  // marginal-utility loop pulling from magic_edh_recommendations).
  const deckResult = await env.DB.prepare(
    `SELECT card_name, quantity, category
       FROM magic_edh_precon_decks
       WHERE precon_slug = ?`,
  )
    .bind(preconRow.slug)
    .all<PreconDeckRow>();
  const preconDeck = deckResult.results ?? [];

  if (preconDeck.length === 0) {
    return {
      type: "text",
      content: `Precon '${preconRow.slug}' has no decklist in our catalog. Try a different precon, or use starting_point='empty'.`,
    };
  }

  const preconCommanderRef = {
    scryfall_id: commanderRow.scryfall_id,
    name: commanderRow.name,
  };
  const preconLowerSet = new Set(
    preconDeck.map((c) => c.card_name.toLowerCase()),
  );

  // Build the precon DeckEntry list for the orchestrator. Filter excludes
  // upfront so the upgrade loop doesn't re-introduce them. Add commander.
  const preconEntries: RawDeckEntry[] = [
    { card_name: commanderRow.name, quantity: 1 },
    ...preconDeck
      .filter((c) => !excludes.has(c.card_name.toLowerCase()))
      .map((c) => ({ card_name: c.card_name, quantity: c.quantity })),
  ];

  // Run the marginal-utility pipeline. Pass spent=msrp so the upgrade loop
  // budgets against (budget − MSRP), not (budget − sum-of-precon-singles).
  // excludeGameChangers stays false: precons themselves can include GC cards
  // (Sol Ring is bracket-1 legal); mirror the prior policy.
  const buildResult = await buildAndUpgradeDeck(env, preconCommanderRef, {
    budget: effectiveCap ?? Number.MAX_SAFE_INTEGER,
    precon: preconEntries,
    spent: msrp,
    excludes: [...excludes],
    excludeGameChangers: false,
    mustInclude,
  });

  // Resolve prices + type lines for the resulting deck.
  const deckNames = buildResult.deck.map((entry) => entry.card_name);
  const [priceLookup, typeLines, gcResult] = await Promise.all([
    resolveCardPrices(env, deckNames),
    loadTypeLines(env, deckNames),
    env.DB.prepare(`SELECT card_name FROM magic_game_changers`).all<{
      card_name: string;
    }>(),
  ]);
  const priceByLower = priceLookup.prices;
  const allGameChangers = new Set(
    (gcResult.results ?? []).map((r) => r.card_name.toLowerCase()),
  );

  const commanderLower = commanderRow.name.toLowerCase();
  const mustIncludeLowerSet = new Set(mustInclude.map((m) => m.toLowerCase()));
  const upgradeInLower = new Set(
    buildResult.steps.flatMap((step) => step.in_).map((n) => n.toLowerCase()),
  );

  // Map BuildResult.deck → DeckEntry[]. Source rules:
  //   - mustInclude  → "must_include"
  //   - in precon    → "precon" (price_usd null, rolled into MSRP)
  //   - basic land   → "basic_substitution"
  //   - upgrade.in_  → "upgrade"
  //   - else         → "precon" (basics added by orchestrator's pad-to-100)
  const placed: DeckEntry[] = [];
  for (const entry of buildResult.deck) {
    const lower = entry.card_name.toLowerCase();
    if (lower === commanderLower) continue;
    const isBasic = BASIC_LAND_NAMES.has(entry.card_name);
    const fromPrecon = preconLowerSet.has(lower);
    const resolved = priceByLower.get(lower);
    const typeLine = typeLines.get(lower) ?? "";

    let source: DeckEntry["source"];
    let priceUsd: number | null;
    if (mustIncludeLowerSet.has(lower)) {
      source = "must_include";
      priceUsd = resolved?.price ?? null;
    } else if (fromPrecon) {
      source = "precon";
      priceUsd = null; // rolled into MSRP
    } else if (isBasic) {
      source = "basic_substitution";
      priceUsd = 0;
    } else if (upgradeInLower.has(lower)) {
      source = "upgrade";
      priceUsd = resolved?.price ?? null;
    } else {
      // Fallback — orchestrator-added card not in precon, not a basic, not
      // an upgrade. Treat as precon (rare).
      source = "precon";
      priceUsd = null;
    }

    placed.push({
      card_name: entry.card_name,
      quantity: entry.quantity ?? 1,
      category: deriveCategory(entry.card_name, typeLine),
      price_usd: priceUsd,
      source,
      game_changer: allGameChangers.has(lower),
      reserved: resolved?.reserved ?? false,
    });
  }

  const runningTotal = Math.round(buildResult.totalCost * 100) / 100;
  const upgradeSpend = Math.round((runningTotal - msrp) * 100) / 100;

  // Reconstruct the `completion` block from BuildResult for back-compat.
  const preconCompletion: CompletionResult = {
    filled: [],
    added_from_recommendations: buildResult.steps.flatMap((step) =>
      step.in_.map((name) => ({
        card_name: name,
        reason: "high_inclusion_fill" as const,
        inclusion: undefined,
        price: priceByLower.get(name.toLowerCase())?.price ?? null,
      })),
    ),
    added_basics: placed
      .filter((p) => BASIC_LAND_NAMES.has(p.card_name))
      .map((p) => ({ name: p.card_name, quantity: p.quantity })),
    karsten_swaps: [],
    warnings: buildResult.warnings.filter((w) => w.includes("Mana base thin")),
  };

  const warnings: string[] = [];
  for (const warning of buildResult.warnings) {
    if (warning.includes("Mana base thin")) continue;
    warnings.push(warning);
  }
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

  const preconQuality: QualityReport = await assessQuality(
    env,
    placed.map((p) => ({ card_name: p.card_name, quantity: p.quantity })),
    preconCommanderRef,
  );

  return {
    type: "structured",
    data: {
      commander: {
        name: commanderRow.name,
        slug: commanderRow.slug,
        color_identity: safeParseJSON<string[]>(
          commanderRow.color_identity,
          [],
        ),
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
        upgrade_spend: upgradeSpend,
        remaining:
          maxPrice !== undefined
            ? Math.round((maxPrice - runningTotal) * 100) / 100
            : null,
      },
      deck: placed.map(trimDeckEntry),
      category_breakdown: categoryBreakdown,
      ...(cardsWithoutPrices.length > 0
        ? { cards_without_prices: cardsWithoutPrices }
        : {}),
      quality: trimQuality(preconQuality, verbosity),
      completion: trimCompletion(
        {
          added_from_recommendations:
            preconCompletion.added_from_recommendations,
          added_basics: preconCompletion.added_basics,
          karsten_warnings: preconCompletion.warnings,
        },
        verbosity,
      ),
      warnings,
      attribution: {
        source: "EDHREC",
        priced_at: priceLookup.pricedAt,
        note: `Precon '${preconRow.slug}' seeds the deck (charged at MSRP $${msrp}). Upgrades drawn from EDHREC recommendations via marginal-utility hill-climbing. Singles prices via EDHREC TCGPlayer mid (Scryfall fallback).`,
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
  commanderRow: {
    scryfall_id: string;
    name: string;
    slug: string;
    color_identity: string;
  },
  theme: string,
  opts: {
    maxPrice: number | undefined;
    excludes: Set<string>;
    mustInclude: string[];
    budgetMode: "ceiling" | "target";
    excludeGameChangers: boolean;
    verbosity: Verbosity;
  },
): Promise<ReferenceResult> {
  const {
    maxPrice,
    excludes,
    mustInclude,
    budgetMode,
    excludeGameChangers,
    verbosity,
  } = opts;
  const commanderId = commanderRow.scryfall_id;
  const effectiveCap =
    maxPrice !== undefined
      ? budgetMode === "target"
        ? maxPrice * 1.1
        : maxPrice
      : undefined;

  const [themeMetaResult, themeDeckResult, gcResult] = await Promise.all([
    env.DB.prepare(
      `SELECT theme_slug, theme_value, avg_price, num_decks_avg, deck_size
         FROM magic_edh_commander_theme_meta
         WHERE commander_id = ? AND theme_slug = ?`,
    )
      .bind(commanderId, theme)
      .all<ThemeMetaRow>(),
    env.DB.prepare(
      `SELECT card_name, quantity, category
         FROM magic_edh_average_decks_by_theme
         WHERE commander_id = ? AND theme_slug = ?`,
    )
      .bind(commanderId, theme)
      .all<ThemeDeckRow>(),
    env.DB.prepare(`SELECT card_name FROM magic_game_changers`).all<{
      card_name: string;
    }>(),
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

  const themeCommanderRef = {
    scryfall_id: commanderRow.scryfall_id,
    name: commanderRow.name,
  };
  const themeLowerSet = new Set(
    themeDeck.map((c) => c.card_name.toLowerCase()),
  );

  // Build the theme decklist as a precon-style baseline. Filter excludes
  // upfront. Pass to buildAndUpgradeDeck — theme decklists are coherent
  // ~100-card lists, so the precon code-path applies cleanly. Excludes-due-to-
  // GC handled by orchestrator's excludeGameChangers filter (also blocks GCs
  // from upgrade candidates).
  const themeEntries: RawDeckEntry[] = [
    { card_name: commanderRow.name, quantity: 1 },
    ...themeDeck
      .filter((c) => !excludes.has(c.card_name.toLowerCase()))
      .map((c) => ({ card_name: c.card_name, quantity: c.quantity })),
  ];

  const buildResult = await buildAndUpgradeDeck(env, themeCommanderRef, {
    budget: effectiveCap ?? Number.MAX_SAFE_INTEGER,
    precon: themeEntries,
    excludes: [...excludes],
    excludeGameChangers,
    mustInclude,
  });

  // Resolve metadata for output schema.
  const deckNames = buildResult.deck.map((entry) => entry.card_name);
  const [priceLookup, typeLines] = await Promise.all([
    resolveCardPrices(env, deckNames),
    loadTypeLines(env, deckNames),
  ]);
  const priceByLower = priceLookup.prices;

  const commanderLower = commanderRow.name.toLowerCase();
  const mustIncludeLowerSet = new Set(mustInclude.map((m) => m.toLowerCase()));
  const upgradeInLower = new Set(
    buildResult.steps.flatMap((step) => step.in_).map((n) => n.toLowerCase()),
  );

  const placed: DeckEntry[] = [];
  for (const entry of buildResult.deck) {
    const lower = entry.card_name.toLowerCase();
    if (lower === commanderLower) continue;
    const isBasic = BASIC_LAND_NAMES.has(entry.card_name);
    const fromTheme = themeLowerSet.has(lower);
    const resolved = priceByLower.get(lower);
    const typeLine = typeLines.get(lower) ?? "";

    let source: DeckEntry["source"] = "tier";
    if (mustIncludeLowerSet.has(lower)) source = "must_include";
    else if (isBasic) source = "basic_substitution";
    else if (upgradeInLower.has(lower)) source = "upgrade";
    else if (fromTheme) source = "tier";

    placed.push({
      card_name: entry.card_name,
      quantity: entry.quantity ?? 1,
      category: deriveCategory(entry.card_name, typeLine),
      price_usd: isBasic ? 0 : (resolved?.price ?? null),
      source,
      game_changer: allGameChangers.has(lower),
      reserved: resolved?.reserved ?? false,
    });
  }

  const runningTotal = Math.round(buildResult.totalCost * 100) / 100;
  const totalCount = placed.reduce((s, p) => s + p.quantity, 0);
  const slotsRemaining = Math.max(0, 99 - totalCount);

  // Reconstruct the `completion` block from BuildResult for back-compat.
  const themeCompletion: CompletionResult = {
    filled: [],
    added_from_recommendations: buildResult.steps.flatMap((step) =>
      step.in_.map((name) => ({
        card_name: name,
        reason: "high_inclusion_fill" as const,
        inclusion: undefined,
        price: priceByLower.get(name.toLowerCase())?.price ?? null,
      })),
    ),
    added_basics: placed
      .filter((p) => BASIC_LAND_NAMES.has(p.card_name))
      .map((p) => ({ name: p.card_name, quantity: p.quantity })),
    karsten_swaps: [],
    warnings: buildResult.warnings.filter((w) => w.includes("Mana base thin")),
  };

  const warnings: string[] = [];
  if (maxPrice !== undefined && maxPrice < themeInfo.avg_price) {
    warnings.push(
      `Budget $${maxPrice} is below the empirical floor of the '${theme}' theme on ${commanderRow.name} ($${themeInfo.avg_price} avg from ${themeInfo.num_decks_avg} decks). Output reflects aggressive cost-cutting.`,
    );
  }
  // slots_remaining is always 0 with the new pipeline (deck always 100
  // cards), but keep the warning shape for forward-compat.
  if (slotsRemaining > 0) {
    warnings.push(
      `${slotsRemaining} of 99 slots unfilled. Consider raising the budget or relaxing exclude_game_changers.`,
    );
  }
  // BuildResult diagnostics from baseline + upgrade + Karsten phases.
  for (const warning of buildResult.warnings) {
    if (warning.includes("Mana base thin")) continue; // already in completion.karsten_warnings
    warnings.push(warning);
  }
  const cardsWithoutPrices = placed
    .filter((p) => p.price_usd == null)
    .map((p) => p.card_name);
  if (cardsWithoutPrices.length > 0) {
    warnings.push(
      `${cardsWithoutPrices.length} cards have no known price — total_price excludes them.`,
    );
  }

  // Strategic warnings (combo casualties from `dropped`) no longer apply —
  // the new pipeline doesn't track per-card budget rejection. Will be
  // re-enabled in M7.5e via swap-out hooks in upgradeDeck.

  const categoryBreakdown: Record<string, number> = {};
  for (const p of placed) {
    categoryBreakdown[p.category] = (categoryBreakdown[p.category] ?? 0) + 1;
  }

  // M4: assess quality on the completed theme deck.
  const themeQuality: QualityReport = await assessQuality(
    env,
    placed.map((p) => ({ card_name: p.card_name, quantity: p.quantity })),
    themeCommanderRef,
  );

  return {
    type: "structured",
    data: {
      commander: {
        name: commanderRow.name,
        slug: commanderRow.slug,
        color_identity: safeParseJSON<string[]>(
          commanderRow.color_identity,
          [],
        ),
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
        remaining:
          maxPrice !== undefined
            ? Math.round((maxPrice - runningTotal) * 100) / 100
            : null,
      },
      deck: placed.map(trimDeckEntry),
      category_breakdown: categoryBreakdown,
      slots_remaining: slotsRemaining,
      ...(cardsWithoutPrices.length > 0
        ? { cards_without_prices: cardsWithoutPrices }
        : {}),
      quality: trimQuality(themeQuality, verbosity),
      completion: trimCompletion(
        {
          added_from_recommendations:
            themeCompletion.added_from_recommendations,
          added_basics: themeCompletion.added_basics,
          karsten_warnings: themeCompletion.warnings,
        },
        verbosity,
      ),
      warnings,
      attribution: {
        source: "EDHREC",
        priced_at: priceLookup.pricedAt,
        note: `Mirrors EDHREC's ${themeInfo.theme_value} theme decklist for ${commanderRow.name} ($${themeInfo.avg_price} avg from ${themeInfo.num_decks_avg} decks), padded to 99 via completion.`,
      },
    },
  };
}

interface comboLineRow {
  combo_id: string;
  card_names: string;
  results: string;
}

interface winConRow {
  front_face_name: string;
}

/**
 * buildStrategicWarnings surfaces budget-cut casualties that hurt the
 * deck's strategy: combo lines that would have been intact, and explicit
 * win-condition cards. Per epic Requirement 8 — these warnings name the
 * dropped card and the affected strategy so the user knows what just
 * broke.
 *
 * Combo logic: a dropped combo piece warns ONLY when every other card in
 * the combo line is in `placed`. If multiple combo cards were cut at once,
 * the combo wasn't going to fire anyway — no point naming a "broken"
 * strategy that wasn't intact even pre-cut.
 *
 * Win-condition logic: any dropped card tagged `win_condition` warns,
 * since these are explicitly the deck's kill conditions and dropping one
 * narrows the strategy.
 *
 * No new code paths in the cut decision itself (M3.2 is warnings-only;
 * actual prefer-keep swap-in/out is deferred to a future enhancement).
 */
async function buildStrategicWarnings(
  env: Env,
  commanderId: string,
  placed: DeckEntry[],
  dropped: { card_name: string; reason: string }[],
): Promise<string[]> {
  const warnings: string[] = [];
  if (dropped.length === 0) return warnings;

  const placedLower = new Set(placed.map((p) => p.card_name.toLowerCase()));
  const droppedLower = new Set(dropped.map((d) => d.card_name.toLowerCase()));

  const [comboRes, winConRes] = await Promise.all([
    env.DB.prepare(
      `SELECT combo_id, card_names, results FROM magic_edh_combos WHERE commander_id = ?`,
    )
      .bind(commanderId)
      .all<comboLineRow>(),
    env.DB.prepare(
      `SELECT DISTINCT front_face_name FROM magic_card_roles WHERE role = 'win_condition'`,
    ).all<winConRow>(),
  ]);

  // Combo: walk every combo for the commander, check intact-modulo-this-drop.
  // De-duplicate on (combo_id, dropped_card) so a combo affecting multiple
  // dropped cards still warns once per dropped card without flooding.
  const reportedCombo = new Set<string>();
  for (const row of comboRes.results ?? []) {
    const cards = safeParseJSON<string[]>(row.card_names, []);
    if (cards.length < 2) continue;
    const cardsLower = cards.map((c) => c.toLowerCase());
    // Find dropped cards that ARE part of this combo.
    const droppedFromCombo = cards.filter((c) =>
      droppedLower.has(c.toLowerCase()),
    );
    if (droppedFromCombo.length === 0) continue;
    // Other combo cards (those NOT dropped) — must all be present in placed
    // for the combo to have been "intact except for this drop".
    const otherCards = cardsLower.filter((c) => !droppedLower.has(c));
    if (otherCards.length === 0) continue; // entire combo was dropped — no intact strategy to break
    const allOthersPlaced = otherCards.every((c) => placedLower.has(c));
    if (!allOthersPlaced) continue;
    for (const dropped of droppedFromCombo) {
      const key = `${row.combo_id}|${dropped.toLowerCase()}`;
      if (reportedCombo.has(key)) continue;
      reportedCombo.add(key);
      const result = safeParseJSON<string[]>(row.results, []);
      const resultDesc =
        result.length > 0 ? ` (combo result: ${result[0]})` : "";
      warnings.push(
        `Dropped a combo piece — '${dropped}' was the missing card from a complete combo line in this deck${resultDesc}. Other pieces (${otherCards.join(", ")}) remain. Consider raising the budget to keep the combo intact.`,
      );
    }
  }

  // Win-condition: any dropped card tagged win_condition.
  const winConSet = new Set(
    (winConRes.results ?? []).map((r) => r.front_face_name.toLowerCase()),
  );
  for (const d of dropped) {
    if (winConSet.has(d.card_name.toLowerCase())) {
      warnings.push(
        `Dropped a win condition: '${d.card_name}' was tagged as a win_condition for this commander's strategy. Consider raising the budget or adjusting filters to keep it.`,
      );
    }
  }

  return warnings;
}

// ─── M6.1: output trimming for size-conscious LLM consumers ───────

type Verbosity = "summary" | "full";

function parseVerbosity(query: Record<string, unknown>): Verbosity {
  const raw = ((query.verbosity as string) ?? "summary").trim();
  return raw === "full" ? "full" : "summary";
}

/**
 * trimDeckEntry omits default-false flags (game_changer, reserved) from
 * per-card output. ~30 chars saved per card × 99 cards ≈ 3KB per deck.
 * Keeps every other field unchanged.
 */
function trimDeckEntry(entry: DeckEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {
    card_name: entry.card_name,
    quantity: entry.quantity,
    category: entry.category,
    price_usd: entry.price_usd,
    source: entry.source,
  };
  if (entry.game_changer) out.game_changer = true;
  if (entry.reserved) out.reserved = true;
  return out;
}

/**
 * trimQuality strips composition.X.cards[] arrays at summary verbosity
 * (names duplicate what's already in the deck[] field), caps reasons at
 * 3, and leaves the rest of the structure intact. At verbosity=full,
 * returns the QualityReport unchanged.
 */
function trimQuality(quality: QualityReport, verbosity: Verbosity): unknown {
  if (verbosity === "full") return quality;
  const trimmedComposition: Record<string, unknown> = {};
  for (const [role, roleData] of Object.entries(quality.composition)) {
    const data = roleData as {
      count: number;
      target_range: [number, number];
      target_source: string;
      status: string;
      cards: string[];
    };
    trimmedComposition[role] = {
      count: data.count,
      target_range: data.target_range,
      target_source: data.target_source,
      status: data.status,
      // cards[] omitted — same names appear in deck[].
    };
  }
  return {
    ...quality,
    bracket: {
      ...quality.bracket,
      reasons: quality.bracket.reasons.slice(0, 3),
    },
    composition: trimmedComposition,
  };
}

/**
 * trimCompletion truncates added_from_recommendations to 10 entries +
 * an "added_more_count" indicator when summary is requested. Basics and
 * karsten_warnings stay full — basics are tiny (5 entries max) and
 * warnings are actionable.
 */
function trimCompletion(
  completion: {
    added_from_recommendations: { card_name: string }[];
    added_basics: { name: string; quantity: number }[];
    karsten_warnings: string[];
  },
  verbosity: Verbosity,
): unknown {
  if (verbosity === "full") return completion;
  const all = completion.added_from_recommendations;
  const top = all.slice(0, 10);
  const more = Math.max(0, all.length - 10);
  return {
    added_from_recommendations: top,
    added_more_count: more,
    added_basics: completion.added_basics,
    karsten_warnings: completion.karsten_warnings,
  };
}
