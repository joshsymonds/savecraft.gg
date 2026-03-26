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
import { classifyArchetype } from "./archetype";

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

// ── Formatting helpers ───────────────────────────────────────

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

// ── Query implementations ────────────────────────────────────

async function overview(userId: string, env: Env): Promise<ReferenceResult> {
  const total = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM mtga_match_history WHERE user_uuid = ?",
  )
    .bind(userId)
    .first<{ n: number }>();

  if (!total || total.n === 0) {
    return { type: "formatted", content: "No match history found." };
  }

  const wins = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM mtga_match_history WHERE user_uuid = ? AND result = 'win'",
  )
    .bind(userId)
    .first<{ n: number }>();

  const byFormat = await env.DB.prepare(
    `SELECT format as group_key, COUNT(*) as total,
            SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins
     FROM mtga_match_history WHERE user_uuid = ?
     GROUP BY format ORDER BY total DESC`,
  )
    .bind(userId)
    .all<WinRateRow>();

  const lines: string[] = [];
  lines.push(`Match History — ${total.n} matches, ${pct(wins!.n, total.n)} overall win rate`);
  lines.push("");

  if (byFormat.results.length > 0) {
    lines.push("By Format:");
    lines.push(
      `  ${padRight("Format", 20)} ${padLeft("W", 4)} ${padLeft("L", 4)} ${padLeft("WR", 8)}`,
    );
    for (const f of byFormat.results) {
      const fmtName = f.group_key || "(unknown)";
      lines.push(
        `  ${padRight(fmtName, 20)} ${padLeft(String(f.wins), 4)} ${padLeft(String(f.total - f.wins), 4)} ${padLeft(pct(f.wins, f.total), 8)}`,
      );
    }
  }

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

async function byDeck(userId: string, env: Env): Promise<ReferenceResult> {
  const rows = await env.DB.prepare(
    `SELECT deck_name as group_key, COUNT(*) as total,
            SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins
     FROM mtga_match_history WHERE user_uuid = ?
     GROUP BY deck_name ORDER BY total DESC`,
  )
    .bind(userId)
    .all<WinRateRow>();

  if (rows.results.length === 0) {
    return { type: "formatted", content: "No match history found." };
  }

  const lines: string[] = [];
  lines.push("Win Rate by Deck:");
  lines.push(
    `  ${padRight("Deck", 30)} ${padLeft("W", 4)} ${padLeft("L", 4)} ${padLeft("WR", 8)} ${padLeft("Games", 6)}`,
  );
  for (const r of rows.results) {
    const name = r.group_key || "(no deck)";
    lines.push(
      `  ${padRight(name.slice(0, 30), 30)} ${padLeft(String(r.wins), 4)} ${padLeft(String(r.total - r.wins), 4)} ${padLeft(pct(r.wins, r.total), 8)} ${padLeft(String(r.total), 6)}`,
    );
  }

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

async function byFormat(userId: string, env: Env): Promise<ReferenceResult> {
  const rows = await env.DB.prepare(
    `SELECT format as group_key, COUNT(*) as total,
            SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins
     FROM mtga_match_history WHERE user_uuid = ?
     GROUP BY format ORDER BY total DESC`,
  )
    .bind(userId)
    .all<WinRateRow>();

  if (rows.results.length === 0) {
    return { type: "formatted", content: "No match history found." };
  }

  const lines: string[] = [];
  lines.push("Win Rate by Format:");
  lines.push(
    `  ${padRight("Format", 20)} ${padLeft("W", 4)} ${padLeft("L", 4)} ${padLeft("WR", 8)} ${padLeft("Games", 6)}`,
  );
  for (const r of rows.results) {
    const name = r.group_key || "(unknown)";
    lines.push(
      `  ${padRight(name, 20)} ${padLeft(String(r.wins), 4)} ${padLeft(String(r.total - r.wins), 4)} ${padLeft(pct(r.wins, r.total), 8)} ${padLeft(String(r.total), 6)}`,
    );
  }

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

async function byMatchup(
  userId: string,
  format: string | undefined,
  env: Env,
): Promise<ReferenceResult> {
  // Get all matches with opponent cards
  let query = "SELECT * FROM mtga_match_history WHERE user_uuid = ?";
  const binds: unknown[] = [userId];
  if (format) {
    query += " AND format = ?";
    binds.push(format);
  }
  query += " ORDER BY played_at DESC";

  const matches = await env.DB.prepare(query)
    .bind(...binds)
    .all<MatchRow>();

  if (matches.results.length === 0) {
    return { type: "formatted", content: "No match history found." };
  }

  // Classify each opponent and aggregate
  const archetypeStats = new Map<string, { wins: number; total: number }>();

  for (const m of matches.results) {
    let cards: { name: string; arena_id: number }[] = [];
    try {
      cards = JSON.parse(m.opponent_cards);
    } catch {
      // skip
    }
    const archetype = await classifyArchetype(env.DB, cards);
    const stats = archetypeStats.get(archetype) ?? { wins: 0, total: 0 };
    stats.total++;
    if (m.result === "win") stats.wins++;
    archetypeStats.set(archetype, stats);
  }

  const sorted = [...archetypeStats.entries()].sort((a, b) => b[1].total - a[1].total);

  const lines: string[] = [];
  const header = format ? `Matchup Breakdown (${format}):` : "Matchup Breakdown (all formats):";
  lines.push(header);
  lines.push(
    `  ${padRight("Opponent Archetype", 25)} ${padLeft("W", 4)} ${padLeft("L", 4)} ${padLeft("WR", 8)} ${padLeft("Games", 6)}`,
  );
  for (const [archetype, stats] of sorted) {
    lines.push(
      `  ${padRight(archetype.slice(0, 25), 25)} ${padLeft(String(stats.wins), 4)} ${padLeft(String(stats.total - stats.wins), 4)} ${padLeft(pct(stats.wins, stats.total), 8)} ${padLeft(String(stats.total), 6)}`,
    );
  }

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

async function trend(
  userId: string,
  count: number,
  env: Env,
): Promise<ReferenceResult> {
  const rows = await env.DB.prepare(
    `SELECT match_id, format, deck_name, result, opponent_name, played_at
     FROM mtga_match_history WHERE user_uuid = ?
     ORDER BY played_at DESC LIMIT ?`,
  )
    .bind(userId, count)
    .all<MatchRow>();

  if (rows.results.length === 0) {
    return { type: "formatted", content: "No match history found." };
  }

  const wins = rows.results.filter((r) => r.result === "win").length;
  const total = rows.results.length;

  const lines: string[] = [];
  lines.push(`Recent ${total} matches — ${pct(wins, total)} win rate`);
  lines.push("");
  lines.push(
    `  ${padRight("Date", 12)} ${padRight("Format", 12)} ${padRight("Deck", 22)} ${padLeft("Result", 6)} ${padRight("Opponent", 16)}`,
  );

  for (const r of rows.results) {
    const date = r.played_at.slice(0, 10);
    const resultLabel = r.result === "win" ? "W" : r.result === "loss" ? "L" : "D";
    lines.push(
      `  ${padRight(date, 12)} ${padRight((r.format || "?").slice(0, 12), 12)} ${padRight((r.deck_name || "?").slice(0, 22), 22)} ${padLeft(resultLabel, 6)} ${padRight((r.opponent_name || "?").slice(0, 16), 16)}`,
    );
  }

  return { type: "formatted", content: lines.join("\n") + "\n" };
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
        type: "formatted",
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
          type: "formatted",
          content: `Unknown mode "${mode}". Use: overview, by_deck, by_format, by_matchup, trend.`,
        };
    }
  },
};
