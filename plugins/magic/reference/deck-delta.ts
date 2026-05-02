/**
 * deck-delta — primitives for the marginal-utility Δquality scoring formula
 * used by the upgrade loop in commander_deckbuild.
 *
 * Provides:
 *   - logCommanderSynergy: log of EDHREC synergy(card | commander), bounded
 *     to [-5, 5]. The Δ formula uses this for both commander-synergy and
 *     deck-synergy terms (proxy: deck-synergy ≈ |D| × commanderSynergy until
 *     pairwise card co-occurrence data ships in a future M7.X).
 *   - roleCoverage: plateau-with-decay sigmoid scoring across the four
 *     core roles (ramp, card_draw, removal, win_conditions). Returns per-
 *     role scores in [0, 1].
 *   - deltaRoleCoverage: change in summed role coverage when swapping
 *     cards in/out of a deck.
 *   - comboValue: per-commander combo scoring. Each combo with k of n
 *     cards present contributes (k/n)^0.5 for partial completion, or a
 *     large constant B for complete combos.
 *   - deltaComboValue: change in summed combo value after a swap.
 *   - deltaQuality: combined Δ wrapper that the upgrade loop calls per
 *     swap candidate. Combines synergy + role + combo terms.
 */
import type { Env } from "../../../worker/src/types";
import type { CommanderRef, DeckEntry } from "./deck-quality";
import { COMMUNITY_BENCHMARKS } from "./deck-quality";
import { safeParseJSON } from "../../../worker/src/reference/json";

// Sharpness of the role-coverage sigmoid. At this value, count=lower maps to
// ~0.018, count=midpoint to 0.5, count=upper to ~0.982. Steep enough to hit
// the test's >0.95 / <0.05 thresholds at the bounds, while still producing a
// meaningful gradient inside the band.
const SIGMOID_SHARPNESS = 4;

// Bound for log(synergy). Real EDHREC synergy values rarely exceed ±100 in
// absolute terms; the bound clamps adversarial or pathological inputs.
const LOG_BOUND = 5;

export interface RoleCoverage {
  ramp: number;
  card_draw: number;
  removal: number;
  win_conditions: number;
}

// Mapping from RoleCoverage keys to magic_card_roles role tag values. The
// composition library uses plural keys (win_conditions, boardwipes); the
// role tag table uses singular tags (win_condition, boardwipe).
const ROLE_TAG: Record<keyof RoleCoverage, string> = {
  ramp: "ramp",
  card_draw: "card_draw",
  removal: "removal",
  win_conditions: "win_condition",
};

interface synergyRow {
  synergy: number;
}

