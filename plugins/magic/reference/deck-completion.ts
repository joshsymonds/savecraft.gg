/**
 * deck-completion — pad a tier shell to a legal 100-card Commander deck.
 *
 * The commander_deckbuild greedy fill produces a 67-89 card "shell" matching
 * the EDHREC tier average. This module takes that shell + the commander +
 * budget/exclude options and returns a 99-non-commander deck that:
 *
 *   1. Fills role gaps from magic_edh_recommendations (high-inclusion picks
 *      ranked by EDHREC popularity, filtered by role).
 *   2. Tops up remaining slots with generic high-inclusion recommendations.
 *   3. Pads with basic lands distributed proportionally to the deck's pip
 *      distribution (Karsten-aware mana base — colors with more spells get
 *      more basics).
 *   4. Surfaces karsten_swaps + warnings when the resulting mana base is
 *      under-supplied for any color the deck wants to cast.
 *
 * Per the epic Requirement 7: a deck cannot be declared complete without
 * Karsten validation passing. We don't fail-stop on a thin mana base; we
 * surface it as a warning so the caller can either accept or re-run with
 * different inputs.
 */
import type { Env } from "../../../worker/src/types";
import type { CommanderRef, DeckEntry } from "./deck-quality";
import { assessComposition } from "./deck-quality";
import { resolveCardPrices } from "./commander-prices";
import { safeParseJSON } from "../../../worker/src/reference/json";

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

const COLOR_TO_BASIC: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

interface recRow {
  card_name: string;
  inclusion: number;
}

interface commanderColorRow {
  color_identity: string;
}

interface manaRow {
  front_face_name: string;
  mana_cost: string;
  type_line: string;
  produced_mana: string;
}

/**
 * completeDeck pads `shell` to `options.targetSize` (default 99) using a
 * three-phase strategy: role-gap fill from recommendations, generic
 * high-inclusion top-up, then basic-land padding distributed by pip
 * proportion. Honors max_price (ceiling), excludes, and excludeGameChangers
 * across all phases — basics are exempt from those filters since they're
 * the floor of any mana base.
 */
