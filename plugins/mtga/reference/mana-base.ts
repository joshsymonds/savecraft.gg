/**
 * MTG Arena mana_base — native reference module.
 *
 * Computes colored mana source requirements using Frank Karsten's published
 * tables. Resolves card names to mana costs from D1 mtga_cards table.
 *
 * Data source: Frank Karsten, "How Many Sources Do You Need to Consistently
 * Cast Your Spells? A 2022 Update" (ChannelFireball/TCGPlayer).
 */

import type { Env } from "../../../worker/src/types";
import type { NativeReferenceModule, ReferenceResult } from "../../../worker/src/reference/types";

// ── Karsten tables ───────────────────────────────────────────

const karstenTables: Record<number, Record<string, number>> = {
  60: {
    "C": 14, "1C": 13, "2C": 12, "3C": 10, "4C": 9, "5C": 9,
    "CC": 21, "1CC": 18, "2CC": 16, "3CC": 15, "4CC": 13, "5CC": 12,
    "CCC": 23, "1CCC": 21, "2CCC": 19, "3CCC": 17, "4CCC": 16,
    "CCCC": 24, "1CCCC": 22,
  },
  40: {
    "C": 9, "1C": 9, "2C": 8, "3C": 7, "4C": 6, "5C": 6,
    "CC": 14, "1CC": 12, "2CC": 11, "3CC": 10, "4CC": 9, "5CC": 8,
    "CCC": 16, "1CCC": 14, "2CCC": 13, "3CCC": 11, "4CCC": 10,
    "CCCC": 17, "1CCCC": 15,
  },
  80: {
    "C": 19, "1C": 18, "2C": 16, "3C": 15, "4C": 14, "5C": 12,
    "CC": 28, "1CC": 25, "2CC": 23, "3CC": 20, "4CC": 19, "5CC": 17,
    "CCC": 32, "1CCC": 29, "2CCC": 26, "3CCC": 24, "4CCC": 22,
    "CCCC": 34, "1CCCC": 31,
  },
  99: {
    "C": 19, "1C": 19, "2C": 18, "3C": 16, "4C": 15, "5C": 14,
    "CC": 30, "1CC": 28, "2CC": 26, "3CC": 23, "4CC": 22, "5CC": 20,
    "CCC": 36, "1CCC": 33, "2CCC": 30, "3CCC": 28, "4CCC": 26,
    "CCCC": 39, "1CCCC": 36,
  },
};

const assumedLandCounts: Record<number, number> = { 40: 17, 60: 25, 80: 35, 99: 41 };

const colorNames: Record<string, string> = {
  W: "White", U: "Blue", B: "Black", R: "Red", G: "Green",
};

const allColors = ["W", "U", "B", "R", "G"];

function closestDeckSize(n: number): number {
  const sizes = [40, 60, 80, 99];
  let best = sizes[0]!;
  for (const s of sizes) {
    if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  }
  return best;
}

function patternKey(generic: number, pips: number): string {
  if (generic === 0) return "C".repeat(pips);
  return `${generic}${"C".repeat(pips)}`;
}

function sourceRequirement(generic: number, pips: number, deckSize: number): number {
  const key = patternKey(generic, pips);
  const size = closestDeckSize(deckSize);
  return karstenTables[size]?.[key] ?? 0;
}

/** Parse colored pips from Scryfall mana cost. e.g., "{2}{B}{B}" → {B: 2} */
function parsePips(manaCost: string): Record<string, number> {
  const pips: Record<string, number> = {};
  for (const part of manaCost.split("{")) {
    const sym = part.replace("}", "");
    if (allColors.includes(sym)) {
      pips[sym] = (pips[sym] ?? 0) + 1;
    }
  }
  return pips;
}

/** Parse generic mana from Scryfall mana cost. e.g., "{2}{B}{B}" → 2 */
function parseGeneric(manaCost: string): number {
  let total = 0;
  for (const part of manaCost.split("{")) {
    const sym = part.replace("}", "");
    const n = parseInt(sym, 10);
    if (!isNaN(n)) total += n;
  }
  return total;
}

interface DeckEntry {
  name: string;
  count: number;
}

interface ColorRequirement {
  color: string;
  sourcesNeeded: number;
  mostDemanding: string;
  costPattern: string;
  pipsRequired: number;
  isGoldAdjusted: boolean;
}

// ── Module definition ────────────────────────────────────────

