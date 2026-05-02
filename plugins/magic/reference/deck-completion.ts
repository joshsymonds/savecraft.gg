/**
 * deck-completion — build legal 100-card Commander decks via the
 * marginal-utility upgrade pipeline.
 *
 * Public entry points:
 *   - buildAndUpgradeDeck (orchestrator): precon-or-minimal-shell baseline
 *     → upgradeDeck → karstenValidateMana. Returns a BuildResult with the
 *     final 100-card deck, total cost, baseline source, upgrade steps, and
 *     warnings aggregated from all three phases.
 *   - buildMinimalShell: universal cheap-playable baseline. Lands per
 *     Karsten + role lower bounds + basics → 100 cards.
 *   - upgradeDeck: marginal-utility hill climber. Per iteration, score
 *     1-for-1 / 2-for-1 / 1-for-2 swap candidates via deck-delta's
 *     deltaQuality and apply the best (Δ > epsilon) until plateau.
 *   - karstenValidateMana: warns when colored sources fall below Karsten's
 *     13-source heuristic floor.
 *
 * Per Epic Anti-pattern: terminates by quality plateau, NOT budget
 * exhaustion. Karsten validation is warning-only; active land rebalancing
 * is a future extension.
 */
import type { Env } from "../../../worker/src/types";
import type { CommanderRef, DeckEntry } from "./deck-quality";
import { COMMUNITY_BENCHMARKS } from "./deck-quality";
import { resolveCardPrices } from "./commander-prices";
import { safeParseJSON } from "../../../worker/src/reference/json";
import { deltaQuality } from "./deck-delta";

export interface AddedCard {
  card_name: string;
  reason: "fill_role_gap" | "high_inclusion_fill";
  role?: string;
  inclusion?: number;
  price: number | null;
}

export interface AddedBasic {
  name: string;
  quantity: number;
}

export interface KarstenSwap {
  from: string;
  to: string;
  reason: string;
}

export interface CompletionResult {
  filled: DeckEntry[];
  added_from_recommendations: AddedCard[];
  added_basics: AddedBasic[];
  karsten_swaps: KarstenSwap[];
  warnings: string[];
}

export interface CompletionOptions {
  targetSize?: number;
  maxPrice?: number;
  excludes?: string[];
  excludeGameChangers?: boolean;
  tier?: string;
}

export interface MinimalShellResult {
  deck: DeckEntry[];
  totalCost: number;
  warnings: string[];
}

export interface KarstenValidationResult {
  swaps: KarstenSwap[];
  warnings: string[];
}

export interface BuildOptions {
  budget: number;
  /** If supplied and length ≥ 60, used as baseline (padded with basics to 100). */
  precon?: DeckEntry[];
  /** Cards forced into the final deck regardless of budget. Per existing
   *  semantics: "added even when over budget". The upgrade loop may swap them
   *  out only if a swap improves Δquality by > epsilon. */
  mustInclude?: string[];
  /** Override baseline_cost. When omitted, computed from precon (sum of
   *  non-basic prices) or from buildMinimalShell.totalCost. Used by callers
   *  with an externally-tracked baseline cost — e.g. the precon path
   *  passes MSRP here so the upgrade loop budgets against
   *  remaining = budget − MSRP rather than budget − (per-card precon sum). */
  spent?: number;
  excludes?: string[];
  excludeGameChangers?: boolean;
  epsilon?: number;
  maxIterations?: number;
  candidatePoolSize?: number;
}

export interface BuildResult {
  deck: DeckEntry[];
  totalCost: number;
  baseline_cost: number;
  baseline_source: "precon" | "minimal_shell";
  steps: UpgradeStep[];
  karsten_swaps: KarstenSwap[];
  warnings: string[];
}

interface roleRecRow {
  card_name: string;
  inclusion: number;
  price: number | null;
}

const COLOR_TO_BASIC: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

interface commanderColorRow {
  color_identity: string;
}

interface manaRow {
  front_face_name: string;
  mana_cost: string;
  type_line: string;
  produced_mana: string;
}

function countCards(deck: DeckEntry[]): number {
  let total = 0;
  for (const e of deck) total += e.quantity ?? 1;
  return total;
}

async function loadColorIdentity(
  env: Env,
  commanderId: string,
): Promise<string[]> {
  const result = await env.DB.prepare(
    `SELECT color_identity FROM magic_edh_commanders WHERE scryfall_id = ?`,
  )
    .bind(commanderId)
    .all<commanderColorRow>();
  const row = result.results?.[0];
  if (!row) return [];
  return safeParseJSON<string[]>(row.color_identity, []);
}

/**
 * computePipDistribution counts colored mana symbols across all spells in
 * the deck (lands excluded). Returns Map<color, pipCount>.
 */
async function computePipDistribution(
  env: Env,
  deck: DeckEntry[],
): Promise<Map<string, number>> {
  const pips = new Map<string, number>();
  if (deck.length === 0) return pips;
  const cardNames = deck.map((e) => e.card_name);
  const manaMap = await loadManaData(env, cardNames);
  for (const entry of deck) {
    const lower = entry.card_name.toLowerCase();
    const data = manaMap.get(lower);
    if (!data) continue;
    if (data.type_line.includes("Land")) continue;
    const matches = data.mana_cost.matchAll(/\{([WUBRG])\}/g);
    for (const m of matches) {
      const color = m[1] ?? "";
      if (color !== "") {
        pips.set(color, (pips.get(color) ?? 0) + (entry.quantity ?? 1));
      }
    }
  }
  return pips;
}

