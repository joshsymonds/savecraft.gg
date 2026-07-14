/**
 * MTG Arena play_advisor — native reference module.
 *
 * Compares player gameplay against population baselines from 17Lands
 * Premier Draft replay data. Works for all formats — advice is card-intrinsic
 * but statistical baselines reflect Limited play patterns.
 *
 * 5 query modes: mana_efficiency, card_timing, attack_analysis, mulligan, game_review.
 * Dual input: match_id lookup (post-game review) or direct game state (hypothetical/live).
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { deriveFormat, deriveLimitedSet } from "../../../worker/src/magic/format";
import { resolveAliases } from "./alias";

// Alias resolution is only used in mulligan mode (which queries magic_cards for
// card metadata like cmc/type_line). Other modes (card_timing, attack_analysis,
// game_review) query 17Lands stats tables that only contain canonical card names,
// so alias-named cards simply won't have play statistics — this is expected.

// ── Types ────────────────────────────────────────────────────

interface CardTimingRow {
  card_name: string;
  turn_number: number;
  times_deployed: number;
  games_won: number;
  total_games: number;
}

interface TempoRow {
  turn_number: number;
  mana_spent_bucket: number;
  games_won: number;
  total_games: number;
}

interface CombatRow {
  attacker_name: string;
  turn_number: number;
  user_creatures_count: number;
  oppo_creatures_count: number;
  attacked: number;
  games_won: number;
  total_games: number;
}

interface MulliganRow {
  land_count: number;
  nonland_cmc_bucket: string;
  num_mulligans: number;
  games_won: number;
  total_games: number;
}

interface BaselineRow {
  turn_number: number;
  total_mana_spent: number;
  total_creatures_cast: number;
  total_spells_cast: number;
  total_creatures_attacked: number;
  total_attacks_possible: number;
  games_won: number;
  total_games: number;
}

interface TurnInput {
  turn: number;
  mana_spent?: number;
  cards_played?: string[];
  creatures_attacked?: string[];
  user_creatures?: number;
  oppo_creatures?: number;
}

// ── Constants ────────────────────────────────────────────────

const MAX_CARDS = 50;
const MAX_TURNS = 30;
const MAX_HAND = 7;
const MAX_CREATURES_PER_TURN = 20;

// ── Helpers ──────────────────────────────────────────────────

function wr(wins: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((wins / total) * 1000) / 1000;
}

function disclaimerText(format: string | undefined): string | undefined {
  if (!format || format === "PremierDraft") return undefined;
  const safeFormat = String(format).slice(0, 50);
  return `Baselines from Premier Draft replay data — advice may not reflect ${safeFormat} meta.`;
}

// ── Archetype resolution ─────────────────────────────────────

/** Probe D1 once to check if a specific archetype has data. Returns the archetype to use. */
async function resolveArchetype(
  env: Env,
  table: string,
  set: string,
  archetype: string,
): Promise<string> {
  if (archetype === "ALL") return "ALL";
  const probe = await env.DB.prepare(
    `SELECT 1 FROM ${table} WHERE set_code = ? AND archetype = ? LIMIT 1`,
  )
    .bind(set, archetype)
    .first();
  return probe ? archetype : "ALL";
}

// ── Set resolution ───────────────────────────────────────────
//
// `set` is optional in every mode. Resolution order:
//   1. explicit query.set → source "explicit"
//   2. a Limited event's derived set, if it has baseline data → source "event"
//      (only reachable when a match_id lookup loaded an eventId — currently
//      game_review is the only mode that does this)
//   3. the set with the most total_games in magic_play_turn_baselines →
//      source "fallback"
// If magic_play_turn_baselines is empty, resolution fails outright: there is
// no baseline data to advise against regardless of mode.

type SetResolution =
  | { set: string; source: "explicit" | "event" | "fallback" }
  | { error: string };

// The fallback set (most total_games in magic_play_turn_baselines) only
// changes on a data reimport (monthly), but resolveSet's fallback branch is
// a full-table aggregation hit on every request across all five modes that
// omit `set`. Cache the positive result per isolate with a short TTL —
// negative results (no baseline data loaded at all) are never cached, since
// D1 starts empty in tests/fresh deploys and callers must see the real
// error once data lands rather than a stale cached failure.
const FALLBACK_SET_TTL_MS = 5 * 60 * 1000;
let fallbackSetCache: { value: string; expiresAt: number } | null = null;

/** Test-only reset seam for fallbackSetCache. */
export function resetPlayAdvisorCaches(): void {
  fallbackSetCache = null;
}

async function resolveSet(
  env: Env,
  explicitSet: string | undefined,
  eventId: string | undefined,
): Promise<SetResolution> {
  if (explicitSet) {
    return { set: explicitSet, source: "explicit" };
  }

  if (eventId) {
    const limitedSet = deriveLimitedSet(eventId);
    if (limitedSet) {
      const probe = await env.DB.prepare(
        `SELECT 1 FROM magic_play_turn_baselines WHERE set_code = ? LIMIT 1`,
      )
        .bind(limitedSet)
        .first();
      if (probe) {
        return { set: limitedSet, source: "event" };
      }
    }
  }

  if (fallbackSetCache && fallbackSetCache.expiresAt > Date.now()) {
    return { set: fallbackSetCache.value, source: "fallback" };
  }

  const fallback = await env.DB.prepare(
    `SELECT set_code FROM magic_play_turn_baselines
     GROUP BY set_code ORDER BY SUM(total_games) DESC LIMIT 1`,
  ).first<{ set_code: string }>();

  if (!fallback) {
    return {
      error:
        "Error: play statistics aren't loaded yet — no baseline data is available for any set. Pass an explicit set to try anyway.",
    };
  }

  fallbackSetCache = {
    value: fallback.set_code,
    expiresAt: Date.now() + FALLBACK_SET_TTL_MS,
  };
  return { set: fallback.set_code, source: "fallback" };
}

