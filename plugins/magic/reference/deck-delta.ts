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
 *
 * Combo-value scoring and the combined Δ wrapper come in M7.3.
 */
import type { Env } from "../../../worker/src/types";
import type { CommanderRef, DeckEntry } from "./deck-quality";
import { COMMUNITY_BENCHMARKS } from "./deck-quality";

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
 * roleCoverage queries magic_card_roles for the deck's cards, counts each
 * core role, and returns sigmoid-scored coverage per role.
 */
export async function roleCoverage(
  env: Env,
  deck: DeckEntry[],
  _commander: CommanderRef,
): Promise<RoleCoverage> {
  const roleCounts = await countRolesForDeck(env, deck);
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
 * loadRolesByCard returns Map<lowercase_card_name, Set<role>>.
 */
async function loadRolesByCard(
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