/**
 * countColoredSources counts how many lands in the deck produce each color.
 * Basic lands are recognised by name (Forest=G, Plains=W, etc.); non-basic
 * lands by their produced_mana JSON column.
 */
async function countColoredSources(
  env: Env,
  deck: DeckEntry[],
): Promise<Map<string, number>> {
  const sources = new Map<string, number>();
  if (deck.length === 0) return sources;
  const cardNames = deck.map((e) => e.card_name);
  const manaMap = await loadManaData(env, cardNames);
  const basicMap: Record<string, string> = {
    Forest: "G",
    Island: "U",
    Swamp: "B",
    Mountain: "R",
    Plains: "W",
  };
  for (const entry of deck) {
    const lower = entry.card_name.toLowerCase();
    // Basic-land shortcut: even if the card isn't in magic_cards (test data),
    // the well-known basic names always produce their color.
    const basicColor = basicMap[entry.card_name];
    if (basicColor) {
      sources.set(
        basicColor,
        (sources.get(basicColor) ?? 0) + (entry.quantity ?? 1),
      );
      continue;
    }
    const data = manaMap.get(lower);
    if (!data) continue;
    if (!data.type_line.includes("Land")) continue;
    const produced = safeParseJSON<string[]>(data.produced_mana, []);
    for (const c of produced) {
      if (["W", "U", "B", "R", "G"].includes(c)) {
        sources.set(c, (sources.get(c) ?? 0) + (entry.quantity ?? 1));
      }
    }
  }
  return sources;
}

async function loadManaData(
  env: Env,
  cardNames: string[],
): Promise<
  Map<string, { mana_cost: string; type_line: string; produced_mana: string }>
> {
  const out = new Map<
    string,
    { mana_cost: string; type_line: string; produced_mana: string }
  >();
  if (cardNames.length === 0) return out;
  const CHUNK = 90;
  for (let i = 0; i < cardNames.length; i += CHUNK) {
    const slice = cardNames.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `SELECT front_face_name, mana_cost, type_line, produced_mana
         FROM magic_cards
         WHERE LOWER(front_face_name) IN (${placeholders}) AND is_default = 1 AND type_line != 'Card // Card'`,
    )
      .bind(...slice.map((n) => n.toLowerCase()))
      .all<manaRow>();
    for (const row of result.results ?? []) {
      out.set(row.front_face_name.toLowerCase(), {
        mana_cost: row.mana_cost ?? "",
        type_line: row.type_line ?? "",
        produced_mana: row.produced_mana ?? "[]",
      });
    }
  }
  return out;
}

/**
 * buildMinimalShell constructs a 100-card legal Commander deck (1 commander
 * + 99 others) from scratch, intended as the universal baseline for the
 * marginal-utility upgrade loop (M7.2+). It is NOT optimized — it is the
 * cheapest playable starting state.
 *
 * Algorithm:
 *   1. Fill role lower bounds (community benchmarks: 10 ramp, 8 draw,
 *      8 removal, 7 win-con) using the cheapest qualifying recommendations
 *      that fit the remaining budget. If a role floor cannot be met, emit
 *      a warning and proceed.
 *   2. Pad up to 63 non-basic slots with the cheapest high-inclusion
 *      generic recommendations.
 *   3. Pad to 99 with basic lands distributed by commander color identity.
 *      Basics are free and always satisfy any budget.
 *
 * The result always has exactly 100 cards. At a $0 budget, the result is
 * commander + 99 basics. Prices missing from `magic_edh_card_prices` are
 * treated as $0 (consistent with the existing greedy-fill convention).
 */