// ── Cross-set card timing ────────────────────────────────────
//
// When the resolved set wasn't explicit, a single-set card_timing lookup
// returns near-zero coverage for Constructed/Brawl decks (which span many
// sets). Instead, look up each card across all sets (archetype ALL only)
// and use whichever set has the most total_games for that specific card.

async function crossSetCardTiming(
  env: Env,
  cards: string[],
): Promise<Map<string, { setCode: string; rows: CardTimingRow[] }>> {
  const result = new Map<string, { setCode: string; rows: CardTimingRow[] }>();
  if (cards.length === 0) return result;

  const placeholders = cards.map(() => "?").join(", ");
  const rows = await env.DB.prepare(
    `SELECT card_name, set_code, turn_number, times_deployed, games_won, total_games
     FROM magic_play_card_timing
     WHERE archetype = 'ALL' AND card_name IN (${placeholders})
     ORDER BY card_name, set_code, turn_number`,
  )
    .bind(...cards)
    .all<CardTimingRow & { set_code: string }>();

  const bySetPerCard = new Map<string, Map<string, CardTimingRow[]>>();
  for (const r of rows.results) {
    let setMap = bySetPerCard.get(r.card_name);
    if (!setMap) {
      setMap = new Map();
      bySetPerCard.set(r.card_name, setMap);
    }
    const existing = setMap.get(r.set_code) ?? [];
    existing.push(r);
    setMap.set(r.set_code, existing);
  }

  for (const [card, setMap] of bySetPerCard) {
    let bestSet: string | undefined;
    let bestTotal = -1;
    for (const [setCode, setRows] of setMap) {
      const total = setRows.reduce((sum, r) => sum + r.total_games, 0);
      if (total > bestTotal) {
        bestTotal = total;
        bestSet = setCode;
      }
    }
    if (bestSet) {
      result.set(card, { setCode: bestSet, rows: setMap.get(bestSet)! });
    }
  }

  return result;
}

// ── Query: card_timing ───────────────────────────────────────

async function cardTiming(
  query: Record<string, unknown>,
  env: Env,
): Promise<ReferenceResult> {
  const rawCards = (query.cards as string[])?.slice(0, MAX_CARDS) ?? [];
  const archetype = (query.archetype as string) ?? "ALL";
  const format = query.format as string | undefined;
  const explicitSet = query.set as string | undefined;

  if (rawCards.length === 0) {
    return {
      type: "text",
      content: "Error: card_timing requires a cards parameter.",
    };
  }

  const resolution = await resolveSet(env, explicitSet, undefined);
  if ("error" in resolution) {
    return { type: "text", content: resolution.error };
  }
  const { set, source: setSource } = resolution;
  const useCrossSet = setSource !== "explicit";

  const byCard = new Map<string, CardTimingRow[]>();
  const crossSetByCard = useCrossSet
    ? await crossSetCardTiming(env, rawCards)
    : undefined;

  // crossSetCardTiming hardcodes archetype = 'ALL' — reported below as
  // effective_archetype so a caller passing a specific archetype (e.g. "UB")
  // on the cross-set path can tell it silently got ALL-archetype data.
  let effectiveArchetype = "ALL";

  if (!useCrossSet) {
    const arch = await resolveArchetype(
      env,
      "magic_play_card_timing",
      set,
      archetype,
    );
    effectiveArchetype = arch;
    const placeholders = rawCards.map(() => "?").join(", ");
    const rows = await env.DB.prepare(
      `SELECT card_name, turn_number, times_deployed, games_won, total_games
       FROM magic_play_card_timing
       WHERE set_code = ? AND archetype = ? AND card_name IN (${placeholders})
       ORDER BY card_name, turn_number`,
    )
      .bind(set, arch, ...rawCards)
      .all<CardTimingRow>();

    for (const r of rows.results) {
      const existing = byCard.get(r.card_name) ?? [];
      existing.push(r);
      byCard.set(r.card_name, existing);
    }
  }

  const cardsWithData = new Set<string>();
  const cards = [];

  for (const card of rawCards) {
    const cardRows = useCrossSet
      ? crossSetByCard!.get(card)?.rows
      : byCard.get(card);
    if (!cardRows || cardRows.length === 0) continue;
    cardsWithData.add(card);

    let bestTurn = 0;
    let bestWR = 0;
    for (const r of cardRows) {
      const w = wr(r.games_won, r.total_games);
      if (w > bestWR) {
        bestWR = w;
        bestTurn = r.turn_number;
      }
    }

    cards.push({
      card_name: card,
      ...(useCrossSet ? { set_code: crossSetByCard!.get(card)!.setCode } : {}),
      best_turn: bestTurn,
      best_win_rate: bestWR,
      turns: cardRows.map((r) => ({
        turn: r.turn_number,
        times_deployed: r.times_deployed,
        win_rate: wr(r.games_won, r.total_games),
        total_games: r.total_games,
      })),
    });
  }

  return {
    type: "structured",
    data: {
      disclaimer: disclaimerText(format),
      baseline_set: set,
      set_source: setSource,
      effective_archetype: effectiveArchetype,
      cards,
      coverage: { found: cardsWithData.size, total: rawCards.length },
    },
  };
}

