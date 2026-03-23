/**
 * MTG Arena draft_ratings — native reference module.
 *
 * Queries 17Lands draft statistics from D1. Five query modes:
 *   1. No set       → list available sets
 *   2. Set only     → set overview (top/bottom by GIH WR, top by IWD, undervalued)
 *   3. Set + card   → single card detail with color pair breakdowns
 *   4. Set + cards  → side-by-side comparison table
 *   5. Set + sort   → leaderboard (paginated)
 */

import type { Env } from "../../../worker/src/types";
import type { NativeReferenceModule, ReferenceResult } from "../../../worker/src/reference/types";

const DEFAULT_PAGE_SIZE = 25;

interface RatingRow {
  set_code: string;
  card_name: string;
  games_in_hand: number;
  games_played: number;
  games_not_seen: number;
  gihwr: number;
  ohwr: number;
  gdwr: number;
  gnswr: number;
  iwd: number;
  alsa: number;
  ata: number;
}

interface ColorRow extends RatingRow {
  color_pair: string;
}

interface SetStatsRow {
  set_code: string;
  format: string;
  total_games: number;
  card_count: number;
  avg_gihwr: number;
}

// ── Formatting helpers ───────────────────────────────────────

function pct(f: number): string {
  return `${(f * 100).toFixed(1)}%`;
}

function iwdFmt(f: number): string {
  const val = (f * 100).toFixed(1);
  return f >= 0 ? `+${val}%` : `${val}%`;
}

function fmtInt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function truncName(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + "...";
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s : " ".repeat(len - s.length) + s;
}

function sortFieldLabel(field: string): string {
  switch (field) {
    case "gihwr": return "GIH WR";
    case "ohwr": return "OHWR";
    case "gdwr": return "GD WR";
    case "gnswr": return "GNS WR";
    case "iwd": return "IWD";
    case "alsa": return "ALSA (earliest seen)";
    case "ata": return "ATA (earliest taken)";
    default: return "GIH WR";
  }
}

// ── Query handlers ───────────────────────────────────────────

