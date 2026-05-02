/**
 * deck-quality — shared scoring library for Commander deck quality.
 *
 * This is the single source of truth for the `quality` block both
 * commander_deckbuild and commander_deck_review return. The library is
 * built in layers:
 *
 *   M2.1: assessBracket — WotC bracket placement (1-5).
 *   M2.2: assessComposition — counts vs benchmarks (lands, ramp, draw, …).
 *   M2.3: aggregateScore — 0-100 weighted, gated on calibration.
 *   M3:   completion + Karsten validation + combo-aware cuts (consumers).
 *
 * The library is pure: no Worker bindings beyond Env (D1). Each layer is
 * independently testable; the integration in M4/M5 just wires the pieces.
 */
import type { Env } from "../../../worker/src/types";
import { safeParseJSON } from "../../../worker/src/reference/json";

export interface DeckEntry {
  card_name: string;
  quantity?: number;
}

export interface CommanderRef {
  scryfall_id: string;
  name: string;
}

export interface ComboMatch {
  combo_id: string;
  card_names: string[];
  results: string[];
}

export interface BracketAssessment {
  tier: 1 | 2 | 3 | 4 | 5;
  reasons: string[];
  rationale: string;
  signals: {
    game_changers: string[];
    infinite_combos: ComboMatch[];
    mld_cards: string[];
    extra_turn_cards: string[];
  };
}

interface comboRow {
  combo_id: string;
  card_names: string;
  results: string;
}

interface namedRow {
  card_name: string;
}

interface roleRow {
  front_face_name: string;
}

/**
 * assessBracket places a deck on the WotC Commander bracket scale (1-5)
 * using only authoritative signals: the Game Changers list, EDHREC's
 * pre-mapped 2-card combos, mass-land-denial role tags, and extra-turn
 * role tags. No price-based or vibes-based heuristics — bracket is a
 * structural classification, not a power estimate.
 *
 * Floor rules (anchored to WotC's Feb 2026 framework):
 *   - any Game Changer present → at least 3
 *   - any matched combo → at least 3 (multiple → 4)
 *   - any MLD card → at least 4
 *   - 2+ extra-turn cards → at least 4
 *   - density of multiple top-tier signals → 5 (cEDH)
 */
export async function assessBracket(
  env: Env,
  deck: DeckEntry[],
  commander: CommanderRef,
): Promise<BracketAssessment> {
  const deckLower = new Set(deck.map((c) => c.card_name.toLowerCase()));

  const [gcRes, comboRes, mldRes, extraTurnRes] = await Promise.all([
    env.DB.prepare(`SELECT card_name FROM magic_game_changers`).all<namedRow>(),
    env.DB
      .prepare(
        `SELECT combo_id, card_names, results FROM magic_edh_combos WHERE commander_id = ?`,
      )
      .bind(commander.scryfall_id)
      .all<comboRow>(),
    env.DB
      .prepare(
        `SELECT DISTINCT front_face_name FROM magic_card_roles WHERE role = 'land_destruction'`,
      )
      .all<roleRow>(),
    env.DB
      .prepare(
        `SELECT DISTINCT front_face_name FROM magic_card_roles WHERE role = 'extra_turn'`,
      )
      .all<roleRow>(),
  ]);

  const gcs = (gcRes.results ?? [])
    .map((r) => r.card_name)
    .filter((n) => deckLower.has(n.toLowerCase()));
  const mlds = (mldRes.results ?? [])
    .map((r) => r.front_face_name)
    .filter((n) => deckLower.has(n.toLowerCase()));
  const extraTurns = (extraTurnRes.results ?? [])
    .map((r) => r.front_face_name)
    .filter((n) => deckLower.has(n.toLowerCase()));

  // Combo matches: every card in the combo's card_names list must be in the
  // deck. Empty combos (data drift) are ignored.
  const combos: ComboMatch[] = [];
  for (const row of comboRes.results ?? []) {
    const names = safeParseJSON<string[]>(row.card_names, []);
    if (names.length === 0) continue;
    const allPresent = names.every((n) => deckLower.has(n.toLowerCase()));
    if (allPresent) {
      combos.push({
        combo_id: row.combo_id,
        card_names: names,
        results: safeParseJSON<string[]>(row.results, []),
      });
    }
  }

  let tier: 1 | 2 | 3 | 4 | 5 = 1;
  const reasons: string[] = [];

  if (gcs.length > 0) {
    tier = bumpTier(tier, 3);
    const preview = gcs.slice(0, 3).join(", ") + (gcs.length > 3 ? ", …" : "");
    reasons.push(
      `${gcs.length} Game Changer${gcs.length > 1 ? "s" : ""} present (${preview}); WotC criteria floor at Bracket 3.`,
    );
  }

  if (combos.length > 0) {
    tier = bumpTier(tier, 3);
    if (combos.length >= 2) {
      tier = bumpTier(tier, 4);
    }
    reasons.push(
      `${combos.length} 2-card combo${combos.length > 1 ? "s" : ""} present (${combos.map((c) => c.card_names.join(" + ")).slice(0, 2).join("; ")}${combos.length > 2 ? "; …" : ""}).`,
    );
  }

  if (mlds.length > 0) {
    tier = bumpTier(tier, 4);
    const preview = mlds.slice(0, 3).join(", ") + (mlds.length > 3 ? ", …" : "");
    reasons.push(
      `Mass land destruction (${preview}); WotC criteria floor at Bracket 4.`,
    );
  }

  if (extraTurns.length >= 2) {
    tier = bumpTier(tier, 4);
    reasons.push(
      `${extraTurns.length} extra-turn cards (${extraTurns.slice(0, 3).join(", ")}${extraTurns.length > 3 ? ", …" : ""}); high-power signal.`,
    );
  }

  // cEDH detection: heavy density of multiple top-tier signals together.
  // GC count ≥5 + combo count ≥1 + (MLD or 2+ extra turns) → tier 5.
  const heavySignals =
    (gcs.length >= 4 ? 1 : 0) +
    (combos.length >= 1 ? 1 : 0) +
    (mlds.length >= 1 || extraTurns.length >= 2 ? 1 : 0);
  if (heavySignals >= 3) {
    tier = 5;
    reasons.push(
      `Multiple top-tier signals stacked (Game Changers + combos + MLD/extra-turns) → cEDH (Bracket 5).`,
    );
  }

  return {
    tier,
    reasons,
    rationale: buildRationale(tier, gcs.length, combos.length, mlds.length, extraTurns.length),
    signals: {
      game_changers: gcs,
      infinite_combos: combos,
      mld_cards: mlds,
      extra_turn_cards: extraTurns,
    },
  };
}