export async function buildMinimalShell(
  env: Env,
  commander: CommanderRef,
  budget: number,
  excludes: string[],
  excludeGameChangers: boolean,
): Promise<MinimalShellResult> {
  const warnings: string[] = [];
  const inDeck = new Set<string>();
  const excludesLower = new Set(excludes.map((x) => x.toLowerCase()));
  let totalCost = 0;

  // The deck starts with the commander.
  const deck: DeckEntry[] = [{ card_name: commander.name, quantity: 1 }];
  inDeck.add(commander.name.toLowerCase());

  // Game-changer filter set (loaded once if needed).
  let gameChangers = new Set<string>();
  if (excludeGameChangers) {
    const gcResult = await env.DB.prepare(
      `SELECT card_name FROM magic_game_changers`,
    ).all<{ card_name: string }>();
    gameChangers = new Set(
      (gcResult.results ?? []).map((r) => r.card_name.toLowerCase()),
    );
  }

  // ── Phase 1: fill role lower bounds (cheapest first) ───────────
  const roleFloors: [string, number][] = [
    ["ramp", COMMUNITY_BENCHMARKS.ramp[0]],
    ["card_draw", COMMUNITY_BENCHMARKS.card_draw[0]],
    ["removal", COMMUNITY_BENCHMARKS.removal[0]],
    ["win_condition", COMMUNITY_BENCHMARKS.win_conditions[0]],
  ];

  for (const [role, floor] of roleFloors) {
    const candidates = await fetchRoleRecsByPrice(
      env,
      commander.scryfall_id,
      role,
    );
    let added = 0;
    for (const cand of candidates) {
      if (added >= floor) break;
      const lower = cand.card_name.toLowerCase();
      if (inDeck.has(lower)) continue;
      if (excludesLower.has(lower)) continue;
      if (excludeGameChangers && gameChangers.has(lower)) continue;
      const price = cand.price ?? 0;
      if (totalCost + price > budget) continue;
      deck.push({ card_name: cand.card_name, quantity: 1 });
      inDeck.add(lower);
      totalCost += price;
      added += 1;
    }
    if (added < floor) {
      warnings.push(
        `${role} lower bound ${String(floor)} not met (added ${String(added)} within budget $${String(budget)}).`,
      );
    }
  }

  // ── Phase 2: pad up to 63 non-basic slots with cheapest generic recs ─
  // 99 - 36 (Karsten lands) = 63 non-land slots. We've used up to 33 for
  // role floors; up to 30 generic recs round out the non-basic complement.
  const NON_BASIC_TARGET = 63;
  const nonBasicCount = (): number => deck.length - 1; // exclude commander
  if (nonBasicCount() < NON_BASIC_TARGET) {
    const generic = await fetchAllRecsByPrice(env, commander.scryfall_id);
    for (const cand of generic) {
      if (nonBasicCount() >= NON_BASIC_TARGET) break;
      const lower = cand.card_name.toLowerCase();
      if (inDeck.has(lower)) continue;
      if (excludesLower.has(lower)) continue;
      if (excludeGameChangers && gameChangers.has(lower)) continue;
      const price = cand.price ?? 0;
      if (totalCost + price > budget) continue;
      deck.push({ card_name: cand.card_name, quantity: 1 });
      inDeck.add(lower);
      totalCost += price;
    }
  }

  // ── Phase 3: pad to 100 with basic lands ────────────────────────
  const TOTAL_TARGET = 100; // 1 commander + 99 others
  const slotsRemaining = TOTAL_TARGET - countCards(deck);
  if (slotsRemaining > 0) {
    const colorIdentity = await loadColorIdentity(env, commander.scryfall_id);
    // Minimal shell has no pip data yet (cards may not have mana_cost in
    // test fixtures); allocateBasics falls back to round-robin in that case.
    const basicAlloc = allocateBasics(slotsRemaining, colorIdentity, new Map());
    for (const [name, qty] of basicAlloc) {
      const existing = deck.find((e) => e.card_name === name);
      if (existing) {
        existing.quantity = (existing.quantity ?? 1) + qty;
      } else {
        deck.push({ card_name: name, quantity: qty });
      }
    }
  }

  return { deck, totalCost, warnings };
}

/**
 * fetchRoleRecsByPrice returns role-tagged candidates ordered by price ASC,
 * inclusion DESC, card_name ASC (deterministic). LEFT JOINs prices since
 * not every card has a price row; missing prices are treated as 0.
 */
async function fetchRoleRecsByPrice(
  env: Env,
  commanderId: string,
  role: string,
): Promise<roleRecRow[]> {
  const result = await env.DB.prepare(
    `SELECT r.card_name AS card_name,
            MAX(r.inclusion) AS inclusion,
            COALESCE(p.tcgplayer_price, 0) AS price
       FROM magic_edh_recommendations r
       JOIN magic_card_roles cr ON LOWER(r.card_name) = LOWER(cr.front_face_name)
       LEFT JOIN magic_edh_card_prices p ON LOWER(r.card_name) = LOWER(p.card_name)
       WHERE r.commander_id = ? AND cr.role = ?
       GROUP BY r.card_name, p.tcgplayer_price
       ORDER BY price ASC, inclusion DESC, r.card_name ASC
       LIMIT 100`,
  )
    .bind(commanderId, role)
    .all<roleRecRow>();
  return result.results ?? [];
}

async function fetchAllRecsByPrice(
  env: Env,
  commanderId: string,
): Promise<roleRecRow[]> {
  const result = await env.DB.prepare(
    `SELECT r.card_name AS card_name,
            MAX(r.inclusion) AS inclusion,
            COALESCE(p.tcgplayer_price, 0) AS price
       FROM magic_edh_recommendations r
       LEFT JOIN magic_edh_card_prices p ON LOWER(r.card_name) = LOWER(p.card_name)
       WHERE r.commander_id = ?
       GROUP BY r.card_name, p.tcgplayer_price
       ORDER BY price ASC, inclusion DESC, r.card_name ASC
       LIMIT 200`,
  )
    .bind(commanderId)
    .all<roleRecRow>();
  return result.results ?? [];
}

/**
 * allocateBasics distributes `slots` basic lands across the commander's
 * color identity proportional to the deck's pip distribution. Colors not
 * in the identity are skipped; if the identity is empty (colorless
 * commander), allocates all to Wastes via the colorless fallback.
 *
 * Returns Map<basicLandName, quantity>.
 */