// ── Query: mana_efficiency ───────────────────────────────────

async function manaEfficiency(
  query: Record<string, unknown>,
  env: Env,
): Promise<ReferenceResult> {
  const archetype = (query.archetype as string) ?? "ALL";
  const onPlay = query.on_play === true ? 1 : 0;
  const turns = (
    (query.turns as { turn: number; mana_spent: number }[]) ?? []
  ).slice(0, MAX_TURNS);
  const format = query.format as string | undefined;
  const explicitSet = query.set as string | undefined;

  if (turns.length === 0) {
    return {
      type: "text",
      content: "Error: mana_efficiency requires a turns parameter.",
    };
  }

  const resolution = await resolveSet(env, explicitSet, undefined);
  if ("error" in resolution) {
    return { type: "text", content: resolution.error };
  }
  const { set, source: setSource } = resolution;

  const arch = await resolveArchetype(env, "magic_play_tempo", set, archetype);
  const turnNums = turns.map((t) => t.turn);
  const turnPlaceholders = turnNums.map(() => "?").join(", ");

  const tempoRows = await env.DB.prepare(
    `SELECT turn_number, mana_spent_bucket, games_won, total_games
     FROM magic_play_tempo
     WHERE set_code = ? AND archetype = ? AND on_play = ? AND turn_number IN (${turnPlaceholders})`,
  )
    .bind(set, arch, onPlay, ...turnNums)
    .all<TempoRow>();

  const baselineRows = await env.DB.prepare(
    `SELECT turn_number, total_mana_spent, games_won, total_games
     FROM magic_play_turn_baselines
     WHERE set_code = ? AND archetype = ? AND on_play = ? AND turn_number IN (${turnPlaceholders})`,
  )
    .bind(set, arch, onPlay, ...turnNums)
    .all<BaselineRow>();

  const tempoByTurnBucket = new Map<string, TempoRow>();
  for (const r of tempoRows.results) {
    tempoByTurnBucket.set(`${r.turn_number}:${r.mana_spent_bucket}`, r);
  }
  const baselineByTurn = new Map<number, BaselineRow>();
  for (const r of baselineRows.results) {
    baselineByTurn.set(r.turn_number, r);
  }

  const turnResults = [];

  for (const t of turns) {
    const bucket = Math.min(5, Math.max(0, Math.round(t.mana_spent)));
    const row = tempoByTurnBucket.get(`${t.turn}:${bucket}`);
    const baseline = baselineByTurn.get(t.turn);

    const bucketWR = row ? wr(row.games_won, row.total_games) : null;
    const avgWR = baseline
      ? wr(baseline.games_won, baseline.total_games)
      : null;

    let rating = "—";
    let avgMana: number | null = null;
    if (baseline && baseline.total_games > 0) {
      avgMana =
        Math.round((baseline.total_mana_spent / baseline.total_games) * 100) /
        100;
      if (t.mana_spent >= avgMana * 0.9) rating = "Good";
      else if (t.mana_spent >= avgMana * 0.5) rating = "Low";
      else rating = "Wasted";
    }

    turnResults.push({
      turn: t.turn,
      mana_spent: t.mana_spent,
      bucket,
      bucket_win_rate: bucketWR,
      avg_win_rate: avgWR,
      avg_mana: avgMana,
      rating,
    });
  }

  return {
    type: "structured",
    data: {
      disclaimer: disclaimerText(format),
      baseline_set: set,
      set_source: setSource,
      turns: turnResults,
    },
  };
}

// ── Query: attack_analysis ───────────────────────────────────

interface AttackTurnInput {
  turn: number;
  creatures: string[];
  attacked: string[];
  user_creatures: number;
  oppo_creatures: number;
}

