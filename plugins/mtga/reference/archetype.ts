/**
 * Shared opponent archetype classification from cards seen.
 * Used by match_stats and sideboard_analysis modules.
 *
 * For batch use: call buildColorMap() once with all arena_ids, then
 * classifyFromColorMap() per match. Avoids N+1 D1 queries.
 */

const COLOR_NAMES: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const GUILD_NAMES: Record<string, string> = {
  WU: "Azorius",
  WB: "Orzhov",
  WR: "Boros",
  WG: "Selesnya",
  UB: "Dimir",
  UR: "Izzet",
  UG: "Simic",
  BR: "Rakdos",
  BG: "Golgari",
  RG: "Gruul",
};

const WUBRG_ORDER = "WUBRG";

function sortColors(colors: string[]): string {
  const unique = [...new Set(colors)];
  unique.sort((a, b) => WUBRG_ORDER.indexOf(a) - WUBRG_ORDER.indexOf(b));
  return unique.join("");
}

/** Color significance threshold: a color must appear in >= 20% of pips to count. */
const COLOR_SIGNIFICANCE_THRESHOLD = 0.2;

/**
 * Build a map of arena_id → color array from D1 in a single batch query.
 * Call once, then pass to classifyFromColorMap() for each match.
 */
export async function buildColorMap(
  db: D1Database,
  arenaIds: number[],
): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>();
  if (arenaIds.length === 0) return result;

  const unique = [...new Set(arenaIds)];
  // Batch in chunks of 100 to stay within D1 binding limits
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await db
      .prepare(`SELECT arena_id, colors FROM mtga_cards WHERE arena_id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ arena_id: number; colors: string }>();

    for (const row of rows.results) {
      try {
        const colors = JSON.parse(row.colors) as string[];
        result.set(row.arena_id, colors);
      } catch {
        // skip unparseable
      }
    }
  }
  return result;
}

/**
 * Classify an opponent's archetype using a pre-built color map.
 * No D1 queries — pure in-memory classification.
 */
export function classifyFromColorMap(
  colorMap: Map<number, string[]>,
  opponentCards: { name: string; arena_id: number }[],
): string {
  if (opponentCards.length === 0) return "Unknown";

  const allColors: string[] = [];
  for (const card of opponentCards) {
    const colors = colorMap.get(card.arena_id);
    if (colors) allColors.push(...colors);
  }

  if (allColors.length === 0) return "Unknown";

  const colorCounts = new Map<string, number>();
  for (const c of allColors) {
    colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1);
  }

  const total = allColors.length;
  const significantColors = [...colorCounts.entries()]
    .filter(([, count]) => count / total >= COLOR_SIGNIFICANCE_THRESHOLD)
    .map(([color]) => color);

  if (significantColors.length === 0) return "Colorless";

  const sorted = sortColors(significantColors);

  if (sorted.length === 1) {
    return `Mono ${COLOR_NAMES[sorted] ?? sorted}`;
  }

  if (sorted.length === 2) {
    return GUILD_NAMES[sorted] ?? `${sorted} Midrange`;
  }

  const names = sorted.split("").map((c) => COLOR_NAMES[c] ?? c);
  return names.join("/");
}

/**
 * Convenience: classify a single match's opponent archetype with a D1 query.
 * For batch use, prefer buildColorMap() + classifyFromColorMap().
 */
export async function classifyArchetype(
  db: D1Database,
  opponentCards: { name: string; arena_id: number }[],
): Promise<string> {
  if (opponentCards.length === 0) return "Unknown";
  const colorMap = await buildColorMap(
    db,
    opponentCards.map((c) => c.arena_id),
  );
  return classifyFromColorMap(colorMap, opponentCards);
}