function allocateBasics(
  slots: number,
  colorIdentity: string[],
  pipDist: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  if (slots <= 0) return out;
  // Colorless commander → pad with Wastes.
  if (colorIdentity.length === 0) {
    out.set("Wastes", slots);
    return out;
  }
  // Allocate proportional to pip distribution within the color identity.
  // If no pips are detected (empty deck), distribute evenly.
  const colorWeights = new Map<string, number>();
  let totalWeight = 0;
  for (const c of colorIdentity) {
    const w = pipDist.get(c) ?? 0;
    colorWeights.set(c, w);
    totalWeight += w;
  }
  if (totalWeight === 0) {
    // No pip data; round-robin allocation.
    let remaining = slots;
    let i = 0;
    while (remaining > 0) {
      const color = colorIdentity[i % colorIdentity.length] ?? "";
      const basic = COLOR_TO_BASIC[color];
      if (basic) {
        out.set(basic, (out.get(basic) ?? 0) + 1);
        remaining -= 1;
      }
      i += 1;
      if (i > slots * 2) break; // safety
    }
    return out;
  }
  // Proportional allocation with floor-then-distribute.
  let allocated = 0;
  for (const c of colorIdentity) {
    const weight = colorWeights.get(c) ?? 0;
    const share = Math.floor((slots * weight) / totalWeight);
    const basic = COLOR_TO_BASIC[c];
    if (basic && share > 0) {
      out.set(basic, share);
      allocated += share;
    }
  }
  // Distribute remainder round-robin across colors with positive weight,
  // sorted by weight DESC so dominant colors get the extra basic.
  const sortedColors = [...colorIdentity]
    .filter((c) => (colorWeights.get(c) ?? 0) > 0)
    .sort((a, b) => (colorWeights.get(b) ?? 0) - (colorWeights.get(a) ?? 0));
  let remaining = slots - allocated;
  let i = 0;
  while (remaining > 0 && sortedColors.length > 0) {
    const color = sortedColors[i % sortedColors.length] ?? "";
    const basic = COLOR_TO_BASIC[color];
    if (basic) {
      out.set(basic, (out.get(basic) ?? 0) + 1);
      remaining -= 1;
    }
    i += 1;
    if (i > slots * 2) break;
  }
  return out;
}

// ── Marginal-utility upgrade loop ────────────────────────────────

const BASIC_LAND_NAMES = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
]);

const COMPOSITE_PAIR_LIMIT = 20; // top-K candidates per role for composite swaps

export interface UpgradeOptions {
  /** Total budget cap. The loop's spent never exceeds this. */
  budget: number;
  /** Cost of the baseline deck — already counted against budget. */
  spent: number;
  excludes?: string[];
  excludeGameChangers?: boolean;
  /** Stop when best Δ ≤ epsilon (default 0.5). */
  epsilon?: number;
  /** Hard cap on iterations (default 50). */
  maxIterations?: number;
  /** Top-K candidates pulled per iteration (default 50). */
  candidatePoolSize?: number;
}

export interface UpgradeStep {
  iteration: number;
  out: string[];
  in_: string[];
  delta: number;
  cost_change: number;
  operator: "1for1" | "2for1" | "1for2";
}

export interface UpgradeResult {
  deck: DeckEntry[];
  totalCost: number;
  steps: UpgradeStep[];
  warnings: string[];
}

interface candidateRow {
  card_name: string;
  synergy: number;
  inclusion: number;
  price: number;
}

/**
 * upgradeDeck applies marginal-utility hill-climbing to a 100-card baseline.
 * Per iteration: enumerate top-K recommendations within remaining budget,
 * score 1-for-1 / 2-for-1 / 1-for-2 swaps via deltaQuality, apply the best
 * if Δ > epsilon, terminate otherwise. Composite swaps (2-for-1, 1-for-2)
 * are restricted to same-role pairs to bound enumeration cost. Composite
 * swaps adjust basic-land count to maintain 100 cards.
 *
 * Per Epic Anti-pattern: terminates by quality plateau, NOT budget exhaustion.
 * A $300 deck may not use the full budget if no swap improves quality by ε.
 */