interface roleRow {
  front_face_name: string;
  role: string;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * signedLog returns sign(x) · log(1 + |x|). Symmetric around 0; handles
 * negative inputs (regular log can't). Clamped to ±LOG_BOUND.
 */
function signedLog(x: number): number {
  const raw = Math.sign(x) * Math.log(1 + Math.abs(x));
  if (raw > LOG_BOUND) return LOG_BOUND;
  if (raw < -LOG_BOUND) return -LOG_BOUND;
  return raw;
}

/**
 * coverageScore maps a role's card count to [0, 1] via plateau-with-decay
 * sigmoid keyed on community benchmark bounds. Below `lower` the score
 * stays near 0; above `upper` it stays near 1; transitions sharply across
 * the band so adding/removing the marginal card inside [lower, upper]
 * produces a meaningful Δ.
 */
function coverageScore(count: number, lower: number, upper: number): number {
  const midpoint = (lower + upper) / 2;
  const halfWidth = Math.max(1, (upper - lower) / 2);
  return sigmoid((SIGMOID_SHARPNESS * (count - midpoint)) / halfWidth);
}

/**
 * logCommanderSynergy returns signedLog of the EDHREC synergy column from
 * magic_edh_recommendations for (commander, card). Returns 0 when the card
 * has no recommendation row (treated as neutral). Output is bounded to
 * [-5, 5] via signedLog's clamp.
 */
export async function logCommanderSynergy(
  env: Env,
  commander: CommanderRef,
  card: string,
): Promise<number> {
  const result = await env.DB.prepare(
    `SELECT MAX(synergy) AS synergy FROM magic_edh_recommendations
       WHERE commander_id = ? AND LOWER(card_name) = LOWER(?)`,
  )
    .bind(commander.scryfall_id, card)
    .all<synergyRow>();
  const row = result.results?.[0];
  if (!row || row.synergy === null) return 0;
  return signedLog(row.synergy);
}

/**
 * roleCoverage queries magic_card_roles for the deck's cards (or uses a
 * precomputed role map when supplied), counts each core role, and returns
 * sigmoid-scored coverage per role. Hot-path callers should always
 * supply `rolesByCard` to avoid a DB round-trip per call.
 */
export async function roleCoverage(
  env: Env,
  deck: DeckEntry[],
  _commander: CommanderRef,
  rolesByCard?: Map<string, Set<string>>,
): Promise<RoleCoverage> {
  const roleCounts = rolesByCard
    ? countRolesFromMap(
        deck.map((entry) => entry.card_name),
        rolesByCard,
      )
    : await countRolesForDeck(env, deck);
  return {
    ramp: coverageScore(
      roleCounts.get(ROLE_TAG.ramp) ?? 0,
      ...COMMUNITY_BENCHMARKS.ramp,
    ),
    card_draw: coverageScore(
      roleCounts.get(ROLE_TAG.card_draw) ?? 0,
      ...COMMUNITY_BENCHMARKS.card_draw,
    ),
    removal: coverageScore(
      roleCounts.get(ROLE_TAG.removal) ?? 0,
      ...COMMUNITY_BENCHMARKS.removal,
    ),
    win_conditions: coverageScore(
      roleCounts.get(ROLE_TAG.win_conditions) ?? 0,
      ...COMMUNITY_BENCHMARKS.win_conditions,
    ),
  };
}

/**
 * deltaRoleCoverage returns the change in summed role coverage (across the
 * four core roles) when `cardsOut` are removed from `deck` and `cardsIn`
 * are added. Positive = coverage improved.
 */
export async function deltaRoleCoverage(
  env: Env,
  deck: DeckEntry[],
  cardsOut: string[],
  cardsIn: string[],
  _commander: CommanderRef,
): Promise<number> {
  // Resolve roles for every card name in play (deck + out + in) in a single
  // query so we can score before/after configurations without re-querying.
  const allNames = new Set<string>();
  for (const entry of deck) allNames.add(entry.card_name.toLowerCase());
  for (const name of cardsOut) allNames.add(name.toLowerCase());
  for (const name of cardsIn) allNames.add(name.toLowerCase());

  const rolesByCard = await loadRolesByCard(env, [...allNames]);

  // Count distinct cards per role for the baseline deck.
  const beforeCounts = countRolesFromMap(
    deck.map((e) => e.card_name),
    rolesByCard,
  );
  const beforeSum = sumCoverage(beforeCounts);

  // Apply the swap: drop cardsOut, add cardsIn (no duplicates within same role —
  // a swapped-in card already in the deck has no effect on role count).
  const afterDeck = new Set<string>(deck.map((e) => e.card_name.toLowerCase()));
  for (const name of cardsOut) afterDeck.delete(name.toLowerCase());
  for (const name of cardsIn) afterDeck.add(name.toLowerCase());
  const afterCounts = countRolesFromMap([...afterDeck], rolesByCard);
  const afterSum = sumCoverage(afterCounts);

  return afterSum - beforeSum;
}

async function countRolesForDeck(
  env: Env,
  deck: DeckEntry[],
): Promise<Map<string, number>> {
  const names = deck.map((entry) => entry.card_name.toLowerCase());
  const rolesByCard = await loadRolesByCard(env, names);
  return countRolesFromMap(
    deck.map((e) => e.card_name),
    rolesByCard,
  );
}

/**
 * loadRolesByCard returns Map<lowercase_card_name, Set<role>>. Exported so
 * callers in deck-completion.ts can share a single role lookup across
 * helpers (e.g. precomputed once per upgrade-loop iteration to keep
 * deltaQualityCached pure).
 */
export async function loadRolesByCard(
  env: Env,
  names: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (names.length === 0) return out;
  const CHUNK = 90;
  const lowerNames = names.map((n) => n.toLowerCase());
  for (let i = 0; i < lowerNames.length; i += CHUNK) {
    const slice = lowerNames.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `SELECT front_face_name, role FROM magic_card_roles
         WHERE LOWER(front_face_name) IN (${placeholders})`,
    )
      .bind(...slice)
      .all<roleRow>();
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

function countRolesFromMap(
  cardNames: string[],
  rolesByCard: Map<string, Set<string>>,
): Map<string, number> {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const name of cardNames) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const roles = rolesByCard.get(key);
    if (!roles) continue;
    for (const role of roles) {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }
  return counts;
}

function sumCoverage(counts: Map<string, number>): number {
  return (
    coverageScore(
      counts.get(ROLE_TAG.ramp) ?? 0,
      ...COMMUNITY_BENCHMARKS.ramp,
    ) +
    coverageScore(
      counts.get(ROLE_TAG.card_draw) ?? 0,
      ...COMMUNITY_BENCHMARKS.card_draw,
    ) +
    coverageScore(
      counts.get(ROLE_TAG.removal) ?? 0,
      ...COMMUNITY_BENCHMARKS.removal,
    ) +
    coverageScore(
      counts.get(ROLE_TAG.win_conditions) ?? 0,
      ...COMMUNITY_BENCHMARKS.win_conditions,
    )
  );
}

// ── Combo scoring ──────────────────────────────────────────────────

const PARTIAL_COMBO_EXPONENT = 0.5;
const COMPLETE_COMBO_BONUS = 5;

interface comboCardsRow {
  combo_id: string;
  card_names: string;
}

interface ComboLine {
  id: string;
  cards: string[];
}

export async function loadCombosForCommander(
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
    if (cards.length < 2) continue; // a 1-card combo is not a combo
    out.push({ id: row.combo_id, cards });
  }
  return out;
}

/**
 * scoreCombo: 0 if no combo cards present; (k/n)^p for partial completion;
 * COMPLETE_COMBO_BONUS for full completion.
 */
function scoreCombo(deckSet: Set<string>, comboCards: string[]): number {
  let present = 0;
  for (const name of comboCards) {
    if (deckSet.has(name.toLowerCase())) present += 1;
  }
  if (present === 0) return 0;
  if (present === comboCards.length) return COMPLETE_COMBO_BONUS;
  return Math.pow(present / comboCards.length, PARTIAL_COMBO_EXPONENT);
}

/**
 * comboValue sums combo scores across this commander's combos. Each combo
 * contributes (k/n)^0.5 for partial presence (0 < k < n) or
 * COMPLETE_COMBO_BONUS for full completion (k == n).
 */
export async function comboValue(
  env: Env,
  deck: DeckEntry[],
  commander: CommanderRef,
): Promise<number> {
  const combos = await loadCombosForCommander(env, commander.scryfall_id);
  const deckSet = new Set(deck.map((entry) => entry.card_name.toLowerCase()));
  let total = 0;
  for (const combo of combos) total += scoreCombo(deckSet, combo.cards);
  return total;
}

/**
 * deltaComboValue returns the change in summed combo value when removing
 * `cardsOut` from `deck` and adding `cardsIn`. Single combo lookup feeds
 * before/after scoring.
 */
export async function deltaComboValue(
  env: Env,
  deck: DeckEntry[],
  cardsOut: string[],
  cardsIn: string[],
  commander: CommanderRef,
): Promise<number> {
  const combos = await loadCombosForCommander(env, commander.scryfall_id);
  const beforeSet = new Set(deck.map((entry) => entry.card_name.toLowerCase()));
  const afterSet = new Set(beforeSet);
  for (const name of cardsOut) afterSet.delete(name.toLowerCase());
  for (const name of cardsIn) afterSet.add(name.toLowerCase());
  let before = 0;
  let after = 0;
  for (const combo of combos) {
    before += scoreCombo(beforeSet, combo.cards);
    after += scoreCombo(afterSet, combo.cards);
  }
  return after - before;
}

// ── Combined Δquality wrapper ──────────────────────────────────────

export interface DeltaWeights {
  /** w_inc: coefficient on Δlog(commander synergy) for the cards being swapped. */
  commander_synergy: number;
  /**
   * Effective coefficient on the deck-synergy term (w_syn × |D|). In the
   * proxy regime, deck-synergy ≈ logCommanderSynergy of the swapped card,
   * so this value adds to commander_synergy. When pairwise data ships, this
   * becomes a separate signal.
   */
  deck_synergy: number;
  /** w_role: coefficient on ΔRoleCoverage. */
  role_coverage: number;
  /** w_combo: coefficient on ΔComboValue. */
  combo_value: number;
}

export const DEFAULT_DELTA_WEIGHTS: DeltaWeights = {
  commander_synergy: 1,
  deck_synergy: 1,
  role_coverage: 2,
  combo_value: 3,
};

/**
 * deltaQuality is the combined Δ formula evaluated by the upgrade loop per
 * swap candidate. Positive return value means the swap improves the deck.
 *
 * Formula (in the proxy regime — deck-synergy uses commander-synergy as a
 * stand-in until pairwise card co-occurrence data ships):
 *   Δ = (w_inc + w_syn) · [Σ logCS(cardsIn) − Σ logCS(cardsOut)]
 *     + w_role  · ΔRoleCoverage(deck, cardsOut, cardsIn)
 *     + w_combo · ΔComboValue(deck, cardsOut, cardsIn)
 *
 * The Δquality term from Epic Requirement 5 (assessQuality vector) is
 * deferred. Its composition vector overlaps with ΔRoleCoverage (double-
 * counting), and computing it per swap requires multiple D1 queries.
 *
 * **Hot-path callers should use `deltaQualityCached`** (pure function,
 * no DB access). This async variant re-fetches everything per call and is
 * O(swap-count × queries-per-swap); on a typical iteration that's >10k DB
 * round-trips, blowing past Cloudflare Workers' subrequest cap. The async
 * version is retained for unit-test convenience and ad-hoc scoring.
 */
export async function deltaQuality(
  env: Env,
  deck: DeckEntry[],
  cardsOut: string[],
  cardsIn: string[],
  commander: CommanderRef,
  weights: DeltaWeights = DEFAULT_DELTA_WEIGHTS,
): Promise<number> {
  const [synergyOutValues, synergyInValues, roleDelta, comboDelta] =
    await Promise.all([
      Promise.all(cardsOut.map((c) => logCommanderSynergy(env, commander, c))),
      Promise.all(cardsIn.map((c) => logCommanderSynergy(env, commander, c))),
      deltaRoleCoverage(env, deck, cardsOut, cardsIn, commander),
      deltaComboValue(env, deck, cardsOut, cardsIn, commander),
    ]);
  const synergyOut = synergyOutValues.reduce((sum, v) => sum + v, 0);
  const synergyIn = synergyInValues.reduce((sum, v) => sum + v, 0);
  const synergyDelta = synergyIn - synergyOut;
  const synergyCoeff = weights.commander_synergy + weights.deck_synergy;
  return (
    synergyCoeff * synergyDelta +
    weights.role_coverage * roleDelta +
    weights.combo_value * comboDelta
  );
}

// ── Cached / pure-function primitives for hot-path use ─────────────

/**
 * ScoringContext is the precomputed bundle the upgrade loop loads ONCE
 * per iteration and reuses across all swap evaluations. With this in
 * hand, deltaQualityCached has zero DB access — it's pure CPU, scoring
 * thousands of candidate swaps in milliseconds rather than blowing past
 * Workers' subrequest cap.
 */
export interface ScoringContext {
  /** Map<lowercased card name, signedLog(synergy)>. 0 for cards without
   *  a recommendation row (treated as neutral). */
  synergyByCard: Map<string, number>;
  /** Map<lowercased card name, set of role tags>. Empty set / missing
   *  entry both mean "no role tags". */
  rolesByCard: Map<string, Set<string>>;
  /** Combo lines for this commander. */
  combos: ComboLine[];
}

/**
 * loadScoringContext fetches synergy + roles + combos for the universe
 * of cards the upgrade loop will see. Pass the union of (initial deck
 * cards ∪ candidate pool) — the upgrade loop only swaps within that
 * universe, so the context never goes stale across iterations.
 *
 * Three D1 queries total (one for synergies, one chunked for roles,
 * one for combos). Combos are commander-scoped and don't depend on
 * names.
 */
export async function loadScoringContext(
  env: Env,
  commander: CommanderRef,
  cardNames: string[],
): Promise<ScoringContext> {
  const [synergyByCard, rolesByCard, combos] = await Promise.all([
    loadSynergiesByCard(env, commander.scryfall_id, cardNames),
    loadRolesByCard(env, cardNames),
    loadCombosForCommander(env, commander.scryfall_id),
  ]);
  return { synergyByCard, rolesByCard, combos };
}

interface synergyByCardRow {
  card_name: string;
  synergy: number;
}

/**
 * loadSynergiesByCard batch-fetches signedLog(synergy) for every card
 * in `names`. Cards without a recommendation row map to 0 (neutral).
 */
async function loadSynergiesByCard(
  env: Env,
  commanderId: string,
  names: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (names.length === 0) return out;
  const unique = [...new Set(names.map((n) => n.toLowerCase()))];
  const CHUNK = 90;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `SELECT card_name, MAX(synergy) AS synergy
         FROM magic_edh_recommendations
         WHERE commander_id = ? AND LOWER(card_name) IN (${placeholders})
         GROUP BY card_name`,
    )
      .bind(commanderId, ...slice)
      .all<synergyByCardRow>();
    for (const row of result.results ?? []) {
      out.set(row.card_name.toLowerCase(), signedLog(row.synergy));
    }
  }
  // Cards not in the result set get 0 (neutral) implicitly via
  // `out.get(...) ?? 0` at call sites.
  return out;
}