async function attackAnalysis(
  query: Record<string, unknown>,
  env: Env,
): Promise<ReferenceResult> {
  const turns = ((query.turns as AttackTurnInput[]) ?? []).slice(0, MAX_TURNS);
  const format = query.format as string | undefined;
  const explicitSet = query.set as string | undefined;

  if (turns.length === 0) {
    return {
      type: "text",
      content: "Error: attack_analysis requires a turns parameter.",
    };
  }

  const resolution = await resolveSet(env, explicitSet, undefined);
  if ("error" in resolution) {
    return { type: "text", content: resolution.error };
  }
  const { set, source: setSource } = resolution;

  const allCreatureNames = new Set<string>();
  for (const t of turns) {
    for (const c of (t.creatures ?? []).slice(0, MAX_CREATURES_PER_TURN)) {
      allCreatureNames.add(c);
    }
  }

  const creatureList = [...allCreatureNames];
  let combatData: CombatRow[] = [];
  if (creatureList.length > 0) {
    const placeholders = creatureList.map(() => "?").join(", ");
    const result = await env.DB.prepare(
      `SELECT attacker_name, turn_number, user_creatures_count, oppo_creatures_count, attacked, games_won, total_games
       FROM magic_play_combat
       WHERE set_code = ? AND attacker_name IN (${placeholders})`,
    )
      .bind(set, ...creatureList)
      .all<CombatRow>();
    combatData = result.results;
  }

  const combatIndex = new Map<string, CombatRow>();
  for (const r of combatData) {
    combatIndex.set(
      `${r.attacker_name}:${r.turn_number}:${r.user_creatures_count}:${r.oppo_creatures_count}:${r.attacked}`,
      r,
    );
  }

  const creaturesWithData = new Set<string>();
  const turnResults = [];

  for (const t of turns) {
    const userC = Math.min(4, Math.max(0, t.user_creatures));
    const oppoC = Math.min(4, Math.max(0, t.oppo_creatures));
    const attackedSet = new Set(t.attacked);

    const creatureResults = [];

    for (const creature of (t.creatures ?? []).slice(
      0,
      MAX_CREATURES_PER_TURN,
    )) {
      const didAttack = attackedSet.has(creature);
      const attackRow = combatIndex.get(
        `${creature}:${t.turn}:${userC}:${oppoC}:1`,
      );
      const holdRow = combatIndex.get(
        `${creature}:${t.turn}:${userC}:${oppoC}:0`,
      );

      if (!attackRow && !holdRow) {
        creatureResults.push({
          creature,
          action: didAttack ? "attacked" : "held",
          has_data: false,
          correct: null as boolean | null,
          best_action: null as string | null,
          attack_win_rate: null as number | null,
          hold_win_rate: null as number | null,
        });
        continue;
      }
      creaturesWithData.add(creature);

      const attackWR = attackRow
        ? wr(attackRow.games_won, attackRow.total_games)
        : 0;
      const holdWR = holdRow ? wr(holdRow.games_won, holdRow.total_games) : 0;
      const bestAction = attackWR > holdWR ? "attack" : "hold";
      const playerAction = didAttack ? "attacked" : "held";
      const correctAction = bestAction === "attack" ? "attacked" : "held";

      creatureResults.push({
        creature,
        action: playerAction,
        has_data: true,
        correct: playerAction === correctAction,
        best_action: bestAction,
        attack_win_rate: attackWR,
        hold_win_rate: holdWR,
      });
    }

    turnResults.push({
      turn: t.turn,
      user_creatures: t.user_creatures,
      oppo_creatures: t.oppo_creatures,
      creatures: creatureResults,
    });
  }

  return {
    type: "structured",
    data: {
      disclaimer: disclaimerText(format),
      baseline_set: set,
      set_source: setSource,
      turns: turnResults,
      coverage: { found: creaturesWithData.size, total: allCreatureNames.size },
    },
  };
}

// ── Query: mulligan ──────────────────────────────────────────

async function mulligan(
  query: Record<string, unknown>,
  env: Env,
): Promise<ReferenceResult> {
  const archetype = (query.archetype as string) ?? "ALL";
  const onPlay = query.on_play === true ? 1 : 0;
  const hand = ((query.hand as string[]) ?? []).slice(0, MAX_HAND);
  const format = query.format as string | undefined;
  const explicitSet = query.set as string | undefined;

  if (hand.length === 0) {
    return {
      type: "text",
      content: "Error: mulligan requires a hand parameter.",
    };
  }

  const resolution = await resolveSet(env, explicitSet, undefined);
  if ("error" in resolution) {
    return { type: "text", content: resolution.error };
  }
  const { set, source: setSource } = resolution;

  const arch = await resolveArchetype(
    env,
    "magic_play_mulligan",
    set,
    archetype,
  );

  const ph = hand.map(() => "?").join(", ");
  const cardRows = await env.DB.prepare(
    `SELECT front_face_name AS name, cmc, type_line FROM magic_cards
     WHERE is_default = 1 AND front_face_name COLLATE NOCASE IN (${ph})`,
  )
    .bind(...hand)
    .all<{ name: string; cmc: number; type_line: string }>();

  const cardInfo = new Map<string, { cmc: number; isLand: boolean }>();
  for (const r of cardRows.results) {
    cardInfo.set(r.name, {
      cmc: r.cmc,
      isLand: r.type_line.includes("Land"),
    });
  }

  // Second pass: resolve unmatched hand cards via alias table.
  const unresolvedHand = hand.filter((n) => !cardInfo.has(n));
  if (unresolvedHand.length > 0) {
    const aliasRows = await resolveAliases<{
      name: string;
      cmc: number;
      type_line: string;
    }>(
      env.DB,
      unresolvedHand,
      "mc.front_face_name AS name, mc.cmc, mc.type_line",
    );
    // Map under the original hand card name (the alias) since downstream
    // code does cardInfo.get(card) with the user's input name.
    for (const unresolvedName of unresolvedHand) {
      const row = aliasRows.get(unresolvedName.toLowerCase());
      if (row) {
        cardInfo.set(unresolvedName, {
          cmc: row.cmc,
          isLand: row.type_line.includes("Land"),
        });
      }
    }
  }

  let landCount = 0;
  const nonlandCMCs: number[] = [];
  for (const card of hand) {
    const info = cardInfo.get(card);
    if (info?.isLand) {
      landCount++;
    } else {
      nonlandCMCs.push(info?.cmc ?? 2.5);
    }
  }

  const avgCMC =
    nonlandCMCs.length > 0
      ? nonlandCMCs.reduce((a, b) => a + b, 0) / nonlandCMCs.length
      : 0;
  const cmcBucket = avgCMC < 2.0 ? "low" : avgCMC <= 3.0 ? "mid" : "high";

  const keepRow = await env.DB.prepare(
    `SELECT games_won, total_games FROM magic_play_mulligan
     WHERE set_code = ? AND archetype = ? AND on_play = ? AND land_count = ? AND nonland_cmc_bucket = ? AND num_mulligans = 0`,
  )
    .bind(set, arch, onPlay, landCount, cmcBucket)
    .first<MulliganRow>();

  const mullRow = await env.DB.prepare(
    `SELECT games_won, total_games FROM magic_play_mulligan
     WHERE set_code = ? AND archetype = ? AND on_play = ? AND num_mulligans = 1`,
  )
    .bind(set, arch, onPlay)
    .first<MulliganRow>();

  const keepWR = keepRow ? wr(keepRow.games_won, keepRow.total_games) : null;
  const mullWR = mullRow ? wr(mullRow.games_won, mullRow.total_games) : null;

  let recommendation: string | null = null;
  let margin: number | null = null;
  if (keepWR !== null && mullWR !== null) {
    if (keepWR > mullWR) {
      recommendation = "KEEP";
      margin = Math.round((keepWR - mullWR) * 1000) / 10;
    } else {
      recommendation = "MULLIGAN";
      margin = Math.round((mullWR - keepWR) * 1000) / 10;
    }
  }

  return {
    type: "structured",
    data: {
      disclaimer: disclaimerText(format),
      baseline_set: set,
      set_source: setSource,
      hand_size: hand.length,
      land_count: landCount,
      cmc_bucket: cmcBucket,
      on_play: onPlay === 1,
      keep_win_rate: keepWR,
      keep_games: keepRow?.total_games ?? null,
      mulligan_win_rate: mullWR,
      mulligan_games: mullRow?.total_games ?? null,
      recommendation,
      margin_pp: margin,
    },
  };
}

