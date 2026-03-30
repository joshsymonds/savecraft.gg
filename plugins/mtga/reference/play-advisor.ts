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

// ── Query: card_timing ───────────────────────────────────────

async function cardTiming(
  query: Record<string, unknown>,
  env: Env,
): Promise<ReferenceResult> {
  const set = query.set as string;
  const rawCards = (query.cards as string[])?.slice(0, MAX_CARDS) ?? [];
  const archetype = (query.archetype as string) ?? "ALL";
  const format = query.format as string | undefined;

  if (!set || rawCards.length === 0) {
    return { type: "formatted", content: "Error: card_timing requires set and cards parameters." };
  }

  const arch = await resolveArchetype(env, "mtga_play_card_timing", set, archetype);

  const placeholders = rawCards.map(() => "?").join(", ");
  const rows = await env.DB.prepare(
    `SELECT card_name, turn_number, times_deployed, games_won, total_games
     FROM mtga_play_card_timing
     WHERE set_code = ? AND archetype = ? AND card_name IN (${placeholders})
     ORDER BY card_name, turn_number`,
  )
    .bind(set, arch, ...rawCards)
    .all<CardTimingRow>();

  const byCard = new Map<string, CardTimingRow[]>();
  for (const r of rows.results) {
    const existing = byCard.get(r.card_name) ?? [];
    existing.push(r);
    byCard.set(r.card_name, existing);
  }

  const cardsWithData = new Set<string>();
  const cards = [];

  for (const card of rawCards) {
    const cardRows = byCard.get(card);
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
  const set = query.set as string;
  const archetype = (query.archetype as string) ?? "ALL";
  const onPlay = query.on_play === true ? 1 : 0;
  const turns = ((query.turns as { turn: number; mana_spent: number }[]) ?? []).slice(0, MAX_TURNS);
  const format = query.format as string | undefined;

  if (!set || turns.length === 0) {
    return { type: "formatted", content: "Error: mana_efficiency requires set and turns parameters." };
  }

  const arch = await resolveArchetype(env, "mtga_play_tempo", set, archetype);
  const turnNums = turns.map((t) => t.turn);
  const turnPlaceholders = turnNums.map(() => "?").join(", ");

  const tempoRows = await env.DB.prepare(
    `SELECT turn_number, mana_spent_bucket, games_won, total_games
     FROM mtga_play_tempo
     WHERE set_code = ? AND archetype = ? AND on_play = ? AND turn_number IN (${turnPlaceholders})`,
  )
    .bind(set, arch, onPlay, ...turnNums)
    .all<TempoRow>();

  const baselineRows = await env.DB.prepare(
    `SELECT turn_number, total_mana_spent, games_won, total_games
     FROM mtga_play_turn_baselines
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
    const avgWR = baseline ? wr(baseline.games_won, baseline.total_games) : null;

    let rating = "—";
    let avgMana: number | null = null;
    if (baseline && baseline.total_games > 0) {
      avgMana = Math.round((baseline.total_mana_spent / baseline.total_games) * 100) / 100;
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
  const set = query.set as string;
  const turns = ((query.turns as AttackTurnInput[]) ?? []).slice(0, MAX_TURNS);
  const format = query.format as string | undefined;

  if (!set || turns.length === 0) {
    return { type: "formatted", content: "Error: attack_analysis requires set and turns parameters." };
  }

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
       FROM mtga_play_combat
       WHERE set_code = ? AND attacker_name IN (${placeholders})`,
    )
      .bind(set, ...creatureList)
      .all<CombatRow>();
    combatData = result.results;
  }

  const combatIndex = new Map<string, CombatRow>();
  for (const r of combatData) {
    combatIndex.set(`${r.attacker_name}:${r.turn_number}:${r.user_creatures_count}:${r.oppo_creatures_count}:${r.attacked}`, r);
  }

  const creaturesWithData = new Set<string>();
  const turnResults = [];

  for (const t of turns) {
    const userC = Math.min(4, Math.max(0, t.user_creatures));
    const oppoC = Math.min(4, Math.max(0, t.oppo_creatures));
    const attackedSet = new Set(t.attacked);

    const creatureResults = [];

    for (const creature of (t.creatures ?? []).slice(0, MAX_CREATURES_PER_TURN)) {
      const didAttack = attackedSet.has(creature);
      const attackRow = combatIndex.get(`${creature}:${t.turn}:${userC}:${oppoC}:1`);
      const holdRow = combatIndex.get(`${creature}:${t.turn}:${userC}:${oppoC}:0`);

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

      const attackWR = attackRow ? wr(attackRow.games_won, attackRow.total_games) : 0;
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
  const set = query.set as string;
  const archetype = (query.archetype as string) ?? "ALL";
  const onPlay = query.on_play === true ? 1 : 0;
  const hand = ((query.hand as string[]) ?? []).slice(0, MAX_HAND);
  const format = query.format as string | undefined;

  if (!set || hand.length === 0) {
    return { type: "formatted", content: "Error: mulligan requires set and hand parameters." };
  }

  const arch = await resolveArchetype(env, "mtga_play_mulligan", set, archetype);

  const placeholders = hand.map(() => "?").join(", ");
  const cardRows = await env.DB.prepare(
    `SELECT front_face_name AS name, cmc, type_line FROM mtga_cards
     WHERE is_default = 1 AND front_face_name COLLATE NOCASE IN (${placeholders})`,
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
    nonlandCMCs.length > 0 ? nonlandCMCs.reduce((a, b) => a + b, 0) / nonlandCMCs.length : 0;
  const cmcBucket = avgCMC < 2.0 ? "low" : avgCMC <= 3.0 ? "mid" : "high";

  const keepRow = await env.DB.prepare(
    `SELECT games_won, total_games FROM mtga_play_mulligan
     WHERE set_code = ? AND archetype = ? AND on_play = ? AND land_count = ? AND nonland_cmc_bucket = ? AND num_mulligans = 0`,
  )
    .bind(set, arch, onPlay, landCount, cmcBucket)
    .first<MulliganRow>();

  const mullRow = await env.DB.prepare(
    `SELECT games_won, total_games FROM mtga_play_mulligan
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

interface GameSectionAction {
  player: number;
  type: string;
  cast?: { cardName: string; cardId: number; manaPaid?: { color: string; count: number }[] };
  move?: { cardName: string; cardId: number; moveType: string };
  damage?: { source: string; sourceId: number; target: string; amount: number; isCombat: boolean };
}

interface GameSectionPermanent {
  cardName: string;
  cardId: number;
  cardTypes: string[];
  power?: number;
  toughness?: number;
  isTapped?: boolean;
  damage?: number;
}

interface GameSectionPlayer {
  seat: number;
  lifeTotal: number;
  manaPool?: { color: string; count: number }[];
  battlefield?: GameSectionPermanent[];
}

interface GameSectionTurn {
  turnNumber: number;
  activePlayer: number;
  phase: string;
  players?: GameSectionPlayer[];
  actions: GameSectionAction[];
}

interface GameSectionData {
  matchId: string;
  turns: GameSectionTurn[];
}

function extractTurnsFromSection(section: GameSectionData, playerSeat: number): TurnInput[] {
  const turnMap = new Map<
    number,
    { manaSpent: number; cardsPlayed: string[]; creaturesAttacked: string[]; userCreatures: number; oppoCreatures: number }
  >();
  const landNames = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest"]);

  for (const turn of section.turns) {
    const existing = turnMap.get(turn.turnNumber) ?? {
      manaSpent: 0,
      cardsPlayed: [],
      creaturesAttacked: [],
      userCreatures: 0,
      oppoCreatures: 0,
    };
    for (const action of turn.actions) {
      if (action.player !== playerSeat) continue;
      if (action.type === "cast" && action.cast) {
        existing.cardsPlayed.push(action.cast.cardName);
        if (action.cast.manaPaid) {
          for (const mana of action.cast.manaPaid) existing.manaSpent += mana.count;
        }
      }
      if (
        action.type === "move" &&
        action.move &&
        action.move.moveType === "play_land" &&
        !landNames.has(action.move.cardName)
      ) {
        existing.cardsPlayed.push(action.move.cardName);
      }
      if (action.type === "damage" && action.damage?.isCombat && action.damage.amount > 0) {
        existing.creaturesAttacked.push(action.damage.source);
      }
    }

    if (turn.players) {
      for (const p of turn.players) {
        const creatures = (p.battlefield ?? []).filter((perm) =>
          perm.cardTypes?.includes("CardType_Creature"),
        ).length;
        if (p.seat === playerSeat) {
          existing.userCreatures = creatures;
        } else {
          existing.oppoCreatures = creatures;
        }
      }
    }

    turnMap.set(turn.turnNumber, existing);
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

async function loadTurnsFromMatchId(
  matchId: string,
  userId: string,
  env: Env,
): Promise<TurnInput[] | string> {
  const sectionName = `game:${matchId}`;
  const row = await env.DB.prepare(
    `SELECT sec.data FROM sections sec
     JOIN saves sv ON sv.uuid = sec.save_uuid
     WHERE sv.user_uuid = ? AND sv.game_id = 'mtga' AND sec.name = ?
     LIMIT 1`,
  )
    .bind(userId, sectionName)
    .first<{ data: string }>();

  if (!row) {
    return `Game section "${sectionName}" not found in any MTGA save.`;
  }

  try {
    return extractTurnsFromSection(JSON.parse(row.data) as GameSectionData, 1);
  } catch {
    return `Failed to parse game section data for ${matchId}.`;
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
  const set = query.set as string;
  const archetype = (query.archetype as string) ?? "ALL";
  const onPlay = query.on_play === true ? 1 : 0;
  let turns = query.turns as TurnInput[] | undefined;
  const format = query.format as string | undefined;
  const matchId = query.match_id as string | undefined;
  const userId = query.user_id as string | undefined;

  if (matchId) {
    if (!userId) {
      return {
        type: "formatted",
        content: "Error: match_id lookup requires user_id (provided automatically by MCP context).",
      };
    }
    const loaded = await loadTurnsFromMatchId(matchId, userId, env);
    if (typeof loaded === "string") {
      return { type: "formatted", content: `Error: ${loaded}` };
    }
    turns = loaded;
  }

  if (!set || !turns?.length) {
    return {
      type: "formatted",
      content: "Error: game_review requires set and (turns OR match_id) parameters.",
    };
  }

  turns = turns.slice(0, MAX_TURNS);
  const arch = await resolveArchetype(env, "mtga_play_turn_baselines", set, archetype);

  const turnNums = turns.map((t) => t.turn);
  const turnPlaceholders = turnNums.map(() => "?").join(", ");

  const baselines = await env.DB.prepare(
    `SELECT turn_number, total_mana_spent, total_creatures_attacked, total_attacks_possible, games_won, total_games
     FROM mtga_play_turn_baselines
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

  const cardTimingMap = new Map<string, CardTimingRow[]>();
  if (allPlayedCards.size > 0) {
    const cardList = [...allPlayedCards];
    const cardPlaceholders = cardList.map(() => "?").join(", ");
    const timingRows = await env.DB.prepare(
      `SELECT card_name, turn_number, games_won, total_games
       FROM mtga_play_card_timing
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
      const avgAttackRate = baseline.total_creatures_attacked / baseline.total_attacks_possible;
      const playerAttackRate =
        t.user_creatures > 0 ? (t.creatures_attacked?.length ?? 0) / t.user_creatures : 0;

      if (avgAttackRate > 0.5 && playerAttackRate < 0.2 && t.user_creatures > 0) {
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
    '1. mode="card_timing" → Win rate by deployment turn for specific cards. Params: set, cards[], archetype?',
    '2. mode="mana_efficiency" → Compare mana spent per turn against archetype baselines. Params: set, archetype?, on_play, turns[{turn, mana_spent}]',
    '3. mode="attack_analysis" → Were attacks made when they should have been? Params: set, turns[{turn, creatures[], attacked[], user_creatures, oppo_creatures}]',
    '4. mode="mulligan" → Should this hand have been kept? Params: set, archetype?, on_play, hand[]',
    '5. mode="game_review" → Full post-game analysis identifying biggest deviations.',
    "   Inline: set, archetype?, on_play, turns[{turn, mana_spent, cards_played[], creatures_attacked[], user_creatures, oppo_creatures}]",
    "   Match lookup: set, match_id (loads game data from save sections via user_id)",
    "",
    "All modes accept optional format parameter. Non-PremierDraft formats receive a disclaimer.",
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
      description: "Set code (e.g., 'FDN'). Required for all modes.",
    },
    archetype: {
      type: "string",
      description:
        "Color archetype (e.g., 'UB'). Falls back to 'ALL' if no data for specific archetype.",
    },
    format: {
      type: "string",
      description: "Game format. Non-PremierDraft formats receive a data source disclaimer.",
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
      description: "Turn data array for mana_efficiency, attack_analysis, and game_review modes (max 30).",
    },
    match_id: {
      type: "string",
      description:
        "Match ID for game_review mode. Loads game data from save sections via user_id.",
    },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
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
          type: "formatted",
          content: `Unknown mode "${mode}". Use: card_timing, mana_efficiency, attack_analysis, mulligan, game_review.`,
        };
    }
  },
};
