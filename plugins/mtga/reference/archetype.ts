/**
 * Shared opponent archetype classification from cards seen.
 * Used by match_stats and sideboard_analysis modules.
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

/**
 * Classify an opponent's archetype from the cards they revealed.
 * Looks up card colors from mtga_cards, returns a color-based label.
 */
export async function classifyArchetype(
  db: D1Database,
  opponentCards: { name: string; arena_id: number }[],
): Promise<string> {
  if (opponentCards.length === 0) return "Unknown";

  const placeholders = opponentCards.map(() => "?").join(", ");
  const arenaIds = opponentCards.map((c) => c.arena_id);

  const rows = await db
    .prepare(`SELECT arena_id, colors FROM mtga_cards WHERE arena_id IN (${placeholders})`)
    .bind(...arenaIds)
    .all<{ arena_id: number; colors: string }>();

  const allColors: string[] = [];
  for (const row of rows.results) {
    try {
      const colors = JSON.parse(row.colors) as string[];
      allColors.push(...colors);
    } catch {
      // skip unparseable
    }
  }

  if (allColors.length === 0) return "Unknown";

  const colorCounts = new Map<string, number>();
  for (const c of allColors) {
    colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1);
  }

  const total = allColors.length;
  const significantColors = [...colorCounts.entries()]
    .filter(([, count]) => count / total >= 0.2)
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