function bumpTier(
  current: 1 | 2 | 3 | 4 | 5,
  floor: 1 | 2 | 3 | 4 | 5,
): 1 | 2 | 3 | 4 | 5 {
  return (current >= floor ? current : floor) as 1 | 2 | 3 | 4 | 5;
}

function buildRationale(
  tier: number,
  gcCount: number,
  comboCount: number,
  mldCount: number,
  extraTurnCount: number,
): string {
  if (tier === 1) {
    return "No Game Changers, infinite combos, mass land destruction, or extra-turn density detected. Casual / precon-tier deck (Bracket 1).";
  }
  if (tier === 2) {
    return "Light optimization signals but no bracket-critical cards. Upgraded casual (Bracket 2).";
  }
  if (tier === 3) {
    const driver =
      gcCount > 0
        ? `${gcCount} Game Changer${gcCount > 1 ? "s" : ""}`
        : `${comboCount} combo${comboCount > 1 ? "s" : ""}`;
    return `${driver} present. Mid-power optimized (Bracket 3).`;
  }
  if (tier === 4) {
    const drivers: string[] = [];
    if (mldCount > 0) drivers.push(`mass land destruction (${mldCount})`);
    if (extraTurnCount >= 2) drivers.push(`extra-turn density (${extraTurnCount})`);
    if (comboCount >= 2) drivers.push(`${comboCount} combos`);
    if (gcCount >= 4) drivers.push(`${gcCount} Game Changers`);
    return `High-power signals: ${drivers.join(", ")}. Bracket 4.`;
  }
  // tier 5
  return `Heavy density of optimization signals (${gcCount} Game Changers, ${comboCount} combos, ${mldCount} MLD, ${extraTurnCount} extra-turn). cEDH-shape (Bracket 5).`;
}

// ─── M2.2: composition assessment ────────────────────────────────────

export interface CompositionRole {
  count: number;
  target_range: [number, number];
  target_source: "tier_derived" | "community_benchmark";
  status: "low" | "ok" | "high";
  cards: string[];
}

export interface CompositionAssessment {
  lands: CompositionRole;
  ramp: CompositionRole;
  card_draw: CompositionRole;
  removal: CompositionRole;
  win_conditions: CompositionRole;
  boardwipes: CompositionRole;
  tutors: CompositionRole;
}