async function listAvailableSets(db: D1Database): Promise<ReferenceResult> {
  const rows = await db
    .prepare("SELECT * FROM mtga_draft_set_stats ORDER BY set_code")
    .all<SetStatsRow>();

  if (rows.results.length === 0) {
    return { type: "formatted", content: "No draft ratings data available.\n" };
  }

  const lines: string[] = [];
  lines.push("Available sets with 17Lands draft ratings:\n");
  for (const r of rows.results) {
    lines.push(`  ${r.set_code} — ${r.format}, ${fmtInt(r.total_games)} games, ${r.card_count} cards, avg GIH WR ${pct(r.avg_gihwr)}`);
  }
  lines.push(`\nSpecify a set code to see details. Data source: 17Lands (CC BY 4.0).`);

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

async function setOverview(db: D1Database, setCode: string, setStats: SetStatsRow): Promise<ReferenceResult> {
  const allCards = await db
    .prepare("SELECT * FROM mtga_draft_ratings WHERE set_code = ?1 ORDER BY gihwr DESC")
    .bind(setCode)
    .all<RatingRow>();

  const cards = allCards.results;
  const lines: string[] = [];

  lines.push(`${setCode} ${setStats.format} — ${fmtInt(setStats.total_games)} games, ${setStats.card_count} cards`);
  lines.push(`Set avg GIH WR: ${pct(setStats.avg_gihwr)}\n`);

  // Top 5 by GIH WR (already sorted desc)
  const n = Math.min(5, cards.length);
  lines.push("Top 5 by GIH WR:");
  for (let i = 0; i < n; i++) {
    const c = cards[i]!;
    lines.push(` ${i + 1}. ${padRight(truncName(c.card_name, 28), 28)} ${pct(c.gihwr)} (IWD ${iwdFmt(c.iwd)}, ${fmtInt(c.games_in_hand)} games)`);
  }

  // Bottom 5
  lines.push("\nBottom 5 by GIH WR:");
  for (let i = Math.max(0, cards.length - n); i < cards.length; i++) {
    const c = cards[i]!;
    lines.push(` ${i + 1}. ${padRight(truncName(c.card_name, 28), 28)} ${pct(c.gihwr)} (IWD ${iwdFmt(c.iwd)}, ${fmtInt(c.games_in_hand)} games)`);
  }

  // Top 5 by IWD
  const byIwd = [...cards].sort((a, b) => b.iwd - a.iwd);
  lines.push("\nTop 5 by IWD (most impactful when drawn):");
  for (let i = 0; i < Math.min(5, byIwd.length); i++) {
    const c = byIwd[i]!;
    lines.push(` ${i + 1}. ${padRight(truncName(c.card_name, 28), 28)} IWD ${iwdFmt(c.iwd)} (GIH WR ${pct(c.gihwr)}, ${fmtInt(c.games_in_hand)} games)`);
  }

  // Most undervalued (high GIH WR, late ALSA)
  const byUndervalued = [...cards].sort((a, b) => (b.gihwr * b.alsa) - (a.gihwr * a.alsa));
  lines.push("\nMost undervalued (high GIH WR, late ALSA):");
  let shown = 0;
  for (const c of byUndervalued) {
    if (c.alsa >= 4.0 && c.gihwr > setStats.avg_gihwr) {
      lines.push(` ${shown + 1}. ${padRight(truncName(c.card_name, 28), 28)} GIH WR ${pct(c.gihwr)}, ALSA ${c.alsa.toFixed(1)}`);
      shown++;
      if (shown >= 5) break;
    }
  }

  lines.push(`\n${setStats.card_count} cards available. Query with cards, card, limit, sort, or colors for details.`);

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

async function cardDetail(db: D1Database, setCode: string, cardQuery: string, setStats: SetStatsRow): Promise<ReferenceResult> {
  // FTS5 search for fuzzy matching
  const safeFtsQuery = `"${cardQuery.replace(/"/g, '""')}"`;
  const ftsResults = await db
    .prepare(
      `SELECT card_name FROM mtga_draft_ratings_fts WHERE set_code = ?1 AND mtga_draft_ratings_fts MATCH ?2 LIMIT 5`,
    )
    .bind(setCode, safeFtsQuery)
    .all<{ card_name: string }>();

  // Also try LIKE for substring matching
  const likeResults = await db
    .prepare(
      `SELECT card_name FROM mtga_draft_ratings WHERE set_code = ?1 AND card_name LIKE ?2 COLLATE NOCASE LIMIT 5`,
    )
    .bind(setCode, `%${cardQuery}%`)
    .all<{ card_name: string }>();

  // Merge unique card names
  const seen = new Set<string>();
  const matchNames: string[] = [];
  for (const r of [...ftsResults.results, ...likeResults.results]) {
    if (!seen.has(r.card_name)) {
      seen.add(r.card_name);
      matchNames.push(r.card_name);
    }
  }

  if (matchNames.length === 0) {
    return { type: "formatted", content: `No cards matching "${cardQuery}" in ${setCode}\n` };
  }

  // Fetch full stats for matched cards
  const placeholders = matchNames.map((_, i) => `?${i + 2}`).join(",");
  const ratings = await db
    .prepare(`SELECT * FROM mtga_draft_ratings WHERE set_code = ?1 AND card_name IN (${placeholders})`)
    .bind(setCode, ...matchNames)
    .all<RatingRow>();

  // Fetch color stats for all matched cards
  const colorStats = await db
    .prepare(`SELECT * FROM mtga_draft_color_stats WHERE set_code = ?1 AND card_name IN (${placeholders}) ORDER BY color_pair`)
    .bind(setCode, ...matchNames)
    .all<ColorRow>();

  // Group color stats by card name
  const colorsByCard = new Map<string, ColorRow[]>();
  for (const r of colorStats.results) {
    let list = colorsByCard.get(r.card_name);
    if (!list) {
      list = [];
      colorsByCard.set(r.card_name, list);
    }
    list.push(r);
  }

  const lines: string[] = [];
  for (let i = 0; i < Math.min(5, ratings.results.length); i++) {
    const card = ratings.results[i]!;
    if (i > 0) lines.push("\n---\n");

    lines.push(`${card.card_name} — ${setCode} ${setStats.format} (set avg GIH WR: ${pct(setStats.avg_gihwr)})\n`);

    lines.push(`Overall:  GIH WR ${pct(card.gihwr)} | IWD ${iwdFmt(card.iwd)} | OHWR ${pct(card.ohwr)} | GD WR ${pct(card.gdwr)} | GNS WR ${pct(card.gnswr)}`);
    lines.push(`          ALSA ${card.alsa.toFixed(1)} | ATA ${card.ata.toFixed(1)} | ${fmtInt(card.games_in_hand)} games in hand, ${fmtInt(card.games_played)} games in deck`);

    const colors = colorsByCard.get(card.card_name);
    if (colors && colors.length > 0) {
      lines.push("\nBy archetype:");
      for (const cs of colors) {
        lines.push(`  ${padRight(cs.color_pair, 5)}  GIH WR ${pct(cs.gihwr)} | IWD ${iwdFmt(cs.iwd)} | ${fmtInt(cs.games_in_hand)} games`);
      }
    }
  }

  if (ratings.results.length > 5) {
    lines.push(`\n(${ratings.results.length - 5} more matches, narrow your search)`);
  }

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

async function compareCards(db: D1Database, setCode: string, cardNames: string[], colorPair: string, setStats: SetStatsRow): Promise<ReferenceResult> {
  const lines: string[] = [];
  let header = `Card comparison — ${setCode} ${setStats.format}`;
  if (colorPair) header += ` (${colorPair} context)`;
  header += ` (set avg GIH WR: ${pct(setStats.avg_gihwr)})`;
  lines.push(header + "\n");

  lines.push(`${padRight("Card", 28)} ${padLeft("GIH WR", 8)} ${padLeft("IWD", 7)} ${padLeft("OHWR", 8)} ${padLeft("ALSA", 6)} ${padLeft("ATA", 6)} ${padLeft("Games", 8)}`);

  for (const name of cardNames) {
    // Try exact match first, then LIKE
    let row: RatingRow | null = null;

    if (colorPair) {
      const colorRow = await db
        .prepare("SELECT * FROM mtga_draft_color_stats WHERE set_code = ?1 AND card_name LIKE ?2 COLLATE NOCASE AND color_pair = ?3 LIMIT 1")
        .bind(setCode, `%${name}%`, colorPair.toUpperCase())
        .first<ColorRow>();
      if (colorRow) {
        row = colorRow;
      }
    }

    if (!row) {
      row = await db
        .prepare("SELECT * FROM mtga_draft_ratings WHERE set_code = ?1 AND card_name LIKE ?2 COLLATE NOCASE LIMIT 1")
        .bind(setCode, `%${name}%`)
        .first<RatingRow>();
    }

    if (!row) {
      lines.push(`${padRight(truncName(name, 28), 28)}  (not found)`);
      continue;
    }

    if (colorPair && !row) {
      lines.push(`${padRight(truncName(name, 28), 28)}  (no data for ${colorPair})`);
      continue;
    }

    lines.push(`${padRight(truncName(row.card_name, 28), 28)} ${padLeft(pct(row.gihwr), 8)} ${padLeft(iwdFmt(row.iwd), 7)} ${padLeft(pct(row.ohwr), 8)} ${padLeft(row.alsa.toFixed(1), 6)} ${padLeft(row.ata.toFixed(1), 6)} ${padLeft(fmtInt(row.games_in_hand), 8)}`);
  }

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

async function leaderboard(db: D1Database, setCode: string, sortField: string, colorPair: string, limit: number, offset: number, setStats: SetStatsRow): Promise<ReferenceResult> {
  const field = sortField || "gihwr";
  const sortLabel = sortFieldLabel(field);
  // For ALSA and ATA, lower is better so sort ASC
  const direction = (field === "alsa" || field === "ata") ? "ASC" : "DESC";

  let rows: RatingRow[];
  let total: number;

  if (colorPair) {
    const countResult = await db
      .prepare("SELECT COUNT(*) as cnt FROM mtga_draft_color_stats WHERE set_code = ?1 AND color_pair = ?2")
      .bind(setCode, colorPair.toUpperCase())
      .first<{ cnt: number }>();
    total = countResult?.cnt ?? 0;

    const result = await db
      .prepare(`SELECT set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata FROM mtga_draft_color_stats WHERE set_code = ?1 AND color_pair = ?2 ORDER BY ${field} ${direction} LIMIT ?3 OFFSET ?4`)
      .bind(setCode, colorPair.toUpperCase(), limit, offset)
      .all<RatingRow>();
    rows = result.results;
  } else {
    const countResult = await db
      .prepare("SELECT COUNT(*) as cnt FROM mtga_draft_ratings WHERE set_code = ?1")
      .bind(setCode)
      .first<{ cnt: number }>();
    total = countResult?.cnt ?? 0;

    const result = await db
      .prepare(`SELECT * FROM mtga_draft_ratings WHERE set_code = ?1 ORDER BY ${field} ${direction} LIMIT ?2 OFFSET ?3`)
      .bind(setCode, limit, offset)
      .all<RatingRow>();
    rows = result.results;
  }

  const lines: string[] = [];
  let header = `Top cards by ${sortLabel} — ${setCode} ${setStats.format}`;
  if (colorPair) header += ` (${colorPair})`;
  header += ` (set avg GIH WR: ${pct(setStats.avg_gihwr)})`;
  lines.push(header);
  lines.push(`Showing ${offset + 1}–${offset + rows.length} of ${total}\n`);

  lines.push(`${padLeft("#", 4)}  ${padRight("Card", 28)} ${padLeft("GIH WR", 8)} ${padLeft("IWD", 7)} ${padLeft("OHWR", 8)} ${padLeft("ALSA", 6)} ${padLeft("ATA", 6)} ${padLeft("Games", 8)}`);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    lines.push(`${padLeft(String(offset + i + 1) + ".", 4)}  ${padRight(truncName(r.card_name, 28), 28)} ${padLeft(pct(r.gihwr), 8)} ${padLeft(iwdFmt(r.iwd), 7)} ${padLeft(pct(r.ohwr), 8)} ${padLeft(r.alsa.toFixed(1), 6)} ${padLeft(r.ata.toFixed(1), 6)} ${padLeft(fmtInt(r.games_in_hand), 8)}`);
  }

  const remaining = total - offset - rows.length;
  if (remaining > 0) {
    lines.push(`\n${remaining} more results. Use offset=${offset + rows.length} for next page.`);
  }

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

// ── Module definition ────────────────────────────────────────

export const draftRatingsModule: NativeReferenceModule = {
  id: "draft_ratings",
  name: "Draft Ratings",
  description: [
    "Query 17Lands draft statistics for MTG Arena Premier Draft.",
    "USE PROACTIVELY: query this module when a player asks about draft picks, card evaluations, or archetype performance.",
    "Data includes Games in Hand Win Rate (GIH WR), Improvement When Drawn (IWD), Opening Hand Win Rate (OHWR), Average Last Seen At (ALSA), and Average Taken At (ATA).",
    "Query with just a set code for an overview. Add a card name for detailed stats with color pair breakdowns. Compare specific cards side-by-side with the cards parameter.",
    "Data source: 17Lands (17lands.com), licensed CC BY 4.0.",
  ].join(" "),
  parameters: {
    set: { type: "string", description: "Set code (e.g., 'DSK'). Required for all queries except listing available sets." },
    card: { type: "string", description: "Card name search (fuzzy). Returns detailed stats including color pair breakdowns." },
    cards: { type: "array", description: "Array of card names for side-by-side comparison (2-5 cards)." },
    colors: { type: "string", description: "Color pair filter for archetype-specific stats (e.g., 'UB')." },
    sort: { type: "string", description: "Sort field for leaderboard: 'gihwr' (default), 'ohwr', 'iwd', 'alsa', 'ata'." },
    limit: { type: "integer", description: "Max results for leaderboard (default 25)." },
    offset: { type: "integer", description: "Pagination offset for leaderboard." },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const setCode = ((query.set as string) ?? "").toUpperCase();
    const card = (query.card as string) ?? "";
    const cards = (query.cards as string[]) ?? [];
    const colors = ((query.colors as string) ?? "").toUpperCase();
    const sort = ((query.sort as string) ?? "").toLowerCase();
    const limit = typeof query.limit === "number" ? query.limit : DEFAULT_PAGE_SIZE;
    const offset = typeof query.offset === "number" ? query.offset : 0;

    // No set → list available sets
    if (!setCode) {
      return listAvailableSets(env.DB);
    }

    // Validate set exists
    const setStats = await env.DB
      .prepare("SELECT * FROM mtga_draft_set_stats WHERE set_code = ?1")
      .bind(setCode)
      .first<SetStatsRow>();

    if (!setStats) {
      const available = await env.DB
        .prepare("SELECT set_code FROM mtga_draft_set_stats ORDER BY set_code")
        .all<{ set_code: string }>();
      const codes = available.results.map((r) => r.set_code).join(", ");
      return { type: "formatted", content: `Set "${setCode}" not found. Available sets: ${codes}\n` };
    }

    // Route to query mode
    if (cards.length > 0) {
      return compareCards(env.DB, setCode, cards, colors, setStats);
    }
    if (card) {
      return cardDetail(env.DB, setCode, card, setStats);
    }
    if (sort || limit !== DEFAULT_PAGE_SIZE || offset > 0) {
      return leaderboard(env.DB, setCode, sort, colors, limit, offset, setStats);
    }

    return setOverview(env.DB, setCode, setStats);
  },
};
