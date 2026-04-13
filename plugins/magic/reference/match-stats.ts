/**
 * MTG Arena match_stats — native reference module.
 *
 * Personal Constructed coach: queries the user's match history for win rates,
 * deck performance, matchup breakdowns, and recent trends.
 * All queries require user_id from the MCP context.
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
  deck_name: string;
  result: string;
  opponent_name: string;
  opponent_rank: string;
  opponent_cards: string;
  played_at: string;
}

interface WinRateRow {
  group_key: string;
  total: number;
  wins: number;
}

// ── Helpers ──────────────────────────────────────────────────

function winRate(wins: number, total: number): number {
  return total === 0 ? 0 : Math.round((wins / total) * 1000) / 1000;
}

// ── Query implementations ────────────────────────────────────

async function overview(userId: string, env: Env): Promise<ReferenceResult> {
  const byFormat = await env.DB.prepare(
    `SELECT format as group_key, COUNT(*) as total,
            SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins
     FROM magic_match_history WHERE user_uuid = ?
     GROUP BY format ORDER BY total DESC`,
  )
    .bind(userId)
    .all<WinRateRow>();

  const totalMatches = byFormat.results.reduce((sum, f) => sum + f.total, 0);
  const totalWins = byFormat.results.reduce((sum, f) => sum + f.wins, 0);

  return {
    type: "structured",
    data: {
      total_matches: totalMatches,
      total_wins: totalWins,
      total_losses: totalMatches - totalWins,
      win_rate: winRate(totalWins, totalMatches),
      by_format: byFormat.results.map((f) => ({
        format: f.group_key || "(unknown)",
        wins: f.wins,
        losses: f.total - f.wins,
        total: f.total,
        win_rate: winRate(f.wins, f.total),
      })),
    },
  };
}

async function byDeck(userId: string, env: Env): Promise<ReferenceResult> {
  const rows = await env.DB.prepare(
    `SELECT deck_name as group_key, COUNT(*) as total,
            SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins
     FROM magic_match_history WHERE user_uuid = ?
     GROUP BY deck_name ORDER BY total DESC`,
  )
    .bind(userId)
    .all<WinRateRow>();

  if (rows.results.length === 0) {
    return {
      type: "structured",
      data: { decks: [] },
    };
  }

  return {
    type: "structured",
    data: {
      decks: rows.results.map((r) => ({
        deck: r.group_key || "(no deck)",
        wins: r.wins,
        losses: r.total - r.wins,
        total: r.total,
        win_rate: winRate(r.wins, r.total),
      })),
    },
  };
}

async function byFormat(userId: string, env: Env): Promise<ReferenceResult> {
  const rows = await env.DB.prepare(
    `SELECT format as group_key, COUNT(*) as total,
            SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins
     FROM magic_match_history WHERE user_uuid = ?
     GROUP BY format ORDER BY total DESC`,
  )
    .bind(userId)
    .all<WinRateRow>();

  if (rows.results.length === 0) {
    return {
      type: "structured",
      data: { formats: [] },
    };
  }

  return {
    type: "structured",
    data: {
      formats: rows.results.map((r) => ({
        format: r.group_key || "(unknown)",
        wins: r.wins,
        losses: r.total - r.wins,
        total: r.total,
        win_rate: winRate(r.wins, r.total),
      })),
    },
  };
}

const MATCHUP_LIMIT = 500;

async function byMatchup(
  userId: string,
  format: string | undefined,
  env: Env,
): Promise<ReferenceResult> {
  let query = "SELECT match_id, result, opponent_cards FROM magic_match_history WHERE user_uuid = ?";
  const binds: unknown[] = [userId];
  if (format) {
    query += " AND format = ?";
    binds.push(format);
  }
  query += ` ORDER BY played_at DESC LIMIT ${MATCHUP_LIMIT}`;

  const matches = await env.DB.prepare(query)
    .bind(...binds)
    .all<{ match_id: string; result: string; opponent_cards: string }>();

  if (matches.results.length === 0) {
    return {
      type: "structured",
      data: { matchups: [], format: format ?? "all" },
    };
  }

  const allParsedCards: { matchIdx: number; cards: { name: string; arena_id: number }[] }[] = [];
  const allArenaIds: number[] = [];

  for (let i = 0; i < matches.results.length; i++) {
    let cards: { name: string; arena_id: number }[] = [];
    try {
      cards = JSON.parse(matches.results[i]!.opponent_cards);
    } catch {
      // skip
    }
    allParsedCards.push({ matchIdx: i, cards });
    for (const c of cards) allArenaIds.push(c.arena_id);
  }

  const colorMap = await buildColorMap(env.DB, allArenaIds);
  const archetypeStats = new Map<string, { wins: number; total: number }>();

  for (const { matchIdx, cards } of allParsedCards) {
    const m = matches.results[matchIdx]!;
    const archetype = classifyFromColorMap(colorMap, cards);
    const stats = archetypeStats.get(archetype) ?? { wins: 0, total: 0 };
    stats.total++;
    if (m.result === "win") stats.wins++;
    archetypeStats.set(archetype, stats);
  }

  const sorted = [...archetypeStats.entries()].sort((a, b) => b[1].total - a[1].total);

  return {
    type: "structured",
    data: {
      format: format ?? "all",
      matchups: sorted.map(([archetype, stats]) => ({
        archetype,
        wins: stats.wins,
        losses: stats.total - stats.wins,
        total: stats.total,
        win_rate: winRate(stats.wins, stats.total),
      })),
    },
  };
}

const MAX_TREND_COUNT = 100;

async function trend(
  userId: string,
  count: number,
  env: Env,
): Promise<ReferenceResult> {
  const safeCount = Math.min(Math.max(1, count), MAX_TREND_COUNT);
  const rows = await env.DB.prepare(
    `SELECT match_id, format, deck_name, result, opponent_name, played_at
     FROM magic_match_history WHERE user_uuid = ?
     ORDER BY played_at DESC LIMIT ?`,
  )
    .bind(userId, safeCount)
    .all<MatchRow>();

  if (rows.results.length === 0) {
    return {
      type: "structured",
      data: { total: 0, wins: 0, losses: 0, win_rate: 0, matches: [] },
    };
  }

  const wins = rows.results.filter((r) => r.result === "win").length;
  const total = rows.results.length;

  return {
    type: "structured",
    data: {
      total,
      wins,
      losses: total - wins,
      win_rate: winRate(wins, total),
      matches: rows.results.map((r) => ({
        date: r.played_at,
        format: r.format || "(unknown)",
        deck: r.deck_name || "(unknown)",
        result: r.result,
        opponent: r.opponent_name || "(unknown)",
      })),
    },
  };
}

// ── Module definition ────────────────────────────────────────

export const matchStatsModule: NativeReferenceModule = {
  id: "match_stats",
  name: "Match Stats",
  description: [
    "Personal Constructed match statistics from your Arena play history.",
    "",
    "MODES:",
    '1. mode="overview" → overall win rate with format breakdown.',
    '2. mode="by_deck" → win rate per deck.',
    '3. mode="by_format" → win rate per format.',
    '4. mode="by_matchup" → win rate vs each opponent archetype (classified from cards seen). Optional format filter.',
    '5. mode="trend" → recent N matches with results (default 10).',
    "",
    "All modes require user_id (provided automatically by the MCP context).",
  ].join("\n"),
  parameters: {
    mode: {
      type: "string",
      description:
        'Query mode: "overview", "by_deck", "by_format", "by_matchup", or "trend".',
      required: true,
    },
    user_id: {
      type: "string",
      description: "User UUID (provided automatically by MCP context).",
      required: true,
    },
    format: {
      type: "string",
      description:
        'Filter by format (e.g., "Standard"). Used with by_matchup mode.',
    },
    count: {
      type: "number",
      description: "Number of recent matches for trend mode (default 10).",
    },
  },


  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const userId = query.user_id as string | undefined;
    if (!userId) {
      return {
        type: "text",
        content: "Error: user_id is required for match_stats queries.",
      };
    }

    const mode = (query.mode as string) ?? "overview";

    switch (mode) {
      case "overview":
        return overview(userId, env);
      case "by_deck":
        return byDeck(userId, env);
      case "by_format":
        return byFormat(userId, env);
      case "by_matchup":
        return byMatchup(userId, query.format as string | undefined, env);
      case "trend":
        return trend(userId, (query.count as number) ?? 10, env);
      default:
        return {
          type: "text",
          content: `Unknown mode "${mode}". Use: overview, by_deck, by_format, by_matchup, trend.`,
        };
    }
  },
};