export async function upgradeDeck(
  env: Env,
  baseline: DeckEntry[],
  commander: CommanderRef,
  options: UpgradeOptions,
): Promise<UpgradeResult> {
  const epsilon = options.epsilon ?? 0.5;
  const maxIters = options.maxIterations ?? 50;
  const poolSize = options.candidatePoolSize ?? 50;
  const excludesLower = new Set(
    (options.excludes ?? []).map((s) => s.toLowerCase()),
  );
  const commanderLower = commander.name.toLowerCase();

  const gameChangers = options.excludeGameChangers
    ? await loadGameChangers(env)
    : new Set<string>();

  // Load combo lines + win-condition cards once for swap-out warning checks.
  // Per Epic Anti-pattern: "Swaps that remove flagged cards must surface a
  // warning."
  const combos = await loadCombosForCommander(env, commander.scryfall_id);
  const winConditionNames = await loadWinConditionNames(env);
  const reportedKeys = new Set<string>();

  const deck: DeckEntry[] = baseline.map((entry) => ({ ...entry }));
  let spent = options.spent;
  const steps: UpgradeStep[] = [];
  const warnings: string[] = [];

  for (let iter = 1; iter <= maxIters; iter++) {
    const remaining = options.budget - spent;
    const candidates = await fetchCandidatesBySynergy(
      env,
      commander.scryfall_id,
      poolSize,
      remaining,
    );

    const inDeckLower = new Set(
      deck.map((entry) => entry.card_name.toLowerCase()),
    );
    const filtered = candidates.filter((c) => {
      const lc = c.card_name.toLowerCase();
      if (inDeckLower.has(lc)) return false;
      if (excludesLower.has(lc)) return false;
      if (gameChangers.has(lc)) return false;
      return true;
    });

    if (filtered.length === 0) break;

    // Build price lookup for swappable deck cards (everything except the
    // commander). Basics have price 0.
    const swappableNames = deck
      .map((entry) => entry.card_name)
      .filter((name) => name.toLowerCase() !== commanderLower);
    const deckPrices = await loadPricesForDeckCards(env, swappableNames);
    const candidatePrices = new Map<string, number>();
    for (const cand of filtered) {
      candidatePrices.set(cand.card_name.toLowerCase(), cand.price);
    }

    // Roles for swap participants (deck swappables + filtered candidates).
    const allInvolvedNames = [
      ...swappableNames,
      ...filtered.map((c) => c.card_name),
    ];
    const rolesByCard = await loadRolesByLowerName(env, allInvolvedNames);

    // Group swappable deck cards by role for 2-for-1 enumeration.
    const swappableUnique = [...new Set(swappableNames)];
    const deckByRole = bucketByRole(swappableUnique, rolesByCard);
    // Group candidates by role for 1-for-2 enumeration.
    const candByRole = bucketByRole(
      filtered.map((c) => c.card_name),
      rolesByCard,
    );

    let best: UpgradeStep | null = null;

    // 1-for-1: every candidate × every swappable deck card
    for (const cand of filtered) {
      for (const xName of swappableUnique) {
        const xPrice = deckPrices.get(xName.toLowerCase()) ?? 0;
        const costChange = cand.price - xPrice;
        if (costChange > remaining) continue;
        const delta = await deltaQuality(
          env,
          deck,
          [xName],
          [cand.card_name],
          commander,
        );
        if (!best || delta > best.delta) {
          best = {
            iteration: iter,
            out: [xName],
            in_: [cand.card_name],
            delta,
            cost_change: costChange,
            operator: "1for1",
          };
        }
      }
    }

    // 2-for-1: candidate Y, deck pair (X1, X2) sharing a role with Y
    for (const cand of filtered) {
      const yRoles = rolesByCard.get(cand.card_name.toLowerCase()) ?? new Set();
      if (yRoles.size === 0) continue;
      const pool = collectFromRoles(yRoles, deckByRole, COMPOSITE_PAIR_LIMIT);
      const xList = [...pool];
      for (let i = 0; i < xList.length; i++) {
        for (let j = i + 1; j < xList.length; j++) {
          const x1 = xList[i] ?? "";
          const x2 = xList[j] ?? "";
          const x1Price = deckPrices.get(x1.toLowerCase()) ?? 0;
          const x2Price = deckPrices.get(x2.toLowerCase()) ?? 0;
          const costChange = cand.price - x1Price - x2Price;
          if (costChange > remaining) continue;
          const delta = await deltaQuality(
            env,
            deck,
            [x1, x2],
            [cand.card_name],
            commander,
          );
          if (!best || delta > best.delta) {
            best = {
              iteration: iter,
              out: [x1, x2],
              in_: [cand.card_name],
              delta,
              cost_change: costChange,
              operator: "2for1",
            };
          }
        }
      }
    }

    // 1-for-2: deck card X, candidate pair (Y1, Y2) sharing a role with X
    for (const xName of swappableUnique) {
      const xRoles = rolesByCard.get(xName.toLowerCase()) ?? new Set();
      if (xRoles.size === 0) continue;
      // Need a basic to remove for the slot adjustment.
      if (!hasBasicLand(deck)) continue;
      const xPrice = deckPrices.get(xName.toLowerCase()) ?? 0;
      const pool = collectFromRoles(xRoles, candByRole, COMPOSITE_PAIR_LIMIT);
      const yList = [...pool];
      for (let i = 0; i < yList.length; i++) {
        for (let j = i + 1; j < yList.length; j++) {
          const y1 = yList[i] ?? "";
          const y2 = yList[j] ?? "";
          const y1Price = candidatePrices.get(y1.toLowerCase()) ?? 0;
          const y2Price = candidatePrices.get(y2.toLowerCase()) ?? 0;
          const costChange = y1Price + y2Price - xPrice;
          if (costChange > remaining) continue;
          const delta = await deltaQuality(
            env,
            deck,
            [xName],
            [y1, y2],
            commander,
          );
          if (!best || delta > best.delta) {
            best = {
              iteration: iter,
              out: [xName],
              in_: [y1, y2],
              delta,
              cost_change: costChange,
              operator: "1for2",
            };
          }
        }
      }
    }

    if (!best || best.delta <= epsilon) break;

    applySwap(deck, best, commander);
    spent += best.cost_change;
    steps.push(best);

    // Swap-out warnings: flag combo and win-condition casualties.
    const postSwapDeck = new Set(
      deck.map((entry) => entry.card_name.toLowerCase()),
    );
    for (const droppedName of best.out) {
      const droppedLower = droppedName.toLowerCase();
      if (winConditionNames.has(droppedLower)) {
        const key = `wincon:${droppedLower}`;
        if (!reportedKeys.has(key)) {
          reportedKeys.add(key);
          warnings.push(
            `Dropped a win condition: '${droppedName}' was tagged as a win_condition for this commander's strategy. Consider raising the budget or adjusting filters to keep it.`,
          );
        }
      }
      for (const combo of combos) {
        const cardsLower = combo.cards.map((c) => c.toLowerCase());
        if (!cardsLower.includes(droppedLower)) continue;
        const otherCards = cardsLower.filter((c) => c !== droppedLower);
        if (otherCards.length === 0) continue;
        const allOthersPresent = otherCards.every((c) => postSwapDeck.has(c));
        if (!allOthersPresent) continue;
        const key = `combo:${combo.id}|${droppedLower}`;
        if (reportedKeys.has(key)) continue;
        reportedKeys.add(key);
        const otherDisplay = combo.cards
          .filter((c) => c.toLowerCase() !== droppedLower)
          .join(", ");
        warnings.push(
          `Dropped a combo piece — '${droppedName}' was the missing card from a complete combo line in this deck. Other pieces (${otherDisplay}) remain. Consider raising the budget to keep the combo intact.`,
        );
      }
    }
  }

  if (steps.length === maxIters) {
    warnings.push(
      `Hit MAX_ITERATIONS (${String(maxIters)}); possible oscillation — terminating early.`,
    );
  }

  return { deck, totalCost: spent, steps, warnings };
}