export async function completeDeck(
  env: Env,
  shell: DeckEntry[],
  commander: CommanderRef,
  options: CompletionOptions = {},
): Promise<CompletionResult> {
  const target = options.targetSize ?? 99;
  const maxPrice = options.maxPrice;
  const excludesLower = new Set(
    (options.excludes ?? []).map((x) => x.toLowerCase()),
  );
  const excludeGCs = options.excludeGameChangers ?? false;
  const warnings: string[] = [];
  const addedRecs: AddedCard[] = [];
  const addedBasics: AddedBasic[] = [];
  const karstenSwaps: KarstenSwap[] = []; // populated by future Karsten-swap pass; recorded for traceability

  // Working copy of the shell. Card names are tracked case-insensitively to
  // match the rest of the pipeline; output preserves the input casing.
  const filled: DeckEntry[] = shell.map((e) => ({ ...e }));
  const inDeck = new Set(filled.map((e) => e.card_name.toLowerCase()));

  // Resolve current spend so budget filters can subtract.
  let currentSpend = 0;
  if (maxPrice !== undefined) {
    const prices = await resolveCardPrices(
      env,
      filled.map((e) => e.card_name),
    );
    for (const e of filled) {
      const lower = e.card_name.toLowerCase();
      const price = prices.prices.get(lower)?.price;
      if (price != null) currentSpend += price * (e.quantity ?? 1);
    }
  }

  // Game-changer filter set, if applicable. Query the full list once;
  // the table's small enough (~53 rows) that this is cheaper than
  // checking each candidate individually.
  let gameChangers = new Set<string>();
  if (excludeGCs) {
    const gcResult = await env.DB.prepare(
      `SELECT card_name FROM magic_game_changers`,
    ).all<{ card_name: string }>();
    gameChangers = new Set(
      (gcResult.results ?? []).map((r) => r.card_name.toLowerCase()),
    );
  }

  // ── Phase 1: role-gap fill ──────────────────────────────────
  const compInitial = await assessComposition(
    env,
    filled,
    commander,
    options.tier,
  );
  const lowRoles = listLowRoles(compInitial);
  if (lowRoles.length === 0 && filled.length < target) {
    warnings.push(
      `No 'low' role gaps in shell — completion goes straight to high-inclusion top-up.`,
    );
  }

  for (const role of lowRoles) {
    if (countCards(filled) >= target) break;
    // Cap role-fill at target_range upper bound. Without this, Phase 1 keeps
    // adding role-tagged cards from the recommendation pool until either the
    // total deck size or budget is exhausted — overshooting the structural
    // target by 2-3x in observed cases (Edgar Markov $500: ramp went 22 vs
    // target 7-11). The role-gap fill should bring a "low" role up to "ok",
    // not past "high".
    const roleData = (compInitial as unknown as Record<string, { count: number; target_range: [number, number] }>)[role];
    const upperBound = roleData?.target_range?.[1] ?? Infinity;
    let currentRoleCount = roleData?.count ?? 0;
    if (currentRoleCount >= upperBound) continue; // already at upper bound — skip
    const candidates = await fetchRecommendationsForRole(
      env,
      commander.scryfall_id,
      role,
    );
    if (candidates.length === 0) {
      warnings.push(
        `No recommendations available for role '${role}' on this commander; gap unfilled.`,
      );
      continue;
    }
    let added = 0;
    for (const cand of candidates) {
      if (countCards(filled) >= target) break;
      if (currentRoleCount >= upperBound) break;
      const lower = cand.card_name.toLowerCase();
      if (inDeck.has(lower)) continue;
      if (excludesLower.has(lower)) continue;
      if (excludeGCs && gameChangers.has(lower)) continue;
      const price = await getCardPrice(env, cand.card_name);
      if (
        maxPrice !== undefined &&
        price != null &&
        currentSpend + price > maxPrice
      )
        continue;
      filled.push({ card_name: cand.card_name, quantity: 1 });
      inDeck.add(lower);
      addedRecs.push({
        card_name: cand.card_name,
        reason: "fill_role_gap",
        role,
        inclusion: cand.inclusion,
        price,
      });
      if (price != null) currentSpend += price;
      currentRoleCount += 1;
      added += 1;
    }
    if (added === 0) {
      warnings.push(
        `Couldn't add any '${role}' cards (filtered out by excludes/budget/in-deck).`,
      );
    }
  }

  // ── Phase 2: high-inclusion top-up ──────────────────────────
  if (countCards(filled) < target) {
    const generic = await fetchAllRecommendations(env, commander.scryfall_id);
    for (const cand of generic) {
      if (countCards(filled) >= target) break;
      const lower = cand.card_name.toLowerCase();
      if (inDeck.has(lower)) continue;
      if (excludesLower.has(lower)) continue;
      if (excludeGCs && gameChangers.has(lower)) continue;
      const price = await getCardPrice(env, cand.card_name);
      if (
        maxPrice !== undefined &&
        price != null &&
        currentSpend + price > maxPrice
      )
        continue;
      filled.push({ card_name: cand.card_name, quantity: 1 });
      inDeck.add(lower);
      addedRecs.push({
        card_name: cand.card_name,
        reason: "high_inclusion_fill",
        inclusion: cand.inclusion,
        price,
      });
      if (price != null) currentSpend += price;
    }
  }

  // ── Phase 3: basic-land padding (Karsten-proportional) ──────
  if (countCards(filled) < target) {
    const slotsRemaining = target - countCards(filled);
    const colorIdentity = await loadColorIdentity(env, commander.scryfall_id);
    const pipDist = await computePipDistribution(env, filled);
    const basicAlloc = allocateBasics(slotsRemaining, colorIdentity, pipDist);
    for (const [name, qty] of basicAlloc) {
      const existing = filled.find((e) => e.card_name === name);
      if (existing) {
        existing.quantity = (existing.quantity ?? 1) + qty;
      } else {
        filled.push({ card_name: name, quantity: qty });
      }
      addedBasics.push({ name, quantity: qty });
    }
  }

  // ── Phase 4: Karsten coverage check ──────────────────────────
  // Count colored sources in the final deck against the deck's pip
  // distribution. Surface warnings where a color is under-supplied (Karsten
  // recommends ≥13 sources for {C} pip cost cards by turn N).
  const finalPips = await computePipDistribution(env, filled);
  const finalSources = await countColoredSources(env, filled);
  for (const [color, pipCount] of finalPips) {
    if (pipCount === 0) continue;
    const sources = finalSources.get(color) ?? 0;
    // Heuristic threshold: 13 sources is Karsten's general floor for
    // single-pip costs. Less is OK only for very low-pip-count splash colors.
    if (sources < 13) {
      warnings.push(
        `Mana base thin for {${color}}: ${String(sources)} sources for ${String(pipCount)} pips. Karsten recommends ≥13 sources for single-pip 1-drop spells; consider more lands of this color.`,
      );
    }
  }

  // ── Final verification ───────────────────────────────────────
  const finalTotal = countCards(filled);
  if (finalTotal < target) {
    warnings.push(
      `Could not reach ${String(target)} cards; ended at ${String(finalTotal)}. Consider raising max_price or relaxing excludes.`,
    );
  } else if (finalTotal > target) {
    warnings.push(
      `Padded past target — ${String(finalTotal)} > ${String(target)}. (Should not happen; report a bug.)`,
    );
  }

  return {
    filled,
    added_from_recommendations: addedRecs,
    added_basics: addedBasics,
    karsten_swaps: karstenSwaps,
    warnings,
  };
}

