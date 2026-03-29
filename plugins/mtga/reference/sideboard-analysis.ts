/**
 * MTG Arena sideboard_analysis — native reference module.
 *
 * Analyzes best-of-three match performance to surface sideboarding effectiveness.
 * Compares game 1 (pre-board) win rate vs games 2/3 (post-board) win rate,
 * broken down by opponent archetype.
 *
 * NOTE: MTGA doesn't expose actual sideboard changes in Player.log. This module
 * infers sideboarding effectiveness from outcome changes between G1 and G2/G3.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { buildColorMap, classifyFromColorMap } from "./archetype";

// ── Types ────────────────────────────────────────────────────

interface MatchRow {
  match_id: string;
  format: string;
  result: string;
  opponent_cards: string;
  game_results: string;
  played_at: string;
}

interface GameResult {
  game_number: number;
  winning_seat: number;
  player_seat: number;
}

interface BO3Stats {
  matches: number;
  g1_wins: number;
  g1_total: number;
  post_board_wins: number;
  post_board_total: number;
}

// ── Helpers ──────────────────────────────────────────────────

function pct(wins: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((wins / total) * 100).toFixed(1)}%`;
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s : " ".repeat(len - s.length) + s;
}

function parseGames(gameResultsJson: string): GameResult[] {
  try {
    return JSON.parse(gameResultsJson) as GameResult[];
  } catch {
    return [];
  }
}

function isBO3(games: GameResult[]): boolean {
  return games.length >= 2;
}

function playerWonGame(g: GameResult): boolean {
  return g.winning_seat === g.player_seat;
}

function computeBO3Stats(games: GameResult[]): { g1Won: boolean; postBoardWins: number; postBoardTotal: number } {
  const g1 = games.find((g) => g.game_number === 1);
  const postBoard = games.filter((g) => g.game_number >= 2);

  return {
    g1Won: g1 ? playerWonGame(g1) : false,
    postBoardWins: postBoard.filter(playerWonGame).length,
    postBoardTotal: postBoard.length,
  };
}

// ── Query implementations ────────────────────────────────────

const MATCHUP_LIMIT = 500;

async function bo3Overview(userId: string, env: Env): Promise<ReferenceResult> {
  const rows = await env.DB.prepare(
    `SELECT match_id, format, result, game_results, opponent_cards, played_at
     FROM mtga_match_history WHERE user_uuid = ?
     ORDER BY played_at DESC LIMIT ${MATCHUP_LIMIT}`,
  )
    .bind(userId)
    .all<MatchRow>();

  // Filter to BO3 only
  const bo3Matches: { row: MatchRow; games: GameResult[] }[] = [];
  for (const row of rows.results) {
    const games = parseGames(row.game_results);
    if (isBO3(games)) {
      bo3Matches.push({ row, games });
    }
  }

  if (bo3Matches.length === 0) {
    return { type: "formatted", content: "No best-of-three match history found." };
  }

  let g1Wins = 0;
  let g1Total = 0;
  let postBoardWins = 0;
  let postBoardTotal = 0;

  for (const { games } of bo3Matches) {
    const stats = computeBO3Stats(games);
    g1Total++;
    if (stats.g1Won) g1Wins++;
    postBoardWins += stats.postBoardWins;
    postBoardTotal += stats.postBoardTotal;
  }

  const lines: string[] = [];
  lines.push(`Sideboard Analysis — ${bo3Matches.length} best-of-three matches`);
  lines.push("");
  lines.push(`  Game 1 (pre-board):   ${padLeft(pct(g1Wins, g1Total), 7)}  (${g1Wins}W ${g1Total - g1Wins}L)`);
  lines.push(`  Games 2/3 (post-board): ${padLeft(pct(postBoardWins, postBoardTotal), 7)}  (${postBoardWins}W ${postBoardTotal - postBoardWins}L)`);

  const g1Rate = g1Total > 0 ? g1Wins / g1Total : 0;
  const postRate = postBoardTotal > 0 ? postBoardWins / postBoardTotal : 0;
  const delta = postRate - g1Rate;

  if (Math.abs(delta) < 0.02) {
    lines.push("\n  Post-board performance is roughly even with pre-board.");
  } else if (delta > 0) {
    lines.push(`\n  Sideboarding improves your win rate by ${(delta * 100).toFixed(1)}pp.`);
  } else {
    lines.push(`\n  Sideboarding worsens your win rate by ${(Math.abs(delta) * 100).toFixed(1)}pp. Review your sideboard plans.`);
  }

  return {
    type: "formatted",
    content: lines.join("\n") + "\n",
  };
}

async function byMatchup(
  userId: string,
  format: string | undefined,
  env: Env,
): Promise<ReferenceResult> {
  let query = "SELECT match_id, result, opponent_cards, game_results FROM mtga_match_history WHERE user_uuid = ?";
  const binds: unknown[] = [userId];
  if (format) {
    query += " AND format = ?";
    binds.push(format);
  }
  query += ` ORDER BY played_at DESC LIMIT ${MATCHUP_LIMIT}`;

  const rows = await env.DB.prepare(query)
    .bind(...binds)
    .all<MatchRow>();

  // Parse all matches and collect arena_ids for batch lookup
  const parsedMatches: { row: MatchRow; games: GameResult[]; cards: { name: string; arena_id: number }[] }[] = [];
  const allArenaIds: number[] = [];

  for (const row of rows.results) {
    const games = parseGames(row.game_results);
    if (!isBO3(games)) continue;

    let cards: { name: string; arena_id: number }[] = [];
    try {
      cards = JSON.parse(row.opponent_cards);
    } catch {
      // skip
    }
    parsedMatches.push({ row, games, cards });
    for (const c of cards) allArenaIds.push(c.arena_id);
  }

  if (parsedMatches.length === 0) {
    return { type: "formatted", content: "No best-of-three match history found." };
  }

  // Single batch D1 query for all card colors
  const colorMap = await buildColorMap(env.DB, allArenaIds);

  // Classify each match in memory
  const archetypeStats = new Map<string, BO3Stats>();

  for (const { games, cards } of parsedMatches) {
    const archetype = classifyFromColorMap(colorMap, cards);
    const existing = archetypeStats.get(archetype) ?? {
      matches: 0,
      g1_wins: 0,
      g1_total: 0,
      post_board_wins: 0,
      post_board_total: 0,
    };

    const stats = computeBO3Stats(games);
    existing.matches++;
    existing.g1_total++;
    if (stats.g1Won) existing.g1_wins++;
    existing.post_board_wins += stats.postBoardWins;
    existing.post_board_total += stats.postBoardTotal;

    archetypeStats.set(archetype, existing);
  }

  if (archetypeStats.size === 0) {
    return { type: "formatted", content: "No best-of-three match history found." };
  }

  const sorted = [...archetypeStats.entries()].sort((a, b) => b[1].matches - a[1].matches);

  const lines: string[] = [];
  const header = format
    ? `Sideboard Analysis by Matchup (${format}):`
    : "Sideboard Analysis by Matchup (all formats):";
  lines.push(header);
  lines.push(
    `  ${padRight("Opponent", 22)} ${padLeft("BO3", 4)} ${padLeft("G1 WR", 8)} ${padLeft("G2/3 WR", 8)} ${padLeft("Delta", 8)}`,
  );

  for (const [archetype, stats] of sorted) {
    const g1Rate = stats.g1_total > 0 ? stats.g1_wins / stats.g1_total : 0;
    const postRate = stats.post_board_total > 0 ? stats.post_board_wins / stats.post_board_total : 0;
    const delta = postRate - g1Rate;
    const deltaStr =
      Math.abs(delta) < 0.005
        ? "  even"
        : delta > 0
          ? ` +${(delta * 100).toFixed(1)}pp`
          : ` ${(delta * 100).toFixed(1)}pp`;

    lines.push(
      `  ${padRight(archetype.slice(0, 22), 22)} ${padLeft(String(stats.matches), 4)} ${padLeft(pct(stats.g1_wins, stats.g1_total), 8)} ${padLeft(pct(stats.post_board_wins, stats.post_board_total), 8)} ${padLeft(deltaStr, 8)}`,
    );
  }

  return {
    type: "formatted",
    content: lines.join("\n") + "\n",
  };
}

// ── Module definition ────────────────────────────────────────

export const sideboardAnalysisModule: NativeReferenceModule = {
  id: "sideboard_analysis",
  name: "Sideboard Analysis",
  description: [
    "Analyze your best-of-three (BO3) match performance to evaluate sideboarding effectiveness.",
    "",
    "MODES:",
    '1. mode="bo3_overview" → Compare game 1 (pre-board) vs games 2/3 (post-board) win rates.',
    '2. mode="by_matchup" → Per-opponent-archetype breakdown of pre-board vs post-board performance. Optional format filter.',
    "",
    "Only includes matches with 2+ games (BO3). BO1 matches are excluded.",
    "All modes require user_id (provided automatically by the MCP context).",
  ].join("\n"),
  parameters: {
    mode: {
      type: "string",
      description: '"bo3_overview" or "by_matchup".',
      required: true,
    },
    user_id: {
      type: "string",
      description: "User UUID (provided automatically by MCP context).",
      required: true,
    },
    format: {
      type: "string",
      description: 'Filter by format (e.g., "Standard"). Used with by_matchup mode.',
    },
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const userId = query.user_id as string | undefined;
    if (!userId) {
      return {
        type: "formatted",
        content: "Error: user_id is required for sideboard_analysis queries.",
      };
    }

    const mode = (query.mode as string) ?? "bo3_overview";

    switch (mode) {
      case "bo3_overview":
        return bo3Overview(userId, env);
      case "by_matchup":
        return byMatchup(userId, query.format as string | undefined, env);
      default:
        return {
          type: "formatted",
          content: `Unknown mode "${mode}". Use: bo3_overview, by_matchup.`,
        };
    }
  },
};
