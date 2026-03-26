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

// ── Formatting helpers ───────────────────────────────────────

function pct(wins: number, total: number): string {
  if (total === 0) return "N/A";
  return `${((wins / total) * 100).toFixed(1)}%`;
}

function wr(wins: number, total: number): number {
  if (total === 0) return 0;
  return wins / total;
}

function padR(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function padL(s: string, len: number): string {
  return s.length >= len ? s : " ".repeat(len - s.length) + s;
}

function coverageLine(found: number, total: number): string {
  const pctVal = total === 0 ? 0 : Math.round((found / total) * 100);
  return `Coverage: ${found}/${total} cards have replay data (${pctVal}%)`;
}

function disclaimer(format: string | undefined): string {
  if (!format || format === "PremierDraft") return "";
  return "Note: Baselines from Premier Draft data — advice may not reflect " + format + " meta.\n\n";
}

// ── Query: card_timing ───────────────────────────────────────

async function cardTiming(
  query: Record<string, unknown>,
  env: Env,
): Promise<ReferenceResult> {
  const set = query.set as string;
  const cards = query.cards as string[];
  const archetype = (query.archetype as string) ?? "ALL";
  const format = query.format as string | undefined;

  if (!set || !cards?.length) {
    return { type: "formatted", content: "Error: card_timing requires set and cards parameters." };
  }

  const lines: string[] = [];
  lines.push(disclaimer(format));
  lines.push("Card Timing Analysis");
  lines.push("═".repeat(50));
  lines.push("");

  let found = 0;
  for (const card of cards) {
    // Try specific archetype first, fall back to ALL.
    let rows = await env.DB.prepare(
      `SELECT turn_number, times_deployed, games_won, total_games
       FROM mtga_play_card_timing
       WHERE set_code = ? AND card_name = ? AND archetype = ?
       ORDER BY turn_number`,
    ).bind(set, card, archetype).all<CardTimingRow>();

    if (rows.results.length === 0 && archetype !== "ALL") {
      rows = await env.DB.prepare(
        `SELECT turn_number, times_deployed, games_won, total_games
         FROM mtga_play_card_timing
         WHERE set_code = ? AND card_name = ? AND archetype = 'ALL'
         ORDER BY turn_number`,
      ).bind(set, card).all<CardTimingRow>();
    }

    if (rows.results.length === 0) continue;
    found++;

    // Find best turn.
    let bestTurn = 0;
    let bestWR = 0;
    for (const r of rows.results) {
      const w = wr(r.games_won, r.total_games);
      if (w > bestWR) {
        bestWR = w;
        bestTurn = r.turn_number;
      }
    }

    lines.push(`${card} (best on turn ${bestTurn}, ${pct(Math.round(bestWR * rows.results[0]!.total_games), rows.results[0]!.total_games)} → ${(bestWR * 100).toFixed(1)}% WR)`);
    lines.push(`  ${padR("Turn", 6)} ${padL("Played", 8)} ${padL("Win Rate", 10)} ${padL("Games", 8)}`);
    for (const r of rows.results) {
      lines.push(`  ${padR(`T${r.turn_number}`, 6)} ${padL(String(r.times_deployed), 8)} ${padL(pct(r.games_won, r.total_games), 10)} ${padL(String(r.total_games), 8)}`);
    }
    lines.push("");
  }

  lines.push(coverageLine(found, cards.length));

  return { type: "formatted", content: lines.join("\n") };
}

// ── Query: mana_efficiency ───────────────────────────────────

async function manaEfficiency(
  query: Record<string, unknown>,
  env: Env,
): Promise<ReferenceResult> {
  const set = query.set as string;
  const archetype = (query.archetype as string) ?? "ALL";
  const onPlay = query.on_play === true ? 1 : 0;
  const turns = query.turns as { turn: number; mana_spent: number }[];
  const format = query.format as string | undefined;

  if (!set || !turns?.length) {
    return { type: "formatted", content: "Error: mana_efficiency requires set and turns parameters." };
  }

  const lines: string[] = [];
  lines.push(disclaimer(format));
  lines.push("Mana Efficiency Analysis");
  lines.push("═".repeat(50));
  lines.push("");
  lines.push(`  ${padR("Turn", 6)} ${padL("You", 6)} ${padL("Bucket", 8)} ${padL("Bucket WR", 10)} ${padL("Avg WR", 10)} ${padL("Rating", 8)}`);

  for (const t of turns) {
    const bucket = Math.min(5, Math.max(0, Math.round(t.mana_spent)));

    // Fetch this bucket's win rate.
    let row = await env.DB.prepare(
      `SELECT games_won, total_games FROM mtga_play_tempo
       WHERE set_code = ? AND archetype = ? AND turn_number = ? AND on_play = ? AND mana_spent_bucket = ?`,
    ).bind(set, archetype, t.turn, onPlay, bucket).first<TempoRow>();

    if (!row && archetype !== "ALL") {
      row = await env.DB.prepare(
        `SELECT games_won, total_games FROM mtga_play_tempo
         WHERE set_code = ? AND archetype = 'ALL' AND turn_number = ? AND on_play = ? AND mana_spent_bucket = ?`,
      ).bind(set, t.turn, onPlay, bucket).first<TempoRow>();
    }

    // Fetch baseline avg for comparison.
    let baseline = await env.DB.prepare(
      `SELECT total_mana_spent, games_won, total_games FROM mtga_play_turn_baselines
       WHERE set_code = ? AND archetype = ? AND turn_number = ? AND on_play = ?`,
    ).bind(set, archetype, t.turn, onPlay).first<BaselineRow>();

    if (!baseline && archetype !== "ALL") {
      baseline = await env.DB.prepare(
        `SELECT total_mana_spent, games_won, total_games FROM mtga_play_turn_baselines
         WHERE set_code = ? AND archetype = 'ALL' AND turn_number = ? AND on_play = ?`,
      ).bind(set, t.turn, onPlay).first<BaselineRow>();
    }

    const bucketWR = row ? pct(row.games_won, row.total_games) : "N/A";
    const avgWR = baseline ? pct(baseline.games_won, baseline.total_games) : "N/A";

    // Rate: compare player's mana spent to average.
    let rating = "—";
    if (baseline && baseline.total_games > 0) {
      const avg = baseline.total_mana_spent / baseline.total_games;
      if (t.mana_spent >= avg * 0.9) rating = "Good";
      else if (t.mana_spent >= avg * 0.5) rating = "Low";
      else rating = "Wasted";
    }

    lines.push(`  ${padR(`T${t.turn}`, 6)} ${padL(String(t.mana_spent), 6)} ${padL(String(bucket), 8)} ${padL(bucketWR, 10)} ${padL(avgWR, 10)} ${padL(rating, 8)}`);
  }

  lines.push("");
  lines.push(`Avg mana column shows baseline win rate at the average mana expenditure for this archetype.`);

  return { type: "formatted", content: lines.join("\n") };
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
  const turns = query.turns as AttackTurnInput[];
  const format = query.format as string | undefined;

  if (!set || !turns?.length) {
    return { type: "formatted", content: "Error: attack_analysis requires set and turns parameters." };
  }

  const lines: string[] = [];
  lines.push(disclaimer(format));
  lines.push("Attack Analysis");
  lines.push("═".repeat(50));
  lines.push("");

  const allCreatures = new Set<string>();
  let foundCreatures = 0;

  for (const t of turns) {
    const userC = Math.min(4, Math.max(0, t.user_creatures));
    const oppoC = Math.min(4, Math.max(0, t.oppo_creatures));
    const attackedSet = new Set(t.attacked);

    lines.push(`Turn ${t.turn} (${t.user_creatures} vs ${t.oppo_creatures} creatures):`);

    for (const creature of t.creatures) {
      allCreatures.add(creature);
      const didAttack = attackedSet.has(creature);

      // Look up attack vs hold win rates.
      const attackRow = await env.DB.prepare(
        `SELECT games_won, total_games FROM mtga_play_combat
         WHERE set_code = ? AND attacker_name = ? AND turn_number = ? AND user_creatures_count = ? AND oppo_creatures_count = ? AND attacked = 1`,
      ).bind(set, creature, t.turn, userC, oppoC).first<CombatRow>();

      const holdRow = await env.DB.prepare(
        `SELECT games_won, total_games FROM mtga_play_combat
         WHERE set_code = ? AND attacker_name = ? AND turn_number = ? AND user_creatures_count = ? AND oppo_creatures_count = ? AND attacked = 0`,
      ).bind(set, creature, t.turn, userC, oppoC).first<CombatRow>();

      if (!attackRow && !holdRow) {
        lines.push(`  ${creature}: ${didAttack ? "attacked" : "held"} — no data`);
        continue;
      }
      foundCreatures++;

      const attackWR = attackRow ? wr(attackRow.games_won, attackRow.total_games) : 0;
      const holdWR = holdRow ? wr(holdRow.games_won, holdRow.total_games) : 0;
      const bestAction = attackWR > holdWR ? "attack" : "hold";
      const playerAction = didAttack ? "attacked" : "held";
      const correctAction = bestAction === "attack" ? "attacked" : "held";
      const correct = playerAction === correctAction;
      const marker = correct ? "✓" : "✗";

      lines.push(`  ${marker} ${creature}: ${playerAction} (attack WR: ${(attackWR * 100).toFixed(1)}%, hold WR: ${(holdWR * 100).toFixed(1)}%) — data says ${bestAction}`);
    }
    lines.push("");
  }

  lines.push(coverageLine(foundCreatures, allCreatures.size));

  return { type: "formatted", content: lines.join("\n") };
}

// ── Query: mulligan ──────────────────────────────────────────

async function mulligan(
  query: Record<string, unknown>,
  env: Env,
): Promise<ReferenceResult> {
  const set = query.set as string;
  const archetype = (query.archetype as string) ?? "ALL";
  const onPlay = query.on_play === true ? 1 : 0;
  const hand = query.hand as string[];
  const format = query.format as string | undefined;

  if (!set || !hand?.length) {
    return { type: "formatted", content: "Error: mulligan requires set and hand parameters." };
  }

  const lines: string[] = [];
  lines.push(disclaimer(format));
  lines.push("Mulligan Analysis");
  lines.push("═".repeat(50));
  lines.push("");

  // Classify hand shape.
  // Simple heuristic: basic lands and common dual lands have 0 CMC in typical data.
  // For this analysis, count cards that are commonly lands (this is approximate —
  // the module works with card names, not type lines).
  const basicLands = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest"]);
  let landCount = 0;
  const nonlandCMCs: number[] = [];

  for (const card of hand) {
    if (basicLands.has(card)) {
      landCount++;
    } else {
      // Rough CMC estimation — we don't have the card DB here.
      // In practice Claude would provide CMC data, but for the module
      // we bucket by hand composition which is format-agnostic.
      nonlandCMCs.push(2.5); // default mid-range guess
    }
  }

  const avgCMC = nonlandCMCs.length > 0
    ? nonlandCMCs.reduce((a, b) => a + b, 0) / nonlandCMCs.length
    : 0;
  const cmcBucket = avgCMC < 2.0 ? "low" : avgCMC <= 3.0 ? "mid" : "high";

  lines.push(`Hand: ${hand.length} cards, ${landCount} lands, nonland CMC: ${cmcBucket}`);
  lines.push(`On play: ${onPlay === 1 ? "yes" : "no"}`);
  lines.push("");

  // Look up keep (0 mulligans) win rate.
  let keepRow = await env.DB.prepare(
    `SELECT games_won, total_games FROM mtga_play_mulligan
     WHERE set_code = ? AND archetype = ? AND on_play = ? AND land_count = ? AND nonland_cmc_bucket = ? AND num_mulligans = 0`,
  ).bind(set, archetype, onPlay, landCount, cmcBucket).first<MulliganRow>();

  if (!keepRow && archetype !== "ALL") {
    keepRow = await env.DB.prepare(
      `SELECT games_won, total_games FROM mtga_play_mulligan
       WHERE set_code = ? AND archetype = 'ALL' AND on_play = ? AND land_count = ? AND nonland_cmc_bucket = ? AND num_mulligans = 0`,
    ).bind(set, onPlay, landCount, cmcBucket).first<MulliganRow>();
  }

  // Look up mulligan to 6 win rate.
  let mullRow = await env.DB.prepare(
    `SELECT games_won, total_games FROM mtga_play_mulligan
     WHERE set_code = ? AND archetype = ? AND on_play = ? AND num_mulligans = 1`,
  ).bind(set, archetype, onPlay).first<MulliganRow>();

  if (!mullRow && archetype !== "ALL") {
    mullRow = await env.DB.prepare(
      `SELECT games_won, total_games FROM mtga_play_mulligan
       WHERE set_code = ? AND archetype = 'ALL' AND on_play = ? AND num_mulligans = 1`,
    ).bind(set, onPlay).first<MulliganRow>();
  }

  if (keepRow) {
    lines.push(`Keep (${landCount} lands, ${cmcBucket} curve): ${pct(keepRow.games_won, keepRow.total_games)} WR (${keepRow.total_games} games)`);
  } else {
    lines.push(`Keep: No data for ${landCount}-land ${cmcBucket}-CMC hands.`);
  }

  if (mullRow) {
    lines.push(`Mulligan to 6: ${pct(mullRow.games_won, mullRow.total_games)} WR (${mullRow.total_games} games)`);
  }

  if (keepRow && mullRow) {
    const keepWR = wr(keepRow.games_won, keepRow.total_games);
    const mullWR = wr(mullRow.games_won, mullRow.total_games);
    lines.push("");
    if (keepWR > mullWR) {
      lines.push(`Recommendation: KEEP — this hand shape wins ${((keepWR - mullWR) * 100).toFixed(1)}pp more than mulliganing.`);
    } else {
      lines.push(`Recommendation: MULLIGAN — mulliganing wins ${((mullWR - keepWR) * 100).toFixed(1)}pp more than keeping this hand shape.`);
    }
  }

  return { type: "formatted", content: lines.join("\n") };
}

// ── Section lookup: convert game section to TurnInput[] ──────

interface GameSectionAction {
  player: number;
  type: string;
  cast?: { cardName: string; cardId: number; manaPaid?: { color: string; count: number }[] };
  move?: { cardName: string; cardId: number; moveType: string };
  damage?: { source: string; sourceId: number; target: string; amount: number; isCombat: boolean };
}

interface GameSectionTurn {
  turnNumber: number;
  activePlayer: number;
  phase: string;
  players?: { seat: number; lifeTotal: number; manaPool?: { color: string; count: number }[] }[];
  actions: GameSectionAction[];
}

interface GameSectionData {
  matchId: string;
  turns: GameSectionTurn[];
}

function extractTurnsFromSection(section: GameSectionData, playerSeat: number): TurnInput[] {
  const turnMap = new Map<number, { manaSpent: number; cardsPlayed: string[]; creaturesAttacked: string[]; userCreatures: number; oppoCreatures: number }>();
  const landNames = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest"]);

  for (const turn of section.turns) {
    const existing = turnMap.get(turn.turnNumber) ?? { manaSpent: 0, cardsPlayed: [], creaturesAttacked: [], userCreatures: 0, oppoCreatures: 0 };
    for (const action of turn.actions) {
      if (action.player !== playerSeat) continue;
      if (action.type === "cast" && action.cast) {
        existing.cardsPlayed.push(action.cast.cardName);
        if (action.cast.manaPaid) {
          for (const mana of action.cast.manaPaid) existing.manaSpent += mana.count;
        }
      }
      if (action.type === "move" && action.move && action.move.moveType === "play_land" && !landNames.has(action.move.cardName)) {
        existing.cardsPlayed.push(action.move.cardName);
      }
      if (action.type === "damage" && action.damage?.isCombat && action.damage.amount > 0) {
        existing.creaturesAttacked.push(action.damage.source);
      }
    }
    turnMap.set(turn.turnNumber, existing);
  }

  return [...turnMap.entries()].sort((a, b) => a[0] - b[0]).map(([turnNum, data]) => ({
    turn: turnNum,
    mana_spent: data.manaSpent,
    cards_played: data.cardsPlayed,
    creatures_attacked: [...new Set(data.creaturesAttacked)],
    user_creatures: data.userCreatures,
    oppo_creatures: data.oppoCreatures,
  }));
}

async function loadTurnsFromMatchId(matchId: string, userId: string, env: Env): Promise<TurnInput[] | string> {
  const saves = await env.DB.prepare("SELECT uuid FROM saves WHERE user_uuid = ? AND game_id = 'mtga'").bind(userId).all<{ uuid: string }>();
  if (saves.results.length === 0) return "No MTGA saves found for this user.";

  const sectionName = `game:${matchId}`;
  for (const save of saves.results) {
    const row = await env.DB.prepare("SELECT data FROM sections WHERE save_uuid = ? AND name = ?").bind(save.uuid, sectionName).first<{ data: string }>();
    if (row) {
      try {
        return extractTurnsFromSection(JSON.parse(row.data) as GameSectionData, 1);
      } catch {
        return `Failed to parse game section data for ${matchId}.`;
      }
    }
  }
  return `Game section "${sectionName}" not found in any MTGA save.`;
}

// ── Query: game_review ───────────────────────────────────────

interface ReviewFinding {
  turn: number;
  category: string;
  description: string;
  impact: number; // higher = bigger deviation from optimal
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
      return { type: "formatted", content: "Error: match_id lookup requires user_id (provided automatically by MCP context)." };
    }
    const loaded = await loadTurnsFromMatchId(matchId, userId, env);
    if (typeof loaded === "string") {
      return { type: "formatted", content: `Error: ${loaded}` };
    }
    turns = loaded;
  }

  if (!set || !turns?.length) {
    return { type: "formatted", content: "Error: game_review requires set and (turns OR match_id) parameters." };
  }

  const findings: ReviewFinding[] = [];
  const allCards = new Set<string>();
  let cardsWithData = 0;

  for (const t of turns) {
    // ── Mana efficiency check ──
    let baseline = await env.DB.prepare(
      `SELECT total_mana_spent, games_won, total_games FROM mtga_play_turn_baselines
       WHERE set_code = ? AND archetype = ? AND turn_number = ? AND on_play = ?`,
    ).bind(set, archetype, t.turn, onPlay).first<BaselineRow>();

    if (!baseline && archetype !== "ALL") {
      baseline = await env.DB.prepare(
        `SELECT total_mana_spent, games_won, total_games FROM mtga_play_turn_baselines
         WHERE set_code = ? AND archetype = 'ALL' AND turn_number = ? AND on_play = ?`,
      ).bind(set, t.turn, onPlay).first<BaselineRow>();
    }

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

    // ── Card timing check ──
    if (t.cards_played) {
      for (const card of t.cards_played) {
        allCards.add(card);

        let rows = await env.DB.prepare(
          `SELECT turn_number, games_won, total_games FROM mtga_play_card_timing
           WHERE set_code = ? AND card_name = ? AND archetype = ?
           ORDER BY turn_number`,
        ).bind(set, card, archetype).all<CardTimingRow>();

        if (rows.results.length === 0 && archetype !== "ALL") {
          rows = await env.DB.prepare(
            `SELECT turn_number, games_won, total_games FROM mtga_play_card_timing
             WHERE set_code = ? AND card_name = ? AND archetype = 'ALL'
             ORDER BY turn_number`,
          ).bind(set, card).all<CardTimingRow>();
        }

        if (rows.results.length === 0) continue;
        cardsWithData++;

        // Find the best turn and compare.
        let bestTurn = t.turn;
        let bestWR = 0;
        let currentWR = 0;
        for (const r of rows.results) {
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
    }

    // ── Attack check ──
    if (t.creatures_attacked !== undefined && t.user_creatures !== undefined && t.oppo_creatures !== undefined) {
      const attackedSet = new Set(t.creatures_attacked ?? []);

      // Check baseline attack rate.
      let blRow = await env.DB.prepare(
        `SELECT total_creatures_attacked, total_attacks_possible, total_games FROM mtga_play_turn_baselines
         WHERE set_code = ? AND archetype = ? AND turn_number = ? AND on_play = ?`,
      ).bind(set, archetype, t.turn, onPlay).first<BaselineRow>();

      if (!blRow && archetype !== "ALL") {
        blRow = await env.DB.prepare(
          `SELECT total_creatures_attacked, total_attacks_possible, total_games FROM mtga_play_turn_baselines
           WHERE set_code = ? AND archetype = 'ALL' AND turn_number = ? AND on_play = ?`,
        ).bind(set, t.turn, onPlay).first<BaselineRow>();
      }

      if (blRow && blRow.total_attacks_possible > 0) {
        const avgAttackRate = blRow.total_creatures_attacked / blRow.total_attacks_possible;
        const playerAttackRate = t.user_creatures > 0
          ? (t.creatures_attacked?.length ?? 0) / t.user_creatures
          : 0;

        if (avgAttackRate > 0.5 && playerAttackRate < 0.2 && t.user_creatures > 0) {
          findings.push({
            turn: t.turn,
            category: "Combat",
            description: `Attacked with ${attackedSet.size}/${t.user_creatures} creatures (avg attack rate: ${(avgAttackRate * 100).toFixed(0)}%). Missed attacks may have cost tempo.`,
            impact: (avgAttackRate - playerAttackRate) * 3,
          });
        }
      }
    }
  }

  // Sort by impact (highest first) and present top findings.
  findings.sort((a, b) => b.impact - a.impact);

  const lines: string[] = [];
  lines.push(disclaimer(format));
  lines.push("Game Review");
  lines.push("═".repeat(50));
  lines.push("");

  if (findings.length === 0) {
    lines.push("No significant deviations from winning patterns detected.");
  } else {
    lines.push(`Found ${findings.length} potential improvement${findings.length > 1 ? "s" : ""}:`);
    lines.push("");

    for (const f of findings.slice(0, 5)) {
      lines.push(`Turn ${f.turn} [${f.category}]: ${f.description}`);
    }
  }

  lines.push("");
  lines.push(coverageLine(cardsWithData, allCards.size));

  return { type: "formatted", content: lines.join("\n") };
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
    '5. mode="game_review" → Full post-game analysis identifying biggest deviations. Params: set, archetype?, on_play, turns[{turn, mana_spent, cards_played[], creatures_attacked[], user_creatures, oppo_creatures}]',
    "",
    "All modes accept optional format parameter. Non-PremierDraft formats receive a disclaimer.",
  ].join("\n"),
  parameters: {
    mode: {
      type: "string",
      description: 'Query mode: "card_timing", "mana_efficiency", "attack_analysis", "mulligan", or "game_review".',
      required: true,
    },
    set: {
      type: "string",
      description: "Set code (e.g., 'FDN'). Required for all modes.",
    },
    archetype: {
      type: "string",
      description: "Color archetype (e.g., 'UB'). Falls back to 'ALL' if no data for specific archetype.",
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
      description: "Card names for card_timing mode.",
    },
    hand: {
      type: "array",
      description: "Card names in opening hand for mulligan mode.",
    },
    turns: {
      type: "array",
      description: "Turn data array for mana_efficiency, attack_analysis, and game_review modes.",
    },
    match_id: {
      type: "string",
      description: "Match ID for game_review mode. Loads game data from save sections via user_id.",
    },
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const mode = (query.mode as string) ?? "";

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