function countCards(deck: DeckEntry[]): number {
  let total = 0;
  for (const e of deck) total += e.quantity ?? 1;
  return total;
}

function listLowRoles(
  comp: Awaited<ReturnType<typeof assessComposition>>,
): string[] {
  const roles: string[] = [];
  if (comp.lands.status === "low") roles.push("lands");
  if (comp.ramp.status === "low") roles.push("ramp");
  if (comp.card_draw.status === "low") roles.push("card_draw");
  if (comp.removal.status === "low") roles.push("removal");
  if (comp.win_conditions.status === "low") roles.push("win_condition");
  // boardwipes / tutors are bonus signals, not gap-fillable from raw role
  // recommendations alone — leave for higher-level passes.
  return roles;
}

/**
 * fetchRecommendationsForRole returns candidates for a specific role,
 * sorted by inclusion DESC. JOINs magic_edh_recommendations against
 * magic_card_roles since EDHREC's category labels don't map directly to
 * our role taxonomy.
 */
async function fetchRecommendationsForRole(
  env: Env,
  commanderId: string,
  role: string,
): Promise<{ card_name: string; inclusion: number }[]> {
  const result = await env.DB.prepare(
    `SELECT DISTINCT r.card_name AS card_name, MAX(r.inclusion) AS inclusion
       FROM magic_edh_recommendations r
       JOIN magic_card_roles cr ON LOWER(r.card_name) = LOWER(cr.front_face_name)
       WHERE r.commander_id = ? AND cr.role = ?
       GROUP BY r.card_name
       ORDER BY inclusion DESC
       LIMIT 100`,
  )
    .bind(commanderId, role)
    .all<recRow>();
  return result.results ?? [];
}

async function fetchAllRecommendations(
  env: Env,
  commanderId: string,
): Promise<{ card_name: string; inclusion: number }[]> {
  const result = await env.DB.prepare(
    `SELECT card_name, MAX(inclusion) AS inclusion
       FROM magic_edh_recommendations
       WHERE commander_id = ?
       GROUP BY card_name
       ORDER BY inclusion DESC
       LIMIT 200`,
  )
    .bind(commanderId)
    .all<recRow>();
  return result.results ?? [];
}

async function getCardPrice(
  env: Env,
  cardName: string,
): Promise<number | null> {
  const r = await resolveCardPrices(env, [cardName]);
  return r.prices.get(cardName.toLowerCase())?.price ?? null;
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