interface comboCardsRow {
  combo_id: string;
  card_names: string;
}

interface ComboLine {
  id: string;
  cards: string[];
}

async function loadCombosForCommander(
  env: Env,
  commanderId: string,
): Promise<ComboLine[]> {
  const result = await env.DB.prepare(
    `SELECT combo_id, card_names FROM magic_edh_combos WHERE commander_id = ?`,
  )
    .bind(commanderId)
    .all<comboCardsRow>();
  const out: ComboLine[] = [];
  for (const row of result.results ?? []) {
    const cards = safeParseJSON<string[]>(row.card_names, []);
    if (cards.length < 2) continue;
    out.push({ id: row.combo_id, cards });
  }
  return out;
}

async function loadWinConditionNames(env: Env): Promise<Set<string>> {
  const result = await env.DB.prepare(
    `SELECT DISTINCT front_face_name FROM magic_card_roles WHERE role = 'win_condition'`,
  ).all<{ front_face_name: string }>();
  return new Set(
    (result.results ?? []).map((r) => r.front_face_name.toLowerCase()),
  );
}

async function loadGameChangers(env: Env): Promise<Set<string>> {
  const result = await env.DB.prepare(
    `SELECT card_name FROM magic_game_changers`,
  ).all<{ card_name: string }>();
  return new Set((result.results ?? []).map((r) => r.card_name.toLowerCase()));
}

async function fetchCandidatesBySynergy(
  env: Env,
  commanderId: string,
  poolSize: number,
  _budgetRemaining: number,
): Promise<candidateRow[]> {
  // Do NOT filter by absolute price ≤ budget. Composite swaps (2-for-1)
  // can afford candidates whose absolute price exceeds remaining budget,
  // because the offsetting cost of removed deck cards reduces the net
  // cost_change. The per-swap evaluation enforces the budget correctly.
  const result = await env.DB.prepare(
    `SELECT r.card_name AS card_name,
            MAX(r.synergy) AS synergy,
            MAX(r.inclusion) AS inclusion,
            COALESCE(p.tcgplayer_price, 0) AS price
       FROM magic_edh_recommendations r
       LEFT JOIN magic_edh_card_prices p ON LOWER(r.card_name) = LOWER(p.card_name)
       WHERE r.commander_id = ?
       GROUP BY r.card_name, p.tcgplayer_price
       ORDER BY synergy DESC, inclusion DESC, r.card_name ASC
       LIMIT ?`,
  )
    .bind(commanderId, poolSize)
    .all<candidateRow>();
  return result.results ?? [];
}

async function loadPricesForDeckCards(
  env: Env,
  names: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (names.length === 0) return out;
  // Skip basic-land lookups (always free). Pass original casing to
  // resolveCardPrices since it queries with case-sensitive IN clauses;
  // results are keyed lowercase regardless of input casing.
  const lookups = [...new Set(names.filter((n) => !BASIC_LAND_NAMES.has(n)))];
  if (lookups.length === 0) return out;
  const prices = await resolveCardPrices(env, lookups);
  for (const name of lookups) {
    const p = prices.prices.get(name.toLowerCase())?.price;
    out.set(name.toLowerCase(), p ?? 0);
  }
  return out;
}

async function loadRolesByLowerName(
  env: Env,
  names: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (names.length === 0) return out;
  const unique = [...new Set(names.map((n) => n.toLowerCase()))];
  const CHUNK = 90;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `SELECT front_face_name, role FROM magic_card_roles
         WHERE LOWER(front_face_name) IN (${placeholders})`,
    )
      .bind(...slice)
      .all<{ front_face_name: string; role: string }>();
    for (const row of result.results ?? []) {
      const key = row.front_face_name.toLowerCase();
      let set = out.get(key);
      if (!set) {
        set = new Set();
        out.set(key, set);
      }
      set.add(row.role);
    }
  }
  return out;
}

/**
 * bucketByRole returns Map<role, card_names[]> with cards listed in input
 * order (input is already pre-sorted by relevance — synergy DESC for
 * candidates, deck order for swappables).
 */
function bucketByRole(
  names: string[],
  rolesByCard: Map<string, Set<string>>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const name of names) {
    const roles = rolesByCard.get(name.toLowerCase());
    if (!roles) continue;
    for (const role of roles) {
      let list = out.get(role);
      if (!list) {
        list = [];
        out.set(role, list);
      }
      list.push(name);
    }
  }
  return out;
}

function collectFromRoles(
  roles: Set<string>,
  byRole: Map<string, string[]>,
  limitPerRole: number,
): Set<string> {
  const out = new Set<string>();
  for (const role of roles) {
    const list = byRole.get(role);
    if (!list) continue;
    for (let i = 0; i < Math.min(limitPerRole, list.length); i++) {
      const item = list[i];
      if (item !== undefined) out.add(item);
    }
  }
  return out;
}

