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

interface CardMetaRow {
  name: string;
  cmc: number;
  mana_cost: string; // e.g. "{2}{U}{B}"
  colors: string; // JSON array, e.g. '["W","U"]'
}

interface SynergyDbRow {
  card_a: string;
  card_b: string;
  synergy_delta: number;
}

interface CurveDbRow {
  color_pair: string;
  cmc: number;
  avg_count: number;
  total_decks: number;
}

interface CardRoleRow {
  front_face_name: string;
  role: string;
}

// Target deck composition for limited (community consensus).
const ROLE_TARGETS = {
  removal: 5, // 4-6 removal spells, target 5
} as const;

interface PickRecommendation {
  card: string;
  composite_score: number;
  baseline: { score: number; gihwr: number; source: string };
  synergy: { score: number; top_synergies: Array<{ card: string; delta: number }> };
  curve: { score: number; cmc: number; pool_at_cmc: number; ideal_at_cmc: number };
  signal: { score: number; ata: number; current_pick: number };
  role: { score: number; is_removal: boolean; pool_removal: number; target_removal: number };
  castability: { score: number; max_pips: number; estimated_sources: number };
}

// ── Karsten castability table ────────────────────────────────
// Precomputed hypergeometric probability of having ≥pips colored sources
// by the turn you'd cast the card (40-card deck, 17 lands).
// P(≥k successes in n draws from N=40 with K successes)
// where n = 7 + turn - 1 (cards seen by turn T on the play).

function hypergeomCDF(N: number, K: number, n: number, k: number): number {
  // P(X >= k) = 1 - P(X <= k-1) = 1 - Σ(i=0..k-1) C(K,i)·C(N-K,n-i) / C(N,n)
  if (k <= 0) return 1;
  if (K < k) return 0;
  let sum = 0;
  for (let i = 0; i < k; i++) {
    sum += binomCoeff(K, i) * binomCoeff(N - K, n - i) / binomCoeff(N, n);
  }
  return 1 - sum;
}

function binomCoeff(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  // Use the smaller of k and n-k for efficiency.
  let result = 1;
  const m = Math.min(k, n - k);
  for (let i = 0; i < m; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result); // Avoid floating point drift for integers.
}

// Precompute: castabilityTable[sources][pips][turn] = probability.
// sources: 0-17, pips: 1-3, turns: 1-6.
const CASTABILITY_TABLE: number[][][] = (() => {
  const table: number[][][] = [];
  for (let sources = 0; sources <= 17; sources++) {
    table[sources] = [];
    for (let pips = 1; pips <= 3; pips++) {
      table[sources]![pips] = [];
      for (let turn = 1; turn <= 6; turn++) {
        const cardsSeen = 7 + turn - 1; // opening hand + draws
        table[sources]![pips]![turn] = hypergeomCDF(40, sources, cardsSeen, pips);
      }
    }
  }
  return table;
})();

/** Look up castability from the precomputed table. */
function castabilityLookup(sources: number, pips: number, turn: number): number {
  const s = Math.max(0, Math.min(17, Math.round(sources)));
  const p = Math.max(1, Math.min(3, pips));
  const t = Math.max(1, Math.min(6, turn));
  return CASTABILITY_TABLE[s]?.[p]?.[t] ?? 0;
}

/** Count colored pips per color from a mana cost string like "{2}{U}{B}{B}". */
function countPips(manaCost: string): Map<string, number> {
  const pips = new Map<string, number>();
  const matches = manaCost.matchAll(/\{([WUBRG])\}/g);
  for (const m of matches) {
    const color = m[1]!;
    pips.set(color, (pips.get(color) ?? 0) + 1);
  }
  return pips;
}