/**
 * logCommanderSynergyCached is the pure-function counterpart to
 * `logCommanderSynergy`. Returns 0 for unknown cards (matching the
 * async version's missing-row default).
 */
export function logCommanderSynergyCached(
  ctx: ScoringContext,
  card: string,
): number {
  return ctx.synergyByCard.get(card.toLowerCase()) ?? 0;
}

/**
 * deltaRoleCoverageCached is the pure-function counterpart to
 * `deltaRoleCoverage`. Operates on the precomputed rolesByCard map.
 */
export function deltaRoleCoverageCached(
  deck: DeckEntry[],
  cardsOut: string[],
  cardsIn: string[],
  rolesByCard: Map<string, Set<string>>,
): number {
  const beforeCounts = countRolesFromMap(
    deck.map((entry) => entry.card_name),
    rolesByCard,
  );
  const beforeSum = sumCoverage(beforeCounts);

  const afterDeck = new Set<string>(
    deck.map((entry) => entry.card_name.toLowerCase()),
  );
  for (const name of cardsOut) afterDeck.delete(name.toLowerCase());
  for (const name of cardsIn) afterDeck.add(name.toLowerCase());
  const afterCounts = countRolesFromMap([...afterDeck], rolesByCard);
  const afterSum = sumCoverage(afterCounts);

  return afterSum - beforeSum;
}