// ── Section lookup: convert game section to TurnInput[] ──────
//
// `game:<matchId>` sections are stored in the "v3b compressed" shape
// (plugins/magic/parser/game_section_v3b.go is the source of truth):
//   - `cd`: cardId (stringified int) → cardName dictionary. Names may be ""
//     for cards the client never resolved a name for — always skip those
//     rather than emitting an empty-string card name.
//   - `tn`: turn snapshots. MTGA emits one snapshot per phase transition, so
//     several `tn` entries can share the same turn number `t` — they must be
//     aggregated into one logical turn.
//   - Action kind is whichever single inner key (cast/tap/move/ability/
//     damage/resolve/statMod/target) is present; there is no `type`
//     discriminator field.

interface GameSectionCastAction {
  c: number;
  m?: { k: string; n: number }[];
}

interface GameSectionMoveAction {
  c: number;
  mt: string;
  zoneFrom?: string;
  zoneTo?: string;
}

interface GameSectionDamageAction {
  src: string;
  sid: number;
  target: string;
  am: number;
  ic: boolean;
}

interface GameSectionTapAction {
  c: number;
  td: boolean;
}

interface GameSectionAbilityAction {
  c: number;
  at: string;
}

interface GameSectionResolveAction {
  c: number;
}

interface GameSectionStatModAction {
  c: number;
  pw: number;
  tf: number;
}

interface GameSectionTargetAction {
  tgs: string[];
  c?: number;
}

interface GameSectionAction {
  p: number;
  cast?: GameSectionCastAction;
  move?: GameSectionMoveAction;
  damage?: GameSectionDamageAction;
  tap?: GameSectionTapAction;
  ability?: GameSectionAbilityAction;
  resolve?: GameSectionResolveAction;
  statMod?: GameSectionStatModAction;
  target?: GameSectionTargetAction;
}

interface GameSectionPermanent {
  c: number;
  ct?: string[];
  st?: string[];
  pw?: number;
  tf?: number;
  tdb?: boolean;
  damage?: number;
}

interface GameSectionPlayer {
  s: number;
  l: number;
  manaPool?: { k: string; n: number }[];
  handCards?: unknown[];
  battlefield?: GameSectionPermanent[];
}

interface GameSectionTurn {
  t: number;
  ap: number;
  ph?: string;
  pl?: GameSectionPlayer[];
  a?: GameSectionAction[];
}

interface GameSectionData {
  matchId: string;
  cd: Record<string, string>;
  tn: GameSectionTurn[];
  end?: { w: number; r?: string; d?: string };
}

/** Basic land names (matches plugins/magic/parser/game_section_v3b.go's basicLandNames). */
const BASIC_LAND_NAMES = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
]);

export function extractTurnsFromSection(
  section: GameSectionData,
  playerSeat: number,
): TurnInput[] {
  const cd = section.cd ?? {};
  const resolveName = (cardId: number): string | undefined => {
    const name = cd[String(cardId)];
    return name ? name : undefined;
  };

  const turnMap = new Map<
    number,
    {
      manaSpent: number;
      cardsPlayed: string[];
      creaturesAttacked: string[];
      userCreatures: number;
      oppoCreatures: number;
    }
  >();

  for (const turn of section.tn) {
    if (turn.t < 1) continue; // t=0 is the pre-game/mulligan snapshot, not a real turn.

    const existing = turnMap.get(turn.t) ?? {
      manaSpent: 0,
      cardsPlayed: [],
      creaturesAttacked: [],
      userCreatures: 0,
      oppoCreatures: 0,
    };

    for (const action of turn.a ?? []) {
      if (action.p !== playerSeat) continue;

      if (action.cast) {
        const name = resolveName(action.cast.c);
        if (name) existing.cardsPlayed.push(name);
        if (action.cast.m) {
          for (const mana of action.cast.m) existing.manaSpent += mana.n;
        }
      }

      if (action.move?.mt === "play_land") {
        const name = resolveName(action.move.c);
        if (name && !BASIC_LAND_NAMES.has(name)) {
          existing.cardsPlayed.push(name);
        }
      }

      if (action.damage?.ic && action.damage.am > 0 && action.damage.src) {
        existing.creaturesAttacked.push(action.damage.src);
      }
    }

    for (const p of turn.pl ?? []) {
      // A `pl` snapshot without `battlefield` means only life/mana changed —
      // the Go compressor drops empty collections, so an omitted field here
      // means "unchanged", not "reset to zero permanents".
      if (!p.battlefield) continue;
      const creatures = p.battlefield.filter((perm) =>
        perm.ct?.includes("CardType_Creature"),
      ).length;
      if (p.s === playerSeat) {
        existing.userCreatures = creatures;
      } else {
        existing.oppoCreatures = creatures;
      }
    }

    turnMap.set(turn.t, existing);
  }

  return [...turnMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([turnNum, data]) => ({
      turn: turnNum,
      mana_spent: data.manaSpent,
      cards_played: data.cardsPlayed,
      creatures_attacked: [...new Set(data.creaturesAttacked)],
      user_creatures: data.userCreatures,
      oppo_creatures: data.oppoCreatures,
    }));
}