/** Estimate final mana sources per color from pool's color pip distribution. */
function estimateSources(poolMeta: CardMetaRow[]): Map<string, number> {
  const totalPips = new Map<string, number>();
  for (const card of poolMeta) {
    for (const [color, count] of countPips(card.mana_cost)) {
      totalPips.set(color, (totalPips.get(color) ?? 0) + count);
    }
  }
  const pipSum = [...totalPips.values()].reduce((a, b) => a + b, 0);
  if (pipSum === 0) return new Map();

  // Split 17 lands proportionally by pip count.
  const sources = new Map<string, number>();
  for (const [color, count] of totalPips) {
    sources.set(color, Math.round(17 * count / pipSum));
  }
  return sources;
}

interface ArchetypeCandidate {
  colorPair: string;
  weight: number;
}

// ── Sigmoid normalization ────────────────────────────────────
// Sigmoid transforms map raw scores to (0,1) with smooth saturation at extremes.
// Cards near the center get maximum differentiation; outliers (bombs, trap cards)
// asymptotically approach bounds without hard cutoffs.

function sigmoid(x: number, center: number, steepness: number): number {
  return 1 / (1 + Math.exp(-steepness * (x - center)));
}

// Per-component sigmoid parameters calibrated to empirical 17Lands data.
// center = typical midpoint, steepness = how quickly it saturates.
const SIGMOID_PARAMS = {
  baseline: { center: 0.52, steepness: 20 },  // GIH WR: mean ~52%, ±1σ ≈ 4.7%
  synergy:  { center: 0, steepness: 4 },       // Sum of deltas: typically ±0.5
  curve:    { center: 0, steepness: 3 },        // Gap score: typically ±1
  signal:   { center: 0, steepness: 3 },        // Pick deviation: typically ±1
} as const;

// ── Continuous pick-adaptive weights ─────────────────────────
// Smooth sigmoid transitions instead of discrete bands.
// Each weight is interpolated from start→end values across the draft.

function smoothWeight(pick: number, startVal: number, endVal: number, midpoint: number, steepness: number): number {
  const t = sigmoid(pick, midpoint, steepness);
  return startVal + (endVal - startVal) * t;
}

interface WeightSet {
  baseline: number;
  synergy: number;
  curve: number;
  signal: number;
  role: number;
  castability: number;
}

function getWeights(pickNumber: number): WeightSet {
  // Baseline: decreases from ~50% early to ~20% late (midpoint pick 12).
  const baseline = smoothWeight(pickNumber, 0.50, 0.20, 12, 0.25);
  // Synergy: increases from ~10% early to ~28% late (midpoint pick 15).
  const synergy = smoothWeight(pickNumber, 0.10, 0.28, 15, 0.25);
  // Curve: increases from ~8% early to ~18% late (midpoint pick 12).
  const curve = smoothWeight(pickNumber, 0.08, 0.18, 12, 0.25);
  // Signal: peaks mid-pack (~picks 6-10), then decreases.
  const signalPeak = Math.exp(-0.5 * ((pickNumber - 8) / 6) ** 2);
  const signal = 0.05 + 0.22 * signalPeak;
  // Role: increases from ~4% early to ~12% late (midpoint pick 10).
  const role = smoothWeight(pickNumber, 0.04, 0.12, 10, 0.25);
  // Castability: increases from ~5% early to ~12% late (midpoint pick 8).
  // Color commitment matters more as the mana base solidifies.
  const castability = smoothWeight(pickNumber, 0.05, 0.12, 8, 0.25);

  // Normalize so weights sum to 1.
  const total = baseline + synergy + curve + signal + role + castability;
  return {
    baseline: baseline / total,
    synergy: synergy / total,
    curve: curve / total,
    signal: signal / total,
    role: role / total,
    castability: castability / total,
  };
}