/**
 * Community-consensus benchmarks per role. Anchored to widely-cited EDH
 * deckbuilding guidelines (Cardsphere, CoolStuffInc, TappedOut). Used as
 * fallback when no tier-average data exists for a commander.
 */
const COMMUNITY_BENCHMARKS: Record<keyof CompositionAssessment, [number, number]> = {
  lands: [36, 38],
  ramp: [10, 12],
  card_draw: [8, 10],
  removal: [8, 10],
  win_conditions: [7, 10],
  boardwipes: [1, 3],
  tutors: [0, 4], // tutors aren't required; high count signals optimization
};

/**
 * Tolerance for tier-derived target ranges: ±20% of the tier-average count,
 * minimum ±2 to avoid degenerate single-value bands on small counts.
 */
function tierTolerance(count: number): [number, number] {
  const span = Math.max(2, Math.round(count * 0.2));
  return [Math.max(0, count - span), count + span];
}

interface tierDeckRow {
  card_name: string;
  category: string;
  quantity: number;
}

interface roleLookupRow {
  front_face_name: string;
  role: string;
}

interface typeLineRow {
  front_face_name: string;
  type_line: string;
}

/**
 * assessComposition classifies a deck's role distribution against either
 * the commander's tier-average composition (preferred when available) or
 * community-consensus benchmarks (fallback). Returns per-role counts plus
 * a low/ok/high status for each.
 *
 * Tier-derived targets capture commander-specific reality — a mono-red
 * goblin tribal deck doesn't need 12 ramp; a cEDH list often runs <30
 * lands. Generic benchmarks miss those edge cases.
 */
export async function assessComposition(
  env: Env,
  deck: DeckEntry[],
  commander: CommanderRef,
  tier?: string,
): Promise<CompositionAssessment> {
  const deckCardNames = deck.map((c) => c.card_name);

  // Single D1 query each: roles for all deck cards, type_lines for all deck
  // cards (lands aren't role-tagged so we identify them via type_line).
  const [roleMap, typeMap] = await Promise.all([
    loadRolesForCards(env, deckCardNames),
    loadTypeLinesForCards(env, deckCardNames),
  ]);

  // Bucket cards into roles. count = sum of quantities (matters for
  // basic lands which appear with quantity 5-32); cards = distinct names.
  const buckets = {
    lands: makeBucket(),
    ramp: makeBucket(),
    card_draw: makeBucket(),
    removal: makeBucket(),
    win_conditions: makeBucket(),
    boardwipes: makeBucket(),
    tutors: makeBucket(),
  };

  for (const entry of deck) {
    const lower = entry.card_name.toLowerCase();
    const qty = entry.quantity ?? 1;
    const roles = roleMap.get(lower) ?? new Set<string>();
    if (roles.has("ramp")) addToBucket(buckets.ramp, entry.card_name, qty);
    if (roles.has("card_draw")) addToBucket(buckets.card_draw, entry.card_name, qty);
    if (roles.has("removal")) addToBucket(buckets.removal, entry.card_name, qty);
    if (roles.has("boardwipe")) addToBucket(buckets.boardwipes, entry.card_name, qty);
    if (roles.has("tutor")) addToBucket(buckets.tutors, entry.card_name, qty);
    if (roles.has("win_condition")) addToBucket(buckets.win_conditions, entry.card_name, qty);
    const typeLine = typeMap.get(lower) ?? "";
    if (typeLine.includes("Land")) addToBucket(buckets.lands, entry.card_name, qty);
  }

  // Resolve targets: tier-derived if commander has a tier average, else
  // fall back to community benchmarks.
  let targets = COMMUNITY_BENCHMARKS;
  let targetSource: "tier_derived" | "community_benchmark" = "community_benchmark";
  if (tier) {
    const derived = await deriveTierTargets(env, commander.scryfall_id, tier);
    if (derived) {
      targets = derived;
      targetSource = "tier_derived";
    }
  }

  return {
    lands: buildRole(buckets.lands, targets.lands, targetSource),
    ramp: buildRole(buckets.ramp, targets.ramp, targetSource),
    card_draw: buildRole(buckets.card_draw, targets.card_draw, targetSource),
    removal: buildRole(buckets.removal, targets.removal, targetSource),
    win_conditions: buildRole(buckets.win_conditions, targets.win_conditions, targetSource),
    boardwipes: buildRole(buckets.boardwipes, targets.boardwipes, targetSource),
    tutors: buildRole(buckets.tutors, targets.tutors, targetSource),
  };
}