function hasBasicLand(deck: DeckEntry[]): boolean {
  for (const entry of deck) {
    if (BASIC_LAND_NAMES.has(entry.card_name) && (entry.quantity ?? 1) > 0) {
      return true;
    }
  }
  return false;
}

function pickBasicToRemove(deck: DeckEntry[]): string | null {
  for (const entry of deck) {
    if (BASIC_LAND_NAMES.has(entry.card_name) && (entry.quantity ?? 1) > 0) {
      return entry.card_name;
    }
  }
  return null;
}

function pickBasicToAdd(deck: DeckEntry[]): string {
  // Prefer adding to an already-present basic so the deck stays as-is in
  // structure. Fall back to Plains if no basic is in the deck.
  for (const entry of deck) {
    if (BASIC_LAND_NAMES.has(entry.card_name)) return entry.card_name;
  }
  return "Plains";
}

function applySwap(
  deck: DeckEntry[],
  step: UpgradeStep,
  commander: CommanderRef,
): void {
  for (const name of step.out) decrementCard(deck, name, commander);
  for (const name of step.in_) incrementCard(deck, name);
  // Composite swap basic-land slot adjustments.
  if (step.operator === "2for1") {
    const basic = pickBasicToAdd(deck);
    incrementCard(deck, basic);
  } else if (step.operator === "1for2") {
    const basic = pickBasicToRemove(deck);
    if (basic) decrementCard(deck, basic, commander);
  }
}

function decrementCard(
  deck: DeckEntry[],
  name: string,
  commander: CommanderRef,
): void {
  if (name.toLowerCase() === commander.name.toLowerCase()) return;
  const idx = deck.findIndex(
    (entry) => entry.card_name.toLowerCase() === name.toLowerCase(),
  );
  if (idx < 0) return;
  const entry = deck[idx]!;
  const qty = entry.quantity ?? 1;
  if (qty > 1) {
    entry.quantity = qty - 1;
  } else {
    deck.splice(idx, 1);
  }
}

function incrementCard(deck: DeckEntry[], name: string): void {
  const existing = deck.find(
    (entry) => entry.card_name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    existing.quantity = (existing.quantity ?? 1) + 1;
  } else {
    deck.push({ card_name: name, quantity: 1 });
  }
}

// ── Karsten color-source validation ────────────────────────────────

const KARSTEN_SOURCE_FLOOR = 13;

/**
 * karstenValidateMana counts colored sources in the deck against pip
 * distribution and emits warnings where any color is below Karsten's
 * 13-source heuristic floor for single-pip 1-drop spells.
 *
 * Currently warning-only — `swaps` returns empty. Active land-rebalancing
 * (swap basic of deficient color in for excess basic) is a future
 * extension; the warning surface is sufficient for the M7.x rewire.
 */
export async function karstenValidateMana(
  env: Env,
  deck: DeckEntry[],
  _commander: CommanderRef,
): Promise<KarstenValidationResult> {
  const warnings: string[] = [];
  const swaps: KarstenSwap[] = [];
  const finalPips = await computePipDistribution(env, deck);
  const finalSources = await countColoredSources(env, deck);
  for (const [color, pipCount] of finalPips) {
    if (pipCount === 0) continue;
    const sources = finalSources.get(color) ?? 0;
    if (sources < KARSTEN_SOURCE_FLOOR) {
      warnings.push(
        `Mana base thin for {${color}}: ${String(sources)} sources for ${String(pipCount)} pips. Karsten recommends ≥${String(KARSTEN_SOURCE_FLOOR)} sources for single-pip 1-drop spells; consider more lands of this color.`,
      );
    }
  }
  return { swaps, warnings };
}

// ── End-to-end orchestrator ────────────────────────────────────────

/**
 * buildAndUpgradeDeck constructs a 100-card legal Commander deck end-to-end:
 *   1. Baseline: precon (if supplied and ≥60 cards) padded to 100, OR
 *      buildMinimalShell.
 *   2. Upgrade loop: marginal-utility hill climbing via upgradeDeck.
 *   3. Karsten validation: warns if any color is under-supplied.
 *
 * Aggregates warnings from all three phases.
 */
export async function buildAndUpgradeDeck(
  env: Env,
  commander: CommanderRef,
  options: BuildOptions,
): Promise<BuildResult> {
  const excludes = options.excludes ?? [];
  const excludeGameChangers = options.excludeGameChangers ?? false;
  const warnings: string[] = [];

  let baselineDeck: DeckEntry[];
  let baselineCost: number;
  let baselineSource: "precon" | "minimal_shell";

  if (options.precon && countCards(options.precon) >= 60) {
    // Use precon as baseline; pad with basics to 100 if short. Threshold
    // checks total card count (sum of quantities), not array length, so
    // a deck like [Sol Ring×1, Cultivate×1, Forest×97] qualifies.
    baselineDeck = await padPreconToFull(env, commander, options.precon);
    baselineCost = options.spent ?? (await sumNonBasicCost(env, baselineDeck));
    baselineSource = "precon";
  } else {
    const shell = await buildMinimalShell(
      env,
      commander,
      options.budget,
      excludes,
      excludeGameChangers,
    );
    baselineDeck = shell.deck;
    baselineCost = options.spent ?? shell.totalCost;
    baselineSource = "minimal_shell";
    warnings.push(...shell.warnings);
  }

  // Apply must_includes: pin user-specified cards by swapping them in for
  // the cheapest disposable baseline card (basic land preferred). Per the
  // existing semantics, must_includes are added even when over budget.
  if (options.mustInclude && options.mustInclude.length > 0) {
    const mustResult = await applyMustIncludes(
      env,
      baselineDeck,
      baselineCost,
      options.mustInclude,
      commander,
    );
    baselineDeck = mustResult.deck;
    baselineCost = mustResult.cost;
    warnings.push(...mustResult.warnings);
  }

  const upgrade = await upgradeDeck(env, baselineDeck, commander, {
    budget: options.budget,
    spent: baselineCost,
    excludes,
    excludeGameChangers,
    epsilon: options.epsilon,
    maxIterations: options.maxIterations,
    candidatePoolSize: options.candidatePoolSize,
  });
  warnings.push(...upgrade.warnings);

  const karsten = await karstenValidateMana(env, upgrade.deck, commander);
  warnings.push(...karsten.warnings);

  return {
    deck: upgrade.deck,
    totalCost: upgrade.totalCost,
    baseline_cost: baselineCost,
    baseline_source: baselineSource,
    steps: upgrade.steps,
    karsten_swaps: karsten.swaps,
    warnings,
  };
}