function getWeightProfileLabel(pickNumber: number): string {
  if (pickNumber <= 5) return "early";
  if (pickNumber <= 20) return "mid";
  return "late";
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

  // Fetch all card data in parallel (one lookup per card name).
  const cardLookups = cardNames.map(async (name): Promise<{ name: string; row: RatingRow | null }> => {
    let row: RatingRow | null = null;
    if (colorPair) {
      const colorRow = await db
        .prepare("SELECT * FROM mtga_draft_color_stats WHERE set_code = ?1 AND card_name LIKE ?2 COLLATE NOCASE AND color_pair = ?3 LIMIT 1")
        .bind(setCode, `%${name}%`, colorPair.toUpperCase())
        .first<ColorRow>();
      if (colorRow) row = colorRow;
    }
    if (!row) {
      row = await db
        .prepare("SELECT * FROM mtga_draft_ratings WHERE set_code = ?1 AND card_name LIKE ?2 COLLATE NOCASE LIMIT 1")
        .bind(setCode, `%${name}%`)
        .first<RatingRow>();
    }
    return { name, row };
  });
  const cardResults = await Promise.all(cardLookups);

  for (const { name, row } of cardResults) {
    if (!row) {
      lines.push(`${padRight(truncName(name, 28), 28)}  (not found)`);
      continue;
    }
    lines.push(`${padRight(truncName(row.card_name, 28), 28)} ${padLeft(pct(row.gihwr), 8)} ${padLeft(iwdFmt(row.iwd), 7)} ${padLeft(pct(row.ohwr), 8)} ${padLeft(row.alsa.toFixed(1), 6)} ${padLeft(row.ata.toFixed(1), 6)} ${padLeft(fmtInt(row.games_in_hand), 8)}`);
  }

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

const VALID_SORT_FIELDS = new Set(["gihwr", "ohwr", "gdwr", "gnswr", "iwd", "alsa", "ata"]);

async function leaderboard(db: D1Database, setCode: string, sortField: string, colorPair: string, limit: number, offset: number, setStats: SetStatsRow): Promise<ReferenceResult> {
  const field = VALID_SORT_FIELDS.has(sortField) ? sortField : "gihwr";
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

// ── Mode 6: Contextual pick recommendation ──────────────────

const ALL_COLOR_PAIRS = [
  "WU", "WB", "WR", "WG", "UB", "UR", "UG", "BR", "BG", "RG",
];

function parseColors(jsonStr: string): string[] {
  try {
    const arr = JSON.parse(jsonStr);
    return Array.isArray(arr) ? arr.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

function determineCandidateArchetypes(
  poolMeta: CardMetaRow[],
): ArchetypeCandidate[] {
  // Count color pips across pool.
  const pips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const card of poolMeta) {
    for (const c of parseColors(card.colors)) {
      if (c in pips) pips[c] = (pips[c] ?? 0) + 1;
    }
  }

  // Score each color pair by combined pip count.
  const scored = ALL_COLOR_PAIRS.map((pair) => ({
    colorPair: pair,
    score: (pips[pair[0]!] ?? 0) + (pips[pair[1]!] ?? 0),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Take top 3 with nonzero scores.
  const top = scored.filter((s) => s.score > 0).slice(0, 3);
  if (top.length === 0) {
    // No color signal — return overall as fallback.
    return [{ colorPair: "_overall", weight: 1.0 }];
  }

  const totalScore = top.reduce((s, t) => s + t.score, 0);
  return top.map((t) => ({
    colorPair: t.colorPair,
    weight: t.score / totalScore,
  }));
}

/** Build SQL-safe placeholders like ?2,?3,?4 starting from a given index. */
function placeholders(count: number, startIdx: number): string {
  return Array.from({ length: count }, (_, i) => `?${startIdx + i}`).join(",");
}

async function contextualPick(
  db: D1Database,
  setCode: string,
  pool: string[],
  pack: string[],
  pickNumber: number,
): Promise<ReferenceResult> {
  // 1. Resolve card metadata for all pool + pack cards.
  const allNames = [...new Set([...pool, ...pack])];
  const metaPlaceholders = placeholders(allNames.length, 1);
  const metaResult = await db
    .prepare(`SELECT front_face_name AS name, cmc, mana_cost, colors FROM mtga_cards WHERE front_face_name IN (${metaPlaceholders}) AND is_default = 1`)
    .bind(...allNames)
    .all<CardMetaRow>();
  const metaByName = new Map(metaResult.results.map((r) => [r.name, r]));

  // Resolve pool card metadata (filter to cards we found).
  const poolMeta = pool.map((n) => metaByName.get(n)).filter((m): m is CardMetaRow => m != null);
  const packMeta = pack.map((n) => metaByName.get(n)).filter((m): m is CardMetaRow => m != null);

  // 2. Determine candidate archetypes.
  const candidates = determineCandidateArchetypes(poolMeta);
  const primaryArchetype = candidates[0]?.colorPair ?? "_overall";
  const confidence = candidates.length > 0
    ? (candidates[0]?.weight ?? 0)
    : 0;

  // 3. Fetch baseline stats for pack cards.
  // Try color-pair-specific stats for each candidate archetype.
  const packNames = packMeta.map((m) => m.name);
  if (packNames.length === 0) {
    return { type: "structured", data: { error: "No pack cards found in card database" } };
  }

  // Fetch all independent data in parallel — these queries only depend on
  // packNames/poolNames (computed from metadata above), not on each other.
  const realCandidates = candidates.filter((c) => c.colorPair !== "_overall");
  const poolNames = poolMeta.map((m) => m.name);
  const allCardNames = [...new Set([...poolMeta.map((m) => m.name), ...packMeta.map((m) => m.name)])];

  // Build all query promises.
  const overallPlaceholders = placeholders(packNames.length, 2);
  const overallPromise = db
    .prepare(`SELECT * FROM mtga_draft_ratings WHERE set_code = ?1 AND card_name IN (${overallPlaceholders})`)
    .bind(setCode, ...packNames)
    .all<RatingRow>();

  const colorStatsPromises = realCandidates.map((cand) => {
    const colorPlaceholders = placeholders(packNames.length, 3);
    return db
      .prepare(`SELECT set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata FROM mtga_draft_color_stats WHERE set_code = ?1 AND color_pair = ?2 AND card_name IN (${colorPlaceholders})`)
      .bind(setCode, cand.colorPair, ...packNames)
      .all<RatingRow>();
  });

  const synergyPromise = (poolNames.length > 0 && packNames.length > 0)
    ? (() => {
      const packPH = placeholders(packNames.length, 2);
      const poolPH = placeholders(poolNames.length, 2 + packNames.length);
      return db
        .prepare(`SELECT card_a, card_b, synergy_delta FROM mtga_draft_synergies WHERE set_code = ?1 AND card_a IN (${packPH}) AND card_b IN (${poolPH})`)
        .bind(setCode, ...packNames, ...poolNames)
        .all<SynergyDbRow>();
    })()
    : Promise.resolve({ results: [] as SynergyDbRow[] });

  const curvePromise = (primaryArchetype !== "_overall")
    ? db
      .prepare(`SELECT cmc, avg_count FROM mtga_draft_archetype_curves WHERE set_code = ?1 AND color_pair = ?2`)
      .bind(setCode, primaryArchetype)
      .all<CurveDbRow>()
    : Promise.resolve({ results: [] as CurveDbRow[] });

  const rolePromise = (allCardNames.length > 0)
    ? (() => {
      const rolePH = placeholders(allCardNames.length, 2);
      return db
        .prepare(`SELECT front_face_name, role FROM mtga_card_roles WHERE set_code = ?1 AND front_face_name IN (${rolePH})`)
        .bind(setCode, ...allCardNames)
        .all<CardRoleRow>();
    })()
    : Promise.resolve({ results: [] as CardRoleRow[] });

  // Await all in parallel.
  const [overallRatings, ...colorStatsResults] = await Promise.all([
    overallPromise,
    ...colorStatsPromises,
  ]);
  const [synergyResult, curveResult, roleResult] = await Promise.all([
    synergyPromise,
    curvePromise,
    rolePromise,
  ]);

  // Process results.
  const overallByName = new Map(overallRatings.results.map((r) => [r.card_name, r]));

  const colorStatsByPairAndCard = new Map<string, Map<string, RatingRow>>();
  for (let i = 0; i < realCandidates.length; i++) {
    const byCard = new Map(colorStatsResults[i]!.results.map((r) => [r.card_name, r]));
    colorStatsByPairAndCard.set(realCandidates[i]!.colorPair, byCard);
  }

  const synergyByPackCard = new Map<string, Array<{ card: string; delta: number }>>();
  for (const row of synergyResult.results) {
    let list = synergyByPackCard.get(row.card_a);
    if (!list) {
      list = [];
      synergyByPackCard.set(row.card_a, list);
    }
    list.push({ card: row.card_b, delta: row.synergy_delta });
  }

  let idealCurve: Map<number, number> | null = null;
  if (curveResult.results.length > 0) {
    idealCurve = new Map(curveResult.results.map((r) => [r.cmc, r.avg_count]));
  }

  // Build pool CMC histogram.
  const poolCMCHist = new Map<number, number>();
  for (const card of poolMeta) {
    const bucket = Math.min(Math.floor(card.cmc), 7);
    poolCMCHist.set(bucket, (poolCMCHist.get(bucket) ?? 0) + 1);
  }

  const roleSet = new Set<string>();
  for (const row of roleResult.results) {
    if (row.role === "removal" || row.role === "sweeper" || row.role === "counterspell") {
      roleSet.add(row.front_face_name);
    }
  }

  // Count removal spells in pool.
  const poolRemoval = poolMeta.filter((m) => roleSet.has(m.name)).length;

  // 7. Estimate mana base for castability scoring.
  const estimatedSources = estimateSources(poolMeta);

  // 8. Compute scores for each pack card.
  const weights = getWeights(pickNumber);
  const profileLabel = getWeightProfileLabel(pickNumber);
  const sp = SIGMOID_PARAMS;

  const recommendations: PickRecommendation[] = [];

  for (const packCard of packMeta) {
    const name = packCard.name;

    // Baseline: multi-archetype weighted GIH WR.
    let baselineGihwr = 0;
    let baselineSource = "_overall";
    if (realCandidates.length > 0) {
      let weightedSum = 0;
      let totalWeight = 0;
      for (const cand of realCandidates) {
        const colorRow = colorStatsByPairAndCard.get(cand.colorPair)?.get(name);
        if (colorRow) {
          weightedSum += colorRow.gihwr * cand.weight;
          totalWeight += cand.weight;
          if (cand.weight > 0 && baselineSource === "_overall") {
            baselineSource = cand.colorPair;
          }
        }
      }
      if (totalWeight > 0) {
        baselineGihwr = weightedSum / totalWeight;
      } else {
        baselineGihwr = overallByName.get(name)?.gihwr ?? 0;
      }
    } else {
      baselineGihwr = overallByName.get(name)?.gihwr ?? 0;
    }

    // Synergy: sum of deltas with pool cards.
    const synergies = synergyByPackCard.get(name) ?? [];
    const synergySum = synergies.reduce((s, syn) => s + syn.delta, 0);
    const topSynergies = [...synergies].sort((a, b) => b.delta - a.delta).slice(0, 3);

    // Curve: gap detection + ideal curve comparison.
    const cardCMC = Math.min(Math.floor(packCard.cmc), 7);
    const poolAtCMC = poolCMCHist.get(cardCMC) ?? 0;
    const idealAtCMC = idealCurve?.get(cardCMC) ?? 0;
    let curveScore = 0;
    if (idealCurve && idealAtCMC > 0) {
      curveScore = (idealAtCMC - poolAtCMC) / idealAtCMC;
    } else if (poolAtCMC === 0 && pool.length > 3) {
      curveScore = 0.5;
    }

    // Signal: compare ATA (Average Taken At) against current pick.
    // ATA is preferred over ALSA because ALSA has systematic downward bias
    // (P1P1 always records ALSA=1 for the opened card).
    const ata = overallByName.get(name)?.ata ?? 0;
    let signalScore = 0;
    if (ata > 0) {
      signalScore = (pickNumber - ata) / ata;
    }

    // Role: does this card fill a deck composition gap?
    const isRemoval = roleSet.has(name);
    // Score: positive if the pool needs more removal and this card is removal.
    // Neutral for non-removal cards. Slightly negative if pool already has enough.
    let roleScore = 0;
    if (isRemoval) {
      roleScore = (ROLE_TARGETS.removal - poolRemoval) / ROLE_TARGETS.removal;
    }

    // Castability: can this card be cast reliably given the pool's mana base?
    const cardPips = countPips(packCard.mana_cost);
    const maxPips = Math.max(0, ...[...cardPips.values()]);
    const castTurn = Math.max(1, Math.min(6, Math.ceil(packCard.cmc)));
    let castabilityScore = 1.0; // Colorless cards are always castable.
    let castabilitySources = 17;
    if (maxPips > 0) {
      // Find the hardest color requirement (most pips of a single color).
      let worstCastability = 1.0;
      for (const [color, pips] of cardPips) {
        const sources = estimatedSources.get(color) ?? 0;
        const prob = castabilityLookup(sources, pips, castTurn);
        if (prob < worstCastability) {
          worstCastability = prob;
          castabilitySources = sources;
        }
      }
      castabilityScore = worstCastability;
    }

    // Sigmoid normalization for all components.
    const baselineNorm = sigmoid(baselineGihwr, sp.baseline.center, sp.baseline.steepness);
    const synergyNorm = sigmoid(synergySum, sp.synergy.center, sp.synergy.steepness);
    const curveNorm = sigmoid(curveScore, sp.curve.center, sp.curve.steepness);
    const signalNorm = sigmoid(signalScore, sp.signal.center, sp.signal.steepness);
    const roleNorm = sigmoid(roleScore, 0, 3);
    // Castability is already 0-1 (probability), use it directly.
    const castabilityNorm = castabilityScore;

    // WASPAS hybrid: blend of WSM (additive) and WPM (multiplicative).
    const wsm =
      weights.baseline * baselineNorm +
      weights.synergy * synergyNorm +
      weights.curve * curveNorm +
      weights.signal * signalNorm +
      weights.role * roleNorm +
      weights.castability * castabilityNorm;

    // WPM: Π(xi ^ wi). All values ∈ (0,1).
    // Guard castabilityNorm against exactly 0 (impossible to cast).
    const castNormSafe = Math.max(0.001, castabilityNorm);
    const wpm =
      baselineNorm ** weights.baseline *
      synergyNorm ** weights.synergy *
      curveNorm ** weights.curve *
      signalNorm ** weights.signal *
      roleNorm ** weights.role *
      castNormSafe ** weights.castability;

    // λ: 0.8 early (compensatory) → 0.3 late (non-compensatory).
    const lambda = smoothWeight(pickNumber, 0.8, 0.3, 15, 0.2);
    const compositeScore = lambda * wsm + (1 - lambda) * wpm;

    recommendations.push({
      card: name,
      composite_score: Math.round(compositeScore * 10000) / 10000,
      baseline: {
        score: Math.round(baselineNorm * 10000) / 10000,
        gihwr: baselineGihwr,
        source: baselineSource,
      },
      synergy: {
        score: Math.round(synergySum * 10000) / 10000,
        top_synergies: topSynergies,
      },
      curve: {
        score: Math.round(curveScore * 10000) / 10000,
        cmc: cardCMC,
        pool_at_cmc: poolAtCMC,
        ideal_at_cmc: Math.round(idealAtCMC * 100) / 100,
      },
      signal: {
        score: Math.round(signalScore * 10000) / 10000,
        ata,
        current_pick: pickNumber,
      },
      role: {
        score: Math.round(roleScore * 10000) / 10000,
        is_removal: isRemoval,
        pool_removal: poolRemoval,
        target_removal: ROLE_TARGETS.removal,
      },
      castability: {
        score: Math.round(castabilityScore * 10000) / 10000,
        max_pips: maxPips,
        estimated_sources: castabilitySources,
      },
    });
  }

  // Sort by composite score descending.
  recommendations.sort((a, b) => b.composite_score - a.composite_score);

  return {
    type: "structured",
    data: {
      archetype: {
        primary: primaryArchetype,
        candidates: candidates.map((c) => ({ color_pair: c.colorPair, weight: Math.round(c.weight * 100) / 100 })),
        confidence: Math.round(confidence * 100) / 100,
      },
      pick_number: pickNumber,
      weight_profile: profileLabel,
      weights: {
        baseline: Math.round(weights.baseline * 100) / 100,
        synergy: Math.round(weights.synergy * 100) / 100,
        curve: Math.round(weights.curve * 100) / 100,
        signal: Math.round(weights.signal * 100) / 100,
        role: Math.round(weights.role * 100) / 100,
        castability: Math.round(weights.castability * 100) / 100,
      },
      recommendations,
    },
  };
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
    "",
    "CONTEXTUAL PICK ADVICE: When the player is mid-draft, pass their current pool and pack to get ranked pick recommendations.",
    "Each card scores on 7 axes: baseline (archetype-weighted win rate), synergy (pairwise interaction with pool cards, deconfounded from archetype strength), curve (gap detection + ideal archetype CMC distribution), signal (archetype openness via ATA deviation), role (deck composition needs — removal, sweepers), castability (Karsten hypergeometric probability of casting on curve given estimated mana base), and a WASPAS hybrid composite that blends additive and multiplicative scoring.",
    "Component breakdowns explain WHY a card is recommended — use these to give the player actionable reasoning, not just 'pick this'. The composite ranks cards, but the components tell the story.",
    "Weights adapt smoothly to draft phase: early picks favor baseline + signal (card quality + is the archetype open?), mid picks balance all factors with signal peaking in the reading window (picks 6-10), late picks favor synergy + curve + role (deck optimization).",
    "",
    "DECK COMPOSITION: A typical limited deck wants ~16 creatures, 4-6 removal spells, and ~7 non-creature spells (23 total nonlands + 17 lands). The role score tracks removal count against a target of 5. If the pool is short on removal, removal spells score higher. Tell the player when their deck is light on removal or heavy on one card type.",
    "COLOR COMMITMENT: The castability score uses Frank Karsten's hypergeometric model. A card requiring {U}{U} with only 6 blue sources has ~65% castability — unreliable. Single-pip cards need 8+ sources; double-pip need 12+. Warn the player when a card's castability is below 80%. For splash cards (off-color, few sources), castability will be very low — explain that they'd need mana fixing (dual lands, mana rocks) to reliably cast it.",
    "SPLASH RULES: Only splash single-pip cards at CMC 4+, and only with 3+ sources of the splash color. Never splash double-pip cards. If the player asks about splashing, check the castability score — if it's below 0.7, the splash is unreliable without additional fixing.",
    "",
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
    pool: { type: "array", items: { type: "string" }, description: "Card names already drafted (current pool). Used with 'pack' for contextual pick recommendations." },
    pack: { type: "array", items: { type: "string" }, description: "Card names available in current pack. Used with 'pool' for contextual pick recommendations." },
    pick_number: { type: "integer", description: "Current pick number (1-42). Affects weight profile: early (1-5), mid (6-20), late (21-42). Default 10." },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const setCode = ((query.set as string) ?? "").toUpperCase();
    const card = (query.card as string) ?? "";
    const cards = (query.cards as string[]) ?? [];
    const colors = ((query.colors as string) ?? "").toUpperCase();
    const sort = ((query.sort as string) ?? "").toLowerCase();
    const limit = Math.min(Math.max(typeof query.limit === "number" ? query.limit : DEFAULT_PAGE_SIZE, 1), 100);
    const offset = Math.max(typeof query.offset === "number" ? query.offset : 0, 0);
    const pool = (query.pool as string[]) ?? [];
    const pack = (query.pack as string[]) ?? [];
    const pickNumber = Math.max(1, Math.min(42, typeof query.pick_number === "number" ? query.pick_number : 10));

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
    // Mode 6: contextual pick (pool + pack present)
    if (pool.length > 0 && pack.length > 0) {
      return contextualPick(env.DB, setCode, pool, pack, pickNumber);
    }

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