export const manaBaseModule: NativeReferenceModule = {
  id: "mana_base",
  name: "Mana Base",
  description: [
    "Analyze colored mana source requirements for a deck using Frank Karsten's methodology.",
    "Provide a deck list (card names + counts) and optionally a deck size (40, 60, 80, or 99; default 60).",
    "Returns the number of colored sources needed per color to achieve ~89%+ on-curve consistency.",
  ].join(" "),
  parameters: {
    deck: {
      type: "array",
      description: "Deck list: array of {name: string, count: number}.",
    },
    deck_size: {
      type: "integer",
      description: "Deck size: 40, 60, 80, or 99 (default 60).",
    },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const deck = (query.deck as DeckEntry[]) ?? [];
    const deckSize = (query.deck_size as number) ?? 60;

    // Resolve card names to mana costs from D1
    interface ResolvedCard {
      name: string;
      manaCost: string;
      colors: string[];
      count: number;
    }

    // Batch resolve card names to mana costs from D1
    const cardsByName = new Map<string, { name: string; mana_cost: string; colors: string }>();
    const names = deck.map((e) => e.name);
    for (let i = 0; i < names.length; i += 50) {
      const chunk = names.slice(i, i + 50);
      const placeholders = chunk.map((_, j) => `?${j + 1}`).join(",");
      const rows = await env.DB
        .prepare(`SELECT name, mana_cost, colors FROM mtga_cards WHERE is_default = 1 AND name COLLATE NOCASE IN (${placeholders})`)
        .bind(...chunk)
        .all<{ name: string; mana_cost: string; colors: string }>();
      for (const row of rows.results) {
        cardsByName.set(row.name.toLowerCase(), row);
      }
    }

    const resolved: ResolvedCard[] = [];
    const unresolvedCards: string[] = [];
    for (const entry of deck) {
      const row = cardsByName.get(entry.name.toLowerCase());
      if (!row || !row.mana_cost) {
        unresolvedCards.push(entry.name);
        continue;
      }

      resolved.push({
        name: row.name,
        manaCost: row.mana_cost,
        colors: JSON.parse(row.colors || "[]") as string[],
        count: entry.count,
      });
    }

    if (resolved.length === 0) {
      const note = unresolvedCards.length > 0
        ? `\nCards not found in Arena card database: ${unresolvedCards.join(", ")}\n`
        : "";
      return { type: "formatted", content: `No spells with mana costs found in deck.${note}\n` };
    }

    // For each color, find the most demanding spell
    const colorDemands = new Map<string, {
      pips: number;
      totalCMC: number;
      cardName: string;
      isGold: boolean;
    }>();

    for (const card of resolved) {
      const pips = parsePips(card.manaCost);
      const generic = parseGeneric(card.manaCost);
      const isGold = card.colors.length > 1;
      let totalCMC = generic;
      for (const p of Object.values(pips)) totalCMC += p;

      for (const color of allColors) {
        const p = pips[color];
        if (!p) continue;

        const existing = colorDemands.get(color);
        if (!existing || isDemanding(p, totalCMC, existing.pips, existing.totalCMC)) {
          colorDemands.set(color, { pips: p, totalCMC, cardName: card.name, isGold });
        }
      }
    }

    // Look up Karsten table for each color
    const requirements: ColorRequirement[] = [];
    for (const color of allColors) {
      const demand = colorDemands.get(color);
      if (!demand) continue;

      const generic = demand.totalCMC - demand.pips;
      let sources = sourceRequirement(generic, demand.pips, deckSize);

      // Gold card adjustment: +1 per color
      let adjusted = false;
      if (demand.isGold && sources > 0) {
        sources++;
        adjusted = true;
      }

      requirements.push({
        color,
        sourcesNeeded: sources,
        mostDemanding: demand.cardName,
        costPattern: patternKey(generic, demand.pips),
        pipsRequired: demand.pips,
        isGoldAdjusted: adjusted,
      });
    }

    // Sort by sources needed descending
    requirements.sort((a, b) => b.sourcesNeeded - a.sourcesNeeded);

    // Format output
    let spellCount = 0;
    for (const c of resolved) spellCount += c.count;

    const size = closestDeckSize(deckSize);
    const landCount = assumedLandCounts[size] ?? 25;

    const lines: string[] = [];
    lines.push(`Mana Base Analysis — ${deckSize}-card deck (${spellCount} spells, ~${landCount} lands assumed)`);
    lines.push(`Based on Frank Karsten's mana source requirements (~89%+ consistency on curve)\n`);

    if (requirements.length === 0) {
      lines.push("No colored mana requirements found.");
      return { type: "formatted", content: lines.join("\n") + "\n" };
    }

    lines.push(`${"Color".padEnd(14)} ${"Sources".padStart(3)}  ${"Pattern".padEnd(8)}  Most Demanding Spell`);
    for (const r of requirements) {
      const colorLabel = `${colorNames[r.color]} (${r.color})`;
      const adj = r.isGoldAdjusted ? " (+1 gold)" : "";
      lines.push(`${colorLabel.padEnd(14)} ${String(r.sourcesNeeded).padStart(3)}  ${r.costPattern.padEnd(8)}  ${r.mostDemanding}${adj}`);
    }

    if (requirements.length > 1) {
      const totalSources = requirements.reduce((sum, r) => sum + r.sourcesNeeded, 0);
      lines.push(`\nTotal colored sources needed: ${totalSources} (dual/tri lands count toward multiple colors)`);
    }

    lines.push(`\nKarsten guidelines assume ${landCount} lands in a ${deckSize}-card deck.`);
    if (requirements.length > 1) {
      lines.push("For multicolor decks, dual lands and fetch lands satisfy multiple color requirements simultaneously.");
    }

    if (unresolvedCards.length > 0) {
      lines.push(`\nNote: ${unresolvedCards.length} card(s) not found in Arena card database and excluded from analysis: ${unresolvedCards.join(", ")}`);
    }

    return { type: "formatted", content: lines.join("\n") + "\n" };
  },
};

/** More colored pips = more demanding. At equal pips, lower total CMC = must be cast earlier = more demanding. */
function isDemanding(pips: number, totalCMC: number, ePips: number, eTotalCMC: number): boolean {
  if (pips !== ePips) return pips > ePips;
  return totalCMC < eTotalCMC;
}