/**
 * Trim whitespace and strip one leading "game:" or "match:" prefix — models
 * often paste the section name itself instead of the bare match ID.
 */
function normalizeMatchId(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("game:")) return trimmed.slice("game:".length);
  if (trimmed.startsWith("match:")) return trimmed.slice("match:".length);
  return trimmed;
}

/**
 * Build a self-correcting error when a `game:<id>` section is missing: name
 * the requested section, list match_ids that DO have a game log for this
 * user, and explain why older matches may have no game log at all.
 */
async function buildGameSectionNotFoundError(
  env: Env,
  userId: string,
  gameSectionName: string,
): Promise<string> {
  const available = await env.DB.prepare(
    `SELECT sec.name FROM sections sec
     JOIN saves sv ON sv.uuid = sec.save_uuid
     WHERE sv.user_uuid = ? AND sv.game_id = 'magic' AND sec.name LIKE 'game:%'
     LIMIT 10`,
  )
    .bind(userId)
    .all<{ name: string }>();

  const availableIds = available.results.map((r) => r.name.slice("game:".length));
  const availableText =
    availableIds.length > 0
      ? `Match IDs with a game log currently available for this user: ${availableIds.join(", ")}.`
      : "No matches currently have a game log available for this user.";

  return (
    `Game section "${gameSectionName}" not found. ${availableText} ` +
    "Game logs (turn-by-turn detail) only cover matches present in the current Player.log — " +
    "MTGA truncates that log on client restart, so older matches drop out of it. Older matches " +
    "still exist as summary history (opponent, result, deck) via the match_stats module, but " +
    "without a turn-by-turn log. game_review with match_id only works for matches listed in " +
    "player_summary.games."
  );
}

interface LoadedTurns {
  turns: TurnInput[];
  eventId: string | undefined;
}