/**
 * deltaComboValueCached is the pure-function counterpart to
 * `deltaComboValue`. Operates on the precomputed combos list.
 */
export function deltaComboValueCached(
  deck: DeckEntry[],
  cardsOut: string[],
  cardsIn: string[],
  combos: ComboLine[],
): number {
  const beforeSet = new Set(deck.map((entry) => entry.card_name.toLowerCase()));
  const afterSet = new Set(beforeSet);
  for (const name of cardsOut) afterSet.delete(name.toLowerCase());
  for (const name of cardsIn) afterSet.add(name.toLowerCase());
  let before = 0;
  let after = 0;
  for (const combo of combos) {
    before += scoreCombo(beforeSet, combo.cards);
    after += scoreCombo(afterSet, combo.cards);
  }
  return after - before;
}

/**
 * deltaQualityCached is the pure-function counterpart to `deltaQuality`.
 * Used by upgradeDeck on the hot inner loop — zero DB access; scoring
 * runs at memory speed.
 */
export function deltaQualityCached(
  deck: DeckEntry[],
  cardsOut: string[],
  cardsIn: string[],
  ctx: ScoringContext,
  weights: DeltaWeights = DEFAULT_DELTA_WEIGHTS,
): number {
  let synergyOut = 0;
  for (const name of cardsOut) {
    synergyOut += logCommanderSynergyCached(ctx, name);
  }
  let synergyIn = 0;
  for (const name of cardsIn) {
    synergyIn += logCommanderSynergyCached(ctx, name);
  }
  const synergyDelta = synergyIn - synergyOut;
  const synergyCoeff = weights.commander_synergy + weights.deck_synergy;
  const roleDelta = deltaRoleCoverageCached(
    deck,
    cardsOut,
    cardsIn,
    ctx.rolesByCard,
  );
  const comboDelta = deltaComboValueCached(deck, cardsOut, cardsIn, ctx.combos);
  return (
    synergyCoeff * synergyDelta +
    weights.role_coverage * roleDelta +
    weights.combo_value * comboDelta
  );
}
