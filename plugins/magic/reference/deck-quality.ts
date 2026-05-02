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