/**
 * padPreconToFull takes a precon-style decklist (≥60 cards) and pads with
 * basics to reach 100. If the precon is already ≥100, returns it unchanged.
 * Basics are color-distributed per the precon's pip distribution.
 */
async function padPreconToFull(
  env: Env,
  commander: CommanderRef,
  precon: DeckEntry[],
): Promise<DeckEntry[]> {
  const deck: DeckEntry[] = precon.map((entry) => ({ ...entry }));
  const total = countCards(deck);
  if (total >= 100) return deck;

  const slotsRemaining = 100 - total;
  const colorIdentity = await loadColorIdentity(env, commander.scryfall_id);
  const pipDist = await computePipDistribution(env, deck);
  const basicAlloc = allocateBasics(slotsRemaining, colorIdentity, pipDist);
  for (const [name, qty] of basicAlloc) {
    const existing = deck.find((entry) => entry.card_name === name);
    if (existing) {
      existing.quantity = (existing.quantity ?? 1) + qty;
    } else {
      deck.push({ card_name: name, quantity: qty });
    }
  }
  return deck;
}

/**
 * applyMustIncludes injects user-pinned cards into the baseline by swapping
 * them in for the cheapest disposable card (basic land preferred). The
 * upgrade loop may swap them out later only if a swap improves Δquality
 * past epsilon — preserving "must_include" intent loosely while letting
 * the algorithm do its job.
 */
async function applyMustIncludes(
  env: Env,
  deck: DeckEntry[],
  baselineCost: number,
  mustInclude: string[],
  commander: CommanderRef,
): Promise<{ deck: DeckEntry[]; cost: number; warnings: string[] }> {
  const warnings: string[] = [];
  const inDeck = new Set(deck.map((entry) => entry.card_name.toLowerCase()));
  const toAdd = mustInclude.filter((name) => !inDeck.has(name.toLowerCase()));
  if (toAdd.length === 0) return { deck, cost: baselineCost, warnings };

  const prices = await resolveCardPrices(env, toAdd);
  let cost = baselineCost;

  for (const name of toAdd) {
    // Prefer swapping out a basic land — free, no role coverage loss.
    let swappedOut: string | null = null;
    for (const entry of deck) {
      if (BASIC_LAND_NAMES.has(entry.card_name) && (entry.quantity ?? 1) > 0) {
        swappedOut = entry.card_name;
        break;
      }
    }
    if (swappedOut === null) {
      // No basics available — fall back to the last non-commander, non-basic
      // card. This is a baseline filler; the upgrade loop would target it
      // anyway. Walk in reverse so the most-recently added baseline card
      // (likely the lowest-priority filler) is consumed first.
      const commanderLower = commander.name.toLowerCase();
      for (let i = deck.length - 1; i >= 0; i--) {
        const entry = deck[i]!;
        if (entry.card_name.toLowerCase() === commanderLower) continue;
        if (BASIC_LAND_NAMES.has(entry.card_name)) continue;
        swappedOut = entry.card_name;
        break;
      }
    }
    if (swappedOut === null) {
      warnings.push(
        `must_include "${name}": no swap target found in baseline.`,
      );
      continue;
    }

    decrementCard(deck, swappedOut, commander);
    incrementCard(deck, name);

    const newPrice = prices.prices.get(name.toLowerCase())?.price ?? 0;
    cost += newPrice;
  }
  return { deck, cost, warnings };
}

/**
 * sumNonBasicCost computes the total tcgplayer price of all non-basic cards
 * in the deck (basics are free). Used to compute baseline_cost for a precon.
 */
async function sumNonBasicCost(env: Env, deck: DeckEntry[]): Promise<number> {
  const nonBasicNames = deck
    .filter((entry) => !BASIC_LAND_NAMES.has(entry.card_name))
    .map((entry) => entry.card_name);
  if (nonBasicNames.length === 0) return 0;
  const prices = await resolveCardPrices(env, nonBasicNames);
  let total = 0;
  for (const entry of deck) {
    if (BASIC_LAND_NAMES.has(entry.card_name)) continue;
    const price = prices.prices.get(entry.card_name.toLowerCase())?.price;
    if (price != null) total += price * (entry.quantity ?? 1);
  }
  return total;
}