function makeBucket(): { count: number; cards: string[] } {
  return { count: 0, cards: [] };
}

function addToBucket(
  b: { count: number; cards: string[] },
  name: string,
  qty: number,
): void {
  b.count += qty;
  if (!b.cards.includes(name)) b.cards.push(name);
}

function buildRole(
  bucket: { count: number; cards: string[] },
  range: [number, number],
  source: "tier_derived" | "community_benchmark",
): CompositionRole {
  let status: "low" | "ok" | "high" = "ok";
  if (bucket.count < range[0]) status = "low";
  else if (bucket.count > range[1]) status = "high";
  return {
    count: bucket.count,
    target_range: range,
    target_source: source,
    status,
    cards: bucket.cards,
  };
}

/**
 * loadRolesForCards looks up every role tag for each card name in the
 * input. D1's bind-parameter limit caps each query at 90 names; longer
 * decks chunk transparently.
 */
async function loadRolesForCards(
  env: Env,
  cardNames: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (cardNames.length === 0) return out;
  const CHUNK = 90;
  for (let i = 0; i < cardNames.length; i += CHUNK) {
    const slice = cardNames.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const result = await env.DB
      .prepare(
        `SELECT DISTINCT front_face_name, role FROM magic_card_roles WHERE LOWER(front_face_name) IN (${placeholders})`,
      )
      .bind(...slice.map((n) => n.toLowerCase()))
      .all<roleLookupRow>();
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

async function loadTypeLinesForCards(
  env: Env,
  cardNames: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (cardNames.length === 0) return out;
  const CHUNK = 90;
  for (let i = 0; i < cardNames.length; i += CHUNK) {
    const slice = cardNames.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const result = await env.DB
      .prepare(
        `SELECT front_face_name, type_line FROM magic_cards WHERE LOWER(front_face_name) IN (${placeholders}) AND is_default = 1`,
      )
      .bind(...slice.map((n) => n.toLowerCase()))
      .all<typeLineRow>();
    for (const row of result.results ?? []) {
      out.set(row.front_face_name.toLowerCase(), row.type_line ?? "");
    }
  }
  return out;
}

/**
 * deriveTierTargets joins the commander's tier-average decklist with role
 * tags and counts cards per role. Returns target ranges per role with a
 * tier-derived tolerance band, OR null if no tier average exists for this
 * commander/tier pair.
 */
async function deriveTierTargets(
  env: Env,
  commanderId: string,
  tier: string,
): Promise<Record<keyof CompositionAssessment, [number, number]> | null> {
  const tierResult = await env.DB
    .prepare(
      `SELECT card_name, category, quantity FROM magic_edh_average_decks_by_tier
       WHERE commander_id = ? AND tier = ?`,
    )
    .bind(commanderId, tier)
    .all<tierDeckRow>();
  const tierRows = tierResult.results ?? [];
  if (tierRows.length === 0) return null;

  // Look up roles for the tier's card list.
  const tierCardNames = tierRows.map((r) => r.card_name);
  const roleMap = await loadRolesForCards(env, tierCardNames);

  // Tally tier counts per role bucket. Lands count via category since the
  // tier table tags basics + lands explicitly (no type_line lookup needed
  // for tier-deriving — magic_edh_average_decks_by_tier already separates).
  const counts: Record<keyof CompositionAssessment, number> = {
    lands: 0,
    ramp: 0,
    card_draw: 0,
    removal: 0,
    win_conditions: 0,
    boardwipes: 0,
    tutors: 0,
  };
  for (const row of tierRows) {
    const cat = row.category.toLowerCase();
    if (cat === "lands" || cat === "basics" || cat === "land") {
      counts.lands += row.quantity;
    }
    const roles = roleMap.get(row.card_name.toLowerCase()) ?? new Set<string>();
    if (roles.has("ramp")) counts.ramp += 1;
    if (roles.has("card_draw")) counts.card_draw += 1;
    if (roles.has("removal")) counts.removal += 1;
    if (roles.has("win_condition")) counts.win_conditions += 1;
    if (roles.has("boardwipe")) counts.boardwipes += 1;
    if (roles.has("tutor")) counts.tutors += 1;
  }

  return {
    lands: tierTolerance(counts.lands),
    ramp: tierTolerance(counts.ramp),
    card_draw: tierTolerance(counts.card_draw),
    removal: tierTolerance(counts.removal),
    win_conditions: tierTolerance(counts.win_conditions),
    boardwipes: tierTolerance(counts.boardwipes),
    tutors: tierTolerance(counts.tutors),
  };
}