async function loadTurnsFromMatchId(
  matchId: string,
  userId: string,
  env: Env,
): Promise<LoadedTurns | string> {
  const gameSectionName = `game:${matchId}`;
  const matchSectionName = `match:${matchId}`;

  const [gameRow, matchRow] = await Promise.all([
    env.DB.prepare(
      `SELECT sec.data FROM sections sec
       JOIN saves sv ON sv.uuid = sec.save_uuid
       WHERE sv.user_uuid = ? AND sv.game_id = 'magic' AND sec.name = ?
       LIMIT 1`,
    )
      .bind(userId, gameSectionName)
      .first<{ data: string }>(),
    env.DB.prepare(
      `SELECT sec.data FROM sections sec
       JOIN saves sv ON sv.uuid = sec.save_uuid
       WHERE sv.user_uuid = ? AND sv.game_id = 'magic' AND sec.name = ?
       LIMIT 1`,
    )
      .bind(userId, matchSectionName)
      .first<{ data: string }>(),
  ]);

  if (!gameRow) {
    return buildGameSectionNotFoundError(env, userId, gameSectionName);
  }

  let playerSeat = 1;
  let eventId: string | undefined;
  if (matchRow) {
    try {
      const parsed = JSON.parse(matchRow.data) as {
        player?: { seat?: number };
        eventId?: string;
      };
      playerSeat = parsed.player?.seat ?? 1;
      eventId = parsed.eventId || undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Failed to parse match section data for ${matchId}: ${message}`;
    }
  }

  try {
    const turns = extractTurnsFromSection(
      JSON.parse(gameRow.data) as GameSectionData,
      playerSeat,
    );
    return { turns, eventId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Failed to parse game section data for ${matchId}: ${message}`;
  }
}

// ── Query: game_review ───────────────────────────────────────

interface ReviewFinding {
  turn: number;
  category: string;
  description: string;
  impact: number;
}

async function gameReview(
  query: Record<string, unknown>,
  env: Env,
): Promise<ReferenceResult> {
  const archetype = (query.archetype as string) ?? "ALL";
  const onPlay = query.on_play === true ? 1 : 0;
  let turns = query.turns as TurnInput[] | undefined;
  let format = query.format as string | undefined;
  const explicitSet = query.set as string | undefined;
  const rawMatchId = query.match_id as string | undefined;
  const userId = query.user_id as string | undefined;

  let eventId: string | undefined;

  if (rawMatchId) {
    if (!userId) {
      return {
        type: "text",
        content:
          "Error: match_id lookup requires user_id (provided automatically by MCP context).",
      };
    }
    const matchId = normalizeMatchId(rawMatchId);
    const loaded = await loadTurnsFromMatchId(matchId, userId, env);
    if (typeof loaded === "string") {
      return { type: "text", content: `Error: ${loaded}` };
    }
    turns = loaded.turns;
    eventId = loaded.eventId;
  }

  if (!turns?.length) {
    return {
      type: "text",
      content:
        "Error: game_review requires turns OR match_id parameters.",
    };
  }

  const resolution = await resolveSet(env, explicitSet, eventId);
  if ("error" in resolution) {
    return { type: "text", content: resolution.error };
  }
  const { set, source: setSource } = resolution;

  if (!format && eventId) {
    const derived = deriveFormat(eventId);
    if (derived) format = derived;
  }

  turns = turns.slice(0, MAX_TURNS);
  const arch = await resolveArchetype(
    env,
    "magic_play_turn_baselines",
    set,
    archetype,
  );

  const turnNums = turns.map((t) => t.turn);
  const turnPlaceholders = turnNums.map(() => "?").join(", ");

  const baselines = await env.DB.prepare(
    `SELECT turn_number, total_mana_spent, total_creatures_attacked, total_attacks_possible, games_won, total_games
     FROM magic_play_turn_baselines
     WHERE set_code = ? AND archetype = ? AND on_play = ? AND turn_number IN (${turnPlaceholders})`,
  )
    .bind(set, arch, onPlay, ...turnNums)
    .all<BaselineRow>();

  const baselineByTurn = new Map<number, BaselineRow>();
  for (const r of baselines.results) baselineByTurn.set(r.turn_number, r);

  const allPlayedCards = new Set<string>();
  for (const t of turns) {
    for (const c of t.cards_played ?? []) allPlayedCards.add(c);
  }

  // Constructed/Brawl decks span many sets — a single-set lookup returns
  // near-zero coverage when the baseline set wasn't explicitly chosen.
  const useCrossSet = setSource !== "explicit";
  // crossSetCardTiming hardcodes archetype = 'ALL' — reported below as
  // effective_archetype so a caller passing a specific archetype on the
  // cross-set path can tell it silently got ALL-archetype data.
  const effectiveArchetype = useCrossSet ? "ALL" : arch;
  const cardTimingMap = new Map<string, CardTimingRow[]>();
  if (allPlayedCards.size > 0) {
    const cardList = [...allPlayedCards];
    if (useCrossSet) {
      const crossSet = await crossSetCardTiming(env, cardList);
      for (const [card, entry] of crossSet) {
        cardTimingMap.set(card, entry.rows);
      }
    } else {
      const cardPlaceholders = cardList.map(() => "?").join(", ");
      const timingRows = await env.DB.prepare(
        `SELECT card_name, turn_number, games_won, total_games
         FROM magic_play_card_timing
         WHERE set_code = ? AND archetype = ? AND card_name IN (${cardPlaceholders})
         ORDER BY card_name, turn_number`,
      )
        .bind(set, arch, ...cardList)
        .all<CardTimingRow>();

      for (const r of timingRows.results) {
        const existing = cardTimingMap.get(r.card_name) ?? [];
        existing.push(r);
        cardTimingMap.set(r.card_name, existing);
      }
    }
  }

  const findings: ReviewFinding[] = [];
  const cardsWithData = new Set<string>();

  for (const t of turns) {
    const baseline = baselineByTurn.get(t.turn);
    if (baseline && baseline.total_games > 0 && t.mana_spent !== undefined) {
      const avgMana = baseline.total_mana_spent / baseline.total_games;
      const diff = avgMana - t.mana_spent;
      if (diff > 1.0) {
        findings.push({
          turn: t.turn,
          category: "Tempo",
          description: `Spent ${t.mana_spent} mana (avg: ${avgMana.toFixed(1)}). ${diff.toFixed(1)} mana wasted.`,
          impact: diff,
        });
      }
    }

    for (const card of t.cards_played ?? []) {
      allPlayedCards.add(card);
      const cardRows = cardTimingMap.get(card);
      if (!cardRows || cardRows.length === 0) continue;
      cardsWithData.add(card);

      let bestTurn = t.turn;
      let bestWR = 0;
      let currentWR = 0;
      for (const r of cardRows) {
        const w = wr(r.games_won, r.total_games);
        if (w > bestWR) {
          bestWR = w;
          bestTurn = r.turn_number;
        }
        if (r.turn_number === t.turn) currentWR = w;
      }

      const wrDiff = bestWR - currentWR;
      if (wrDiff > 0.02 && bestTurn !== t.turn) {
        findings.push({
          turn: t.turn,
          category: "Timing",
          description: `Played ${card} on turn ${t.turn} (${(currentWR * 100).toFixed(1)}% WR). Best on turn ${bestTurn} (${(bestWR * 100).toFixed(1)}% WR, +${(wrDiff * 100).toFixed(1)}pp).`,
          impact: wrDiff * 10,
        });
      }
    }

    if (
      t.creatures_attacked !== undefined &&
      t.user_creatures !== undefined &&
      t.oppo_creatures !== undefined &&
      baseline &&
      baseline.total_attacks_possible > 0
    ) {
      const avgAttackRate =
        baseline.total_creatures_attacked / baseline.total_attacks_possible;
      const playerAttackRate =
        t.user_creatures > 0
          ? (t.creatures_attacked?.length ?? 0) / t.user_creatures
          : 0;

      if (
        avgAttackRate > 0.5 &&
        playerAttackRate < 0.2 &&
        t.user_creatures > 0
      ) {
        const attackedCount = t.creatures_attacked?.length ?? 0;
        findings.push({
          turn: t.turn,
          category: "Combat",
          description: `Attacked with ${attackedCount}/${t.user_creatures} creatures (avg attack rate: ${(avgAttackRate * 100).toFixed(0)}%). Missed attacks may have cost tempo.`,
          impact: (avgAttackRate - playerAttackRate) * 3,
        });
      }
    }
  }

  findings.sort((a, b) => b.impact - a.impact);

  return {
    type: "structured",
    data: {
      disclaimer: disclaimerText(format),
      baseline_set: set,
      set_source: setSource,
      effective_archetype: effectiveArchetype,
      findings: findings.slice(0, 5).map((f) => ({
        turn: f.turn,
        category: f.category,
        description: f.description,
        impact: Math.round(f.impact * 100) / 100,
      })),
      total_findings: findings.length,
      coverage: { found: cardsWithData.size, total: allPlayedCards.size },
    },
  };
}

// ── Module definition ────────────────────────────────────────

export const playAdvisorModule: NativeReferenceModule = {
  id: "play_advisor",
  name: "Play Advisor",
  description: [
    "Gameplay analysis using per-turn statistics from 17Lands Premier Draft replay data.",
    "Works for all formats — advice is card-intrinsic but statistical baselines reflect Limited play patterns.",
    "",
    "MODES:",
    '1. mode="card_timing" → Win rate by deployment turn for specific cards. Params: cards[], set?, archetype?',
    '2. mode="mana_efficiency" → Compare mana spent per turn against archetype baselines. Params: turns[{turn, mana_spent}], set?, archetype?, on_play',
    '3. mode="attack_analysis" → Were attacks made when they should have been? Params: turns[{turn, creatures[], attacked[], user_creatures, oppo_creatures}], set?',
    '4. mode="mulligan" → Should this hand have been kept? Params: hand[], set?, archetype?, on_play',
    '5. mode="game_review" → Full post-game analysis identifying biggest deviations.',
    "   Inline: turns[{turn, mana_spent, cards_played[], creatures_attacked[], user_creatures, oppo_creatures}], set?, archetype?, on_play",
    "   Match lookup: match_id (loads game data from save sections via user_id), set?",
    "",
    "set is optional in every mode. Resolution order: an explicit set → the set of a Limited " +
      "match_id lookup's event, if it has baseline data → the set with the most recorded games " +
      "overall. The resolved set and how it was picked are reported back as baseline_set and " +
      "set_source (\"explicit\" | \"event\" | \"fallback\"). When set wasn't explicit, card_timing " +
      "and game_review look up each card's timing across all sets rather than a single set, since " +
      "Constructed/Brawl decks span many sets.",
    "",
    "All modes accept optional format parameter. Non-PremierDraft formats receive a disclaimer. " +
      "For game_review via match_id, format is auto-derived from the match's event when omitted.",
  ].join("\n"),
  parameters: {
    mode: {
      type: "string",
      description:
        'Query mode: "card_timing", "mana_efficiency", "attack_analysis", "mulligan", or "game_review".',
      required: true,
    },
    set: {
      type: "string",
      description:
        "Set code (e.g., 'FDN'). Optional — if omitted, resolved server-side from the match_id's event or the set with the most baseline data. See baseline_set/set_source in the result.",
    },
    archetype: {
      type: "string",
      description:
        "Color archetype (e.g., 'UB'). Falls back to 'ALL' if no data for specific archetype.",
    },
    format: {
      type: "string",
      description:
        "Game format. Non-PremierDraft formats receive a data source disclaimer.",
    },
    on_play: {
      type: "boolean",
      description: "Whether the player is on the play (true) or draw (false).",
    },
    cards: {
      type: "array",
      description: "Card names for card_timing mode (max 50).",
    },
    hand: {
      type: "array",
      description: "Card names in opening hand for mulligan mode (max 7).",
    },
    turns: {
      type: "array",
      description:
        "Turn data array for mana_efficiency, attack_analysis, and game_review modes (max 30).",
    },
    match_id: {
      type: "string",
      description:
        "Match ID for game_review mode. Loads game data from save sections via user_id. Only works for matches in the current Player.log — MTGA truncates it on client restart, so this covers a rolling window, not full match history (older matches are summary-only via match_stats).",
    },
  },

  example: {
    game_id: "magic",
    module: "play_advisor",
    queries: [
      {
        label: "Mulligan",
        mode: "mulligan",
        set: "FDN",
        hand: [
          "Island",
          "Island",
          "Swamp",
          "Sheoldred, the Apocalypse",
          "Cut Down",
          "Go for the Throat",
          "Consider",
        ],
      },
    ],
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const mode = String(query.mode ?? "").slice(0, 50);

    switch (mode) {
      case "card_timing":
        return cardTiming(query, env);
      case "mana_efficiency":
        return manaEfficiency(query, env);
      case "attack_analysis":
        return attackAnalysis(query, env);
      case "mulligan":
        return mulligan(query, env);
      case "game_review":
        return gameReview(query, env);
      default:
        return {
          type: "text",
          content: `Unknown mode "${mode}". Use: card_timing, mana_efficiency, attack_analysis, mulligan, game_review.`,
        };
    }
  },
};
