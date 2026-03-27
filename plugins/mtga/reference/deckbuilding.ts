/**
 * MTG Arena deckbuilding — native reference module.
 *
 * Two modes:
 *   1. Health check (deck only): Compare deck composition against empirical
 *      per-set data from mtga_draft_deck_stats + scoring primitives.
 *   2. Cut advisor (deck + cuts): Score each non-land card's contribution,
 *      rank by lowest → best cut candidates with per-axis breakdown.
 *
 * Uses shared scoring primitives from scoring.ts. No duplicated logic.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import {
  type CardMetaRow,
  type SynergyDbRow,
  type CurveDbRow,
  type CardRoleRow,
  type RoleTargetRow,
  countPips,
  estimateSources,
  castabilityLookup,
  determineCandidateArchetypes,
  placeholders,
  r4,
  META_BATCH_SIZE,
  computeViabilityTier,
} from "./scoring";

// ── Types ────────────────────────────────────────────────────

interface DeckEntry {
  name: string;
  count: number;
}

interface DeckStatsRow {
  set_code: string;
  archetype: string;
  avg_lands: number;
  avg_creatures: number;
  avg_noncreatures: number;
  avg_fixing: number;
  splash_rate: number;
  splash_avg_sources: number;
  splash_winrate: number;
  nonsplash_winrate: number;
  total_decks: number;
}

type SectionStatus = "good" | "warning" | "issue";

interface HealthSection {
  name: string;
  status: SectionStatus;
  actual: number;
  expected: number;
  note: string;
}

interface CutCandidate {
  card: string;
  score: number;
  axes: {
    baseline: number;
    synergy: number;
    curve: number;
    role: number;
    castability: number;
  };
  reason: string;
}

// ── Karsten mana base analysis ───────────────────────────────
//
// Frank Karsten, "How Many Sources Do You Need to Consistently
// Cast Your Spells? A 2022 Update" (ChannelFireball/TCGPlayer).

const KARSTEN_TABLES: Record<number, Record<string, number>> = {
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

const COLOR_NAMES: Record<string, string> = {
  W: "White", U: "Blue", B: "Black", R: "Red", G: "Green",
};

const ALL_COLORS = ["W", "U", "B", "R", "G"];

function closestDeckSize(n: number): number {
  const sizes = [40, 60, 80, 99];
  let best = sizes[0]!;
  for (const s of sizes) {
    if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  }
  return best;
}

function karstenPatternKey(generic: number, pips: number): string {
  if (generic === 0) return "C".repeat(pips);
  return `${generic}${"C".repeat(pips)}`;
}

function karstenSourceReq(generic: number, pips: number, deckSize: number): number {
  const key = karstenPatternKey(generic, pips);
  const size = closestDeckSize(deckSize);
  return KARSTEN_TABLES[size]?.[key] ?? 0;
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

/** More colored pips = more demanding. At equal pips, lower CMC = cast earlier = more demanding. */
function isMoreDemanding(pips: number, cmc: number, ePips: number, eCmc: number): boolean {
  if (pips !== ePips) return pips > ePips;
  return cmc < eCmc;
}

interface ManaColorAnalysis {
  color: string;
  color_name: string;
  sources_needed: number;
  sources_actual: number;
  surplus: number;
  status: SectionStatus;
  most_demanding: string;
  cost_pattern: string;
  is_gold_adjusted: boolean;
}

interface ManaSwapSuggestion {
  cut: string;
  add: string;
  reason: string;
}

interface ManaAnalysis {
  pip_distribution: Record<string, number>;
  colors: ManaColorAnalysis[];
  swap_suggestions: ManaSwapSuggestion[];
}

/**
 * Analyze the mana base of a deck: pip distribution, Karsten requirements,
 * actual sources from lands, surplus/deficit, and swap suggestions.
 */
function analyzeManaBase(
  deck: DeckEntry[],
  meta: Map<string, CardMetaRow>,
  deckSize: number,
): ManaAnalysis {
  // Count pip distribution across all spells
  const pipDist: Record<string, number> = {};
  // Track most demanding spell per color
  const colorDemands = new Map<string, {
    pips: number;
    totalCMC: number;
    cardName: string;
    isGold: boolean;
  }>();
  // Track actual sources per color from lands
  const actualSources = new Map<string, number>();
  // Track land composition for swap suggestions
  const basicCounts = new Map<string, { name: string; count: number; colors: string[] }>();
  const nonBasicLands: { name: string; count: number; producedColors: string[] }[] = [];

  for (const entry of deck) {
    const card = meta.get(entry.name.toLowerCase());
    if (!card) continue;

    const isLand = card.type_line.includes("Land");

    if (isLand) {
      // Count actual colored sources
      let producedColors: string[] = [];
      if (card.produced_mana && card.produced_mana !== "[]") {
        try {
          const produced = JSON.parse(card.produced_mana) as string[];
          producedColors = produced.filter((c) => ALL_COLORS.includes(c));
          for (const color of producedColors) {
            actualSources.set(color, (actualSources.get(color) ?? 0) + entry.count);
          }
        } catch {
          // Malformed produced_mana — skip
        }
      }

      // Track basics vs non-basics for swap suggestions
      if (card.type_line.includes("Basic")) {
        const key = card.name.toLowerCase();
        const existing = basicCounts.get(key);
        if (existing) {
          existing.count += entry.count;
        } else {
          basicCounts.set(key, { name: card.name, count: entry.count, colors: producedColors });
        }
      } else if (producedColors.length > 0) {
        nonBasicLands.push({ name: card.name, count: entry.count, producedColors });
      }
    } else {
      // Count pips
      const pips = countPips(card.mana_cost);
      const colors = JSON.parse(card.colors || "[]") as string[];
      const isGold = colors.length > 1;
      const generic = parseGeneric(card.mana_cost);
      let totalCMC = generic;
      for (const [, count] of pips) totalCMC += count;

      for (const [color, count] of pips) {
        pipDist[color] = (pipDist[color] ?? 0) + count * entry.count;

        // Track most demanding
        const existing = colorDemands.get(color);
        if (!existing || isMoreDemanding(count, totalCMC, existing.pips, existing.totalCMC)) {
          colorDemands.set(color, { pips: count, totalCMC, cardName: card.name, isGold });
        }
      }
    }
  }

  // Compute Karsten requirements per color
  const colors: ManaColorAnalysis[] = [];
  for (const color of ALL_COLORS) {
    const demand = colorDemands.get(color);
    if (!demand) continue;

    const generic = demand.totalCMC - demand.pips;
    let sourcesNeeded = karstenSourceReq(generic, demand.pips, deckSize);

    // Gold card adjustment: +1 per color
    let adjusted = false;
    if (demand.isGold && sourcesNeeded > 0) {
      sourcesNeeded++;
      adjusted = true;
    }

    const sourcesActual = actualSources.get(color) ?? 0;
    const surplus = sourcesActual - sourcesNeeded;
    const status: SectionStatus =
      surplus >= 0 ? "good" : surplus >= -3 ? "warning" : "issue";

    colors.push({
      color,
      color_name: COLOR_NAMES[color] ?? color,
      sources_needed: sourcesNeeded,
      sources_actual: sourcesActual,
      surplus,
      status,
      most_demanding: demand.cardName,
      cost_pattern: karstenPatternKey(generic, demand.pips),
      is_gold_adjusted: adjusted,
    });
  }

  // Sort by deficit first (worst surplus first)
  colors.sort((a, b) => a.surplus - b.surplus);

  // Generate swap suggestions
  const swapSuggestions: ManaSwapSuggestion[] = [];
  const deficitColors = colors.filter((c) => c.surplus < 0);
  const surplusColors = colors.filter((c) => c.surplus > 0);

  // Map basic land names to their colors
  const colorToBasic: Record<string, string> = {
    W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest",
  };

  if (deficitColors.length > 0) {
    // First: suggest swapping surplus basics for deficit basics
    for (const deficit of deficitColors) {
      const needed = Math.abs(deficit.surplus);
      const targetBasic = colorToBasic[deficit.color];
      if (!targetBasic) continue;

      // Find surplus basics to cut
      for (const surp of surplusColors) {
        const surpBasic = colorToBasic[surp.color];
        if (!surpBasic) continue;
        const surpLand = basicCounts.get(surpBasic.toLowerCase());
        if (!surpLand || surpLand.count <= 1) continue; // keep at least 1

        const canSwap = Math.min(needed, Math.min(surp.surplus, surpLand.count - 1));
        if (canSwap > 0) {
          swapSuggestions.push({
            cut: `${canSwap}x ${surpLand.name}`,
            add: `${canSwap}x ${targetBasic}`,
            reason: `${deficit.color_name} is ${Math.abs(deficit.surplus)} sources short (need ${deficit.sources_needed}, have ${deficit.sources_actual}). ${surp.color_name} has ${surp.surplus} surplus.`,
          });
        }
      }

      // Second: suggest dual/tri-lands from outside the deck that would help
      // Epic anti-pattern says no format-aware pools, so only suggest if
      // existing non-basic lands in the deck produce the deficit color and
      // could replace a surplus basic (dual already in deck but could add more)
      for (const nb of nonBasicLands) {
        if (nb.producedColors.includes(deficit.color)) {
          // This dual already helps — check if any of its other colors are surplus
          for (const otherColor of nb.producedColors) {
            if (otherColor === deficit.color) continue;
            const surpEntry = surplusColors.find((s) => s.color === otherColor);
            if (surpEntry) {
              swapSuggestions.push({
                cut: `1x ${colorToBasic[otherColor] ?? "basic"}`,
                add: `1x ${nb.name}`,
                reason: `${nb.name} produces both ${COLOR_NAMES[deficit.color] ?? deficit.color} and ${COLOR_NAMES[otherColor] ?? otherColor}. Replacing a ${COLOR_NAMES[otherColor] ?? otherColor} basic adds a ${deficit.color_name} source without losing ${COLOR_NAMES[otherColor] ?? otherColor}.`,
              });
              break; // one suggestion per dual
            }
          }
        }
      }
    }
  }

  return {
    pip_distribution: pipDist,
    colors,
    swap_suggestions: swapSuggestions,
  };
}

// ── Card resolution ──────────────────────────────────────────

async function resolveCards(
  db: D1Database,
  names: string[],
): Promise<Map<string, CardMetaRow>> {
  const result = new Map<string, CardMetaRow>();
  const unique = [...new Set(names)];
  for (let i = 0; i < unique.length; i += META_BATCH_SIZE) {
    const chunk = unique.slice(i, i + META_BATCH_SIZE);
    const ph = placeholders(chunk.length, 1);
    const rows = await db
      .prepare(
        `SELECT front_face_name AS name, cmc, mana_cost, colors, type_line, produced_mana FROM mtga_cards WHERE front_face_name COLLATE NOCASE IN (${ph}) AND is_default = 1`,
      )
      .bind(...chunk)
      .all<CardMetaRow>();
    for (const row of rows.results) {
      result.set(row.name.toLowerCase(), row);
    }
  }
  return result;
}

// ── Set inference ────────────────────────────────────────────

async function inferSet(
  db: D1Database,
  cardNames: string[],
): Promise<string | null> {
  const setCounts = new Map<string, number>();
  for (let i = 0; i < cardNames.length; i += META_BATCH_SIZE) {
    const chunk = cardNames.slice(i, i + META_BATCH_SIZE);
    const ph = placeholders(chunk.length, 1);
    const rows = await db
      .prepare(
        `SELECT set_code, COUNT(*) as matches FROM mtga_draft_ratings WHERE card_name IN (${ph}) GROUP BY set_code`,
      )
      .bind(...chunk)
      .all<{ set_code: string; matches: number }>();
    for (const row of rows.results) {
      setCounts.set(
        row.set_code,
        (setCounts.get(row.set_code) ?? 0) + row.matches,
      );
    }
  }
  if (setCounts.size === 0) return null;
  let best = "";
  let bestCount = 0;
  for (const [set, count] of setCounts) {
    if (count > bestCount) {
      best = set;
      bestCount = count;
    }
  }
  return best || null;
}

// ── Health check mode ────────────────────────────────────────

function statusFromDelta(
  actual: number,
  expected: number,
  warnThreshold: number,
  issueThreshold: number,
): SectionStatus {
  const delta = Math.abs(actual - expected);
  if (delta <= warnThreshold) return "good";
  if (delta <= issueThreshold) return "warning";
  return "issue";
}

interface ArchetypeInfo {
  primary: string;
  candidates: {
    archetype: string;
    weight: number;
    deck_count: number;
    deck_share: number;
    viability: string;
    format_context: string;
  }[];
  confidence: number;
}

async function buildArchetypeInfo(
  db: D1Database,
  setCode: string,
  candidates: { archetype: string; weight: number }[],
): Promise<ArchetypeInfo> {
  const allDeckStats = await db
    .prepare(
      `SELECT archetype, total_decks FROM mtga_draft_deck_stats WHERE set_code = ?1`,
    )
    .bind(setCode)
    .all<{ archetype: string; total_decks: number }>();

  const deckCountByArch = new Map<string, number>();
  for (const row of allDeckStats.results) {
    deckCountByArch.set(row.archetype, row.total_decks);
  }
  const totalDecks = [...deckCountByArch.values()].reduce((a, b) => a + b, 0);
  const allShares = [...deckCountByArch.values()].map((c) =>
    totalDecks > 0 ? c / totalDecks : 0,
  );

  const primary = candidates[0]?.archetype ?? "_overall";
  const confidence = candidates[0]?.weight ?? 0;

  return {
    primary,
    candidates: candidates
      .filter((c) => {
        if (c.archetype === "_overall") return true;
        if (totalDecks === 0) return true;
        const count = deckCountByArch.get(c.archetype) ?? 0;
        return count / totalDecks >= 0.02;
      })
      .map((c) => {
        const count = deckCountByArch.get(c.archetype) ?? 0;
        const share =
          totalDecks > 0
            ? Math.round((count / totalDecks) * 1000) / 1000
            : 0;
        const { viability, format_context } = computeViabilityTier(
          share,
          allShares,
        );
        return {
          archetype: c.archetype,
          weight: Math.round(c.weight * 100) / 100,
          deck_count: count,
          deck_share: share,
          viability,
          format_context,
        };
      }),
    confidence: Math.round(confidence * 100) / 100,
  };
}

async function healthCheck(
  db: D1Database,
  deck: DeckEntry[],
  meta: Map<string, CardMetaRow>,
  setCode: string,
): Promise<{
  sections: HealthSection[];
  archetype: ArchetypeInfo;
  alternatives: ArchetypeAlternative[];
  unresolved: string[];
}> {
  // Classify cards
  let landCount = 0;
  let creatureCount = 0;
  let noncreatureCount = 0;
  let fixingCount = 0;
  const spellMeta: CardMetaRow[] = [];
  const unresolved: string[] = [];

  for (const entry of deck) {
    const card = meta.get(entry.name.toLowerCase());
    if (!card) {
      unresolved.push(entry.name);
      continue;
    }
    if (card.type_line.includes("Land")) {
      landCount += entry.count;
      // Fixing = non-basic land with produced_mana
      if (
        !card.type_line.includes("Basic") &&
        card.produced_mana &&
        card.produced_mana !== "[]"
      ) {
        fixingCount += entry.count;
      }
    } else {
      if (card.type_line.includes("Creature")) {
        creatureCount += entry.count;
      } else {
        noncreatureCount += entry.count;
      }
      for (let j = 0; j < entry.count; j++) spellMeta.push(card);
    }
  }

  // Detect archetype — post-draft, so use late pick to suppress early flattening.
  const candidates = determineCandidateArchetypes(spellMeta, 42);
  const primaryArchetype = candidates[0]?.archetype ?? "_overall";

  // Fetch all set-level data in parallel — independent D1 queries.
  const [deckStatsResult, curveResult, roleResult, cardRolesResult] =
    await Promise.all([
      db
        .prepare(
          `SELECT * FROM mtga_draft_deck_stats WHERE set_code = ?1 AND archetype = ?2`,
        )
        .bind(setCode, primaryArchetype)
        .all<DeckStatsRow>(),
      db
        .prepare(
          `SELECT cmc, avg_count FROM mtga_draft_archetype_curves WHERE set_code = ?1 AND archetype = ?2`,
        )
        .bind(setCode, primaryArchetype)
        .all<CurveDbRow>(),
      db
        .prepare(
          `SELECT role, avg_count FROM mtga_draft_role_targets WHERE set_code = ?1 AND archetype = ?2`,
        )
        .bind(setCode, primaryArchetype)
        .all<RoleTargetRow>(),
      db
        .prepare(
          `SELECT front_face_name, role FROM mtga_card_roles WHERE set_code = ?1`,
        )
        .bind(setCode)
        .all<CardRoleRow>(),
    ]);

  const stats = deckStatsResult.results[0];
  const cardRoleMap = new Map<string, Set<string>>();
  for (const row of cardRolesResult.results) {
    if (!cardRoleMap.has(row.front_face_name)) {
      cardRoleMap.set(row.front_face_name, new Set());
    }
    cardRoleMap.get(row.front_face_name)!.add(row.role);
  }

  const sections: HealthSection[] = [];

  if (stats) {
    // Land count
    sections.push({
      name: "lands",
      status: statusFromDelta(landCount, stats.avg_lands, 1, 3),
      actual: landCount,
      expected: r4(stats.avg_lands),
      note:
        landCount < stats.avg_lands - 1
          ? `Low land count — winning ${primaryArchetype} decks average ${r4(stats.avg_lands)} lands`
          : landCount > stats.avg_lands + 1
            ? `High land count — winning ${primaryArchetype} decks average ${r4(stats.avg_lands)} lands`
            : `Land count is in line with winning ${primaryArchetype} decks`,
    });

    // Creature count
    sections.push({
      name: "creatures",
      status: statusFromDelta(creatureCount, stats.avg_creatures, 2, 4),
      actual: creatureCount,
      expected: r4(stats.avg_creatures),
      note:
        creatureCount < stats.avg_creatures - 2
          ? `Low creature count — winning decks average ${r4(stats.avg_creatures)}`
          : creatureCount > stats.avg_creatures + 2
            ? `High creature count — winning decks average ${r4(stats.avg_creatures)}`
            : `Creature count matches winning ${primaryArchetype} decks`,
    });

    // Noncreature spells
    sections.push({
      name: "noncreatures",
      status: statusFromDelta(
        noncreatureCount,
        stats.avg_noncreatures,
        2,
        4,
      ),
      actual: noncreatureCount,
      expected: r4(stats.avg_noncreatures),
      note:
        noncreatureCount < stats.avg_noncreatures - 2
          ? `Low noncreature count — winning decks average ${r4(stats.avg_noncreatures)}`
          : noncreatureCount > stats.avg_noncreatures + 2
            ? `High noncreature count — winning decks average ${r4(stats.avg_noncreatures)}`
            : `Noncreature count matches winning ${primaryArchetype} decks`,
    });

    // Fixing
    sections.push({
      name: "fixing",
      status: statusFromDelta(fixingCount, stats.avg_fixing, 1, 2),
      actual: fixingCount,
      expected: r4(stats.avg_fixing),
      note:
        fixingCount < stats.avg_fixing - 1
          ? `Low fixing — winning decks average ${r4(stats.avg_fixing)} fixing lands`
          : `Fixing land count is reasonable for ${primaryArchetype}`,
    });

    // Splash viability — assess when deck has 3+ colors in spell pips
    const deckColors = new Set<string>();
    for (const card of spellMeta) {
      for (const [color] of countPips(card.mana_cost)) {
        deckColors.add(color);
      }
    }
    if (deckColors.size >= 3 && stats.splash_rate > 0) {
      const splashWrDelta = stats.splash_winrate - stats.nonsplash_winrate;
      const splashViable = fixingCount >= stats.splash_avg_sources;
      sections.push({
        name: "splash",
        status: splashViable ? (splashWrDelta >= -0.02 ? "good" : "warning") : "issue",
        actual: fixingCount,
        expected: r4(stats.splash_avg_sources),
        note: splashViable
          ? `Splashing with ${fixingCount} fixing sources (avg ${r4(stats.splash_avg_sources)} in winning splash decks). ` +
            `Splash win rate: ${Math.round(stats.splash_winrate * 100)}% vs ${Math.round(stats.nonsplash_winrate * 100)}% non-splash in ${primaryArchetype}.`
          : `Low fixing for a splash — winning splash decks average ${r4(stats.splash_avg_sources)} fixing sources. ` +
            `${Math.round(stats.splash_rate * 100)}% of ${primaryArchetype} games involve a splash.`,
      });
    }
  }

  // Curve analysis
  if (curveResult.results.length > 0) {
    const idealCurve = new Map<number, number>();
    for (const row of curveResult.results) {
      idealCurve.set(row.cmc, row.avg_count);
    }

    // Build actual curve
    const actualCurve = new Map<number, number>();
    for (const entry of deck) {
      const card = meta.get(entry.name.toLowerCase());
      if (!card || card.type_line.includes("Land")) continue;
      const cmc = Math.min(Math.round(card.cmc), 7);
      actualCurve.set(cmc, (actualCurve.get(cmc) ?? 0) + entry.count);
    }

    // Full curve assessment — check each CMC slot against archetype ideal
    const allCmcs = new Set([...idealCurve.keys(), ...actualCurve.keys()]);
    let worstCmcDelta = 0;
    let worstCmcSlot = 0;
    const deviations: Array<{ cmc: number; actual: number; ideal: number; delta: number }> = [];
    for (const cmc of [...allCmcs].sort((a, b) => a - b)) {
      const actual = actualCurve.get(cmc) ?? 0;
      const ideal = idealCurve.get(cmc) ?? 0;
      if (ideal > 0) {
        const delta = actual - ideal;
        deviations.push({ cmc, actual, ideal: r4(ideal), delta: r4(delta) });
        if (Math.abs(delta) > Math.abs(worstCmcDelta)) {
          worstCmcDelta = delta;
          worstCmcSlot = cmc;
        }
      }
    }

    // 2-drops get a dedicated section (most impactful slot in limited)
    const actual2 = actualCurve.get(2) ?? 0;
    const ideal2 = idealCurve.get(2) ?? 5;
    sections.push({
      name: "curve_2drops",
      status: statusFromDelta(actual2, ideal2, 2, 4),
      actual: actual2,
      expected: r4(ideal2),
      note:
        actual2 < ideal2 - 2
          ? `Low on 2-drops (${actual2} vs ${r4(ideal2)} avg) — this is the most important curve slot in limited`
          : `2-drop count is healthy for ${primaryArchetype}`,
    });

    // Overall curve health — flag worst deviation if significant
    if (Math.abs(worstCmcDelta) > 2) {
      const cmcLabel = worstCmcSlot >= 7 ? "7+" : String(worstCmcSlot);
      sections.push({
        name: "curve_overall",
        status: statusFromDelta(0, Math.abs(worstCmcDelta), 2, 4),
        actual: worstCmcDelta,
        expected: 0,
        note: worstCmcDelta > 0
          ? `Surplus at ${cmcLabel} CMC (${r4(worstCmcDelta)} above avg) — consider cutting high-CMC cards`
          : `Deficit at ${cmcLabel} CMC (${r4(Math.abs(worstCmcDelta))} below avg) — deck may lack plays at this slot`,
      });
    }
  }

  // Mana source assessment
  const sources = estimateSources(spellMeta);
  if (sources.size > 0) {
    // Find the most demanding color
    let worstColor = "";
    let worstProb = 1;
    for (const card of spellMeta) {
      const pips = countPips(card.mana_cost);
      for (const [color, pipCount] of pips) {
        const colorSources = sources.get(color) ?? 0;
        const prob = castabilityLookup(
          colorSources,
          pipCount,
          Math.round(card.cmc),
        );
        if (prob < worstProb) {
          worstProb = prob;
          worstColor = color;
        }
      }
    }
    if (worstColor) {
      sections.push({
        name: "castability",
        status:
          worstProb >= 0.85
            ? "good"
            : worstProb >= 0.7
              ? "warning"
              : "issue",
        actual: r4(worstProb),
        expected: 0.85,
        note:
          worstProb < 0.7
            ? `Castability concern: worst-case ${worstColor} spell has only ${Math.round(worstProb * 100)}% on-curve probability`
            : worstProb < 0.85
              ? `Marginal castability for ${worstColor} — ${Math.round(worstProb * 100)}% on-curve`
              : `Mana base supports all spells at 85%+ on-curve probability`,
      });
    }
  }

  // Role composition
  if (roleResult.results.length > 0) {
    const roleTargets = new Map<string, number>();
    for (const rt of roleResult.results) {
      roleTargets.set(rt.role, rt.avg_count);
    }

    // Count removal in deck
    const removalTarget = roleTargets.get("removal") ?? 0;
    if (removalTarget > 0) {
      let removalCount = 0;
      for (const entry of deck) {
        const card = meta.get(entry.name.toLowerCase());
        if (!card) continue;
        const roles = cardRoleMap.get(card.name);
        if (roles?.has("removal")) removalCount += entry.count;
      }
      sections.push({
        name: "removal",
        status: statusFromDelta(removalCount, removalTarget, 1, 3),
        actual: removalCount,
        expected: r4(removalTarget),
        note:
          removalCount < removalTarget - 1
            ? `Low removal (${removalCount} vs ${r4(removalTarget)} avg) — consider prioritizing removal spells`
            : `Removal count is adequate for ${primaryArchetype}`,
      });
    }
  }

  // CABS assessment — count non-CABS cards (don't affect the board state).
  // Only report if cabs role data exists for this set.
  const hasCabsRoles = [...cardRoleMap.values()].some((roles) =>
    roles.has("cabs"),
  );
  if (hasCabsRoles) {
    let cabsCount = 0;
    let totalSpells = 0;
    for (const entry of deck) {
      const card = meta.get(entry.name.toLowerCase());
      if (!card || card.type_line.includes("Land")) continue;
      totalSpells += entry.count;
      const roles = cardRoleMap.get(card.name);
      if (roles?.has("cabs")) cabsCount += entry.count;
    }
    const nonCabs = totalSpells - cabsCount;
    // More than 3 non-CABS cards is a warning; more than 5 is an issue.
    sections.push({
      name: "cabs",
      status: nonCabs <= 3 ? "good" : nonCabs <= 5 ? "warning" : "issue",
      actual: nonCabs,
      expected: 0,
      note:
        nonCabs > 5
          ? `${nonCabs} non-CABS cards (don't directly affect the board). Winning limited decks prioritize cards that impact the board — consider replacing some with creatures or removal.`
          : nonCabs > 3
            ? `${nonCabs} non-CABS cards — watch for too many spells that don't impact the board state`
            : `Board presence is strong — ${cabsCount}/${totalSpells} spells directly affect the board`,
    });
  }

  const archetypeInfo = await buildArchetypeInfo(db, setCode, candidates);

  // Compute alternative archetypes with re-scored cuts and GIH WR shift.
  const spellNames = [...new Set(spellMeta.map((m) => m.name))];
  const alternatives = await computeAlternatives(
    db,
    setCode,
    spellNames,
    primaryArchetype,
    archetypeInfo,
  );

  return { sections, archetype: archetypeInfo, alternatives, unresolved };
}

// ── Archetype alternatives ───────────────────────────────────

interface ArchetypeAlternative {
  archetype: string;
  viability: string;
  format_context: string;
  cuts: string[];
  avg_gihwr_shift: number;
}

/**
 * Compute up to 3 alternative archetypes for the deck, each with suggested
 * cuts and estimated GIH WR shift. Alternatives must have a different color
 * identity from the primary and be at least "sparse" viability.
 */
async function computeAlternatives(
  db: D1Database,
  setCode: string,
  spellNames: string[],
  primaryArchetype: string,
  archetypeInfo: ArchetypeInfo,
): Promise<ArchetypeAlternative[]> {
  // Pick candidates that differ from primary and aren't fringe.
  // Archetype strings are WUBRG single-char color codes (e.g. "UB", "WBG").
  const primaryColors = new Set(primaryArchetype);
  const viable = archetypeInfo.candidates.filter((c) => {
    if (c.archetype === primaryArchetype || c.archetype === "_overall")
      return false;
    if (c.viability === "fringe") return false;
    // Must have different color identity (not identical set of colors)
    const altColors = new Set(c.archetype);
    if (
      altColors.size === primaryColors.size &&
      [...altColors].every((ch) => primaryColors.has(ch))
    )
      return false;
    return true;
  });

  const altCandidates = viable.slice(0, 3);
  if (altCandidates.length === 0) return [];

  // Fetch per-archetype GIH WR for all archetypes in one query per chunk.
  const archsToQuery = [
    primaryArchetype,
    ...altCandidates.map((c) => c.archetype),
  ];
  const gihwrByArch = new Map<string, Map<string, number>>();
  for (const arch of archsToQuery) {
    gihwrByArch.set(arch, new Map());
  }

  // Single bulk query: all archetypes × all cards in one pass per chunk.
  for (let i = 0; i < spellNames.length; i += META_BATCH_SIZE) {
    const chunk = spellNames.slice(i, i + META_BATCH_SIZE);
    const cardPH = placeholders(chunk.length, 2);
    const rows = await db
      .prepare(
        `SELECT card_name, archetype, gihwr FROM mtga_draft_archetype_stats WHERE set_code = ?1 AND card_name IN (${cardPH})`,
      )
      .bind(setCode, ...chunk)
      .all<{ card_name: string; archetype: string; gihwr: number }>();
    for (const row of rows.results) {
      const map = gihwrByArch.get(row.archetype);
      if (map) map.set(row.card_name, row.gihwr);
    }
  }

  const primaryGihwr = gihwrByArch.get(primaryArchetype)!;
  const results: ArchetypeAlternative[] = [];

  for (const alt of altCandidates) {
    const altGihwr = gihwrByArch.get(alt.archetype)!;

    // Single pass: compute GIH WR shift and build cut candidates.
    let totalShift = 0;
    let shiftCount = 0;
    const cardShifts: { name: string; shift: number }[] = [];

    for (const name of spellNames) {
      const primaryWr = primaryGihwr.get(name);
      const altWr = altGihwr.get(name);
      if (primaryWr !== undefined && altWr !== undefined) {
        totalShift += altWr - primaryWr;
        shiftCount++;
      }
      // Cards with no archetype data are likely off-color → worst cut candidates.
      if (altWr === undefined) {
        cardShifts.push({ name, shift: -1 });
      } else {
        cardShifts.push({ name, shift: altWr - (primaryWr ?? 0.5) });
      }
    }

    cardShifts.sort((a, b) => a.shift - b.shift);
    const cuts = cardShifts
      .slice(0, 3)
      .filter((c) => c.shift < 0)
      .map((c) => c.name);

    results.push({
      archetype: alt.archetype,
      viability: alt.viability,
      format_context: alt.format_context,
      cuts,
      avg_gihwr_shift: shiftCount > 0 ? r4(totalShift / shiftCount) : 0,
    });
  }

  return results;
}

// ── Cut advisor mode ─────────────────────────────────────────

async function cutAdvisor(
  db: D1Database,
  deck: DeckEntry[],
  meta: Map<string, CardMetaRow>,
  setCode: string,
  cuts: number,
): Promise<{ candidates: CutCandidate[]; archetype: ArchetypeInfo }> {
  const spellEntries: Array<{ name: string; meta: CardMetaRow }> = [];
  const allMeta: CardMetaRow[] = [];

  for (const entry of deck) {
    const card = meta.get(entry.name.toLowerCase());
    if (!card) continue;
    if (card.type_line.includes("Land")) continue;
    for (let j = 0; j < entry.count; j++) {
      spellEntries.push({ name: card.name, meta: card });
      allMeta.push(card);
    }
  }

  const candidates = determineCandidateArchetypes(allMeta, 42);
  const primaryArchetype = candidates[0]?.archetype ?? "_overall";

  // Load ratings
  const ratingMap = new Map<string, number>();
  const spellNames = [...new Set(spellEntries.map((e) => e.name))];
  for (let i = 0; i < spellNames.length; i += META_BATCH_SIZE) {
    const chunk = spellNames.slice(i, i + META_BATCH_SIZE);
    const ph = placeholders(chunk.length, 2);
    const rows = await db
      .prepare(
        `SELECT card_name, gihwr FROM mtga_draft_ratings WHERE set_code = ?1 AND card_name IN (${ph})`,
      )
      .bind(setCode, ...chunk)
      .all<{ card_name: string; gihwr: number }>();
    for (const row of rows.results) {
      ratingMap.set(row.card_name, row.gihwr);
    }
  }

  // Load synergies for all card pairs in deck
  const synergyMap = new Map<string, number>(); // "cardA|cardB" → delta
  for (let i = 0; i < spellNames.length; i += META_BATCH_SIZE) {
    const chunk = spellNames.slice(i, i + META_BATCH_SIZE);
    const ph = placeholders(chunk.length, 2);
    const rows = await db
      .prepare(
        `SELECT card_a, card_b, synergy_delta FROM mtga_draft_synergies WHERE set_code = ?1 AND card_a IN (${ph})`,
      )
      .bind(setCode, ...chunk)
      .all<SynergyDbRow>();
    for (const row of rows.results) {
      synergyMap.set(`${row.card_a}|${row.card_b}`, row.synergy_delta);
    }
  }

  // Load archetype curve, card roles, and role targets in parallel
  const [cutCurveResult, cutCardRolesResult, cutRoleTargetResult] =
    await Promise.all([
      db
        .prepare(
          `SELECT cmc, avg_count FROM mtga_draft_archetype_curves WHERE set_code = ?1 AND archetype = ?2`,
        )
        .bind(setCode, primaryArchetype)
        .all<CurveDbRow>(),
      db
        .prepare(
          `SELECT front_face_name, role FROM mtga_card_roles WHERE set_code = ?1`,
        )
        .bind(setCode)
        .all<CardRoleRow>(),
      db
        .prepare(
          `SELECT role, avg_count FROM mtga_draft_role_targets WHERE set_code = ?1 AND archetype = ?2`,
        )
        .bind(setCode, primaryArchetype)
        .all<RoleTargetRow>(),
    ]);

  const idealCurve = new Map<number, number>();
  for (const row of cutCurveResult.results) {
    idealCurve.set(row.cmc, row.avg_count);
  }

  const cardRoleMap = new Map<string, Set<string>>();
  for (const row of cutCardRolesResult.results) {
    if (!cardRoleMap.has(row.front_face_name)) {
      cardRoleMap.set(row.front_face_name, new Set());
    }
    cardRoleMap.get(row.front_face_name)!.add(row.role);
  }

  const roleTargets = new Map<string, number>();
  for (const rt of cutRoleTargetResult.results) {
    roleTargets.set(rt.role, rt.avg_count);
  }

  // Build actual curve and role counts
  const actualCurve = new Map<number, number>();
  const roleCounts = new Map<string, number>();
  for (const entry of spellEntries) {
    const cmc = Math.min(Math.round(entry.meta.cmc), 7);
    actualCurve.set(cmc, (actualCurve.get(cmc) ?? 0) + 1);
    const roles = cardRoleMap.get(entry.name);
    if (roles) {
      for (const role of roles) {
        roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
      }
    }
  }

  // Mana sources
  const sources = estimateSources(allMeta);

  // Score each spell
  const uniqueScores = new Map<
    string,
    { score: number; axes: CutCandidate["axes"]; reason: string }
  >();

  for (const cardName of spellNames) {
    const card = meta.get(cardName.toLowerCase())!;

    // Baseline: GIH WR (higher = more valuable, harder to cut)
    const gihwr = ratingMap.get(cardName) ?? 0.5;
    const baselineScore = gihwr;

    // Synergy: average delta with other deck cards (higher = more connected)
    let synergySum = 0;
    let synergyCount = 0;
    for (const otherName of spellNames) {
      if (otherName === cardName) continue;
      const delta =
        synergyMap.get(`${cardName}|${otherName}`) ??
        synergyMap.get(`${otherName}|${cardName}`) ??
        0;
      synergySum += delta;
      synergyCount++;
    }
    const synergyScore = synergyCount > 0 ? synergySum / synergyCount : 0;

    // Curve: is this CMC slot over-represented? (surplus → easier to cut)
    const cmc = Math.min(Math.round(card.cmc), 7);
    const actualAtCmc = actualCurve.get(cmc) ?? 0;
    const idealAtCmc = idealCurve.get(cmc) ?? actualAtCmc;
    // Positive = surplus (easier to cut), negative = deficit (harder to cut)
    const curveSurplus = idealAtCmc > 0 ? (actualAtCmc - idealAtCmc) / idealAtCmc : 0;
    // Invert: higher score = more valuable = harder to cut
    const curveScore = -curveSurplus;

    // Role: is this role already exceeded? (surplus → easier to cut)
    const roles = cardRoleMap.get(cardName);
    let roleScore = 0;
    if (roles && roleTargets.size > 0) {
      for (const role of roles) {
        const target = roleTargets.get(role) ?? 0;
        if (target > 0) {
          const count = roleCounts.get(role) ?? 0;
          const need = Math.max(0, (target - count) / target);
          roleScore += need;
        }
      }
      if (roles.size > 0) roleScore /= roles.size;
    }

    // Castability: how easy is this card to cast? (harder = more costly to keep)
    const pips = countPips(card.mana_cost);
    let castProb = 1;
    for (const [color, pipCount] of pips) {
      const colorSources = sources.get(color) ?? 0;
      const prob = castabilityLookup(
        colorSources,
        pipCount,
        Math.round(card.cmc),
      );
      castProb = Math.min(castProb, prob);
    }
    // Invert: low castability → less valuable → easier to cut
    const castScore = castProb;

    // Composite: weighted sum (all scores oriented so higher = more valuable)
    const composite =
      baselineScore * 0.35 +
      synergyScore * 2 + // synergy deltas are small (~0.01-0.05), scale up
      curveScore * 0.15 +
      roleScore * 0.15 +
      castScore * 0.2;

    // Build reason string
    const reasons: string[] = [];
    if (gihwr < 0.5) reasons.push(`low win rate (${Math.round(gihwr * 100)}%)`);
    if (synergyScore < -0.01) reasons.push("negative synergy with deck");
    if (curveSurplus > 0.3) reasons.push(`surplus at ${cmc} CMC`);
    if (castProb < 0.7) reasons.push(`hard to cast (${Math.round(castProb * 100)}%)`);
    if (reasons.length === 0) reasons.push("lowest overall contribution");

    uniqueScores.set(cardName, {
      score: r4(composite),
      axes: {
        baseline: r4(baselineScore),
        synergy: r4(synergyScore),
        curve: r4(curveScore),
        role: r4(roleScore),
        castability: r4(castScore),
      },
      reason: reasons.join("; "),
    });
  }

  // Sort by score ascending (lowest = best cut candidates)
  const sorted = [...uniqueScores.entries()]
    .map(([card, data]) => ({ card, ...data }))
    .sort((a, b) => a.score - b.score);

  const archetypeInfo = await buildArchetypeInfo(db, setCode, candidates);
  return {
    candidates: sorted.slice(0, Math.max(1, cuts)),
    archetype: archetypeInfo,
  };
}

// ── Constructed health check ─────────────────────────────────

interface LegalityRow extends CardMetaRow {
  legalities: string;
}

async function constructedHealthCheck(
  db: D1Database,
  deck: DeckEntry[],
  sideboard: DeckEntry[] | undefined,
  format: string | undefined,
): Promise<ReferenceResult> {
  const allNames = [...new Set(deck.map((e) => e.name))];
  const cardData = new Map<string, LegalityRow>();
  for (let i = 0; i < allNames.length; i += META_BATCH_SIZE) {
    const chunk = allNames.slice(i, i + META_BATCH_SIZE);
    const ph = placeholders(chunk.length, 1);
    const rows = await db
      .prepare(
        `SELECT front_face_name AS name, legalities, type_line, cmc, mana_cost, colors, produced_mana
         FROM mtga_cards WHERE front_face_name COLLATE NOCASE IN (${ph}) AND is_default = 1`,
      )
      .bind(...chunk)
      .all<LegalityRow>();
    for (const row of rows.results) {
      cardData.set(row.name.toLowerCase(), row);
    }
  }

  const totalCards = deck.reduce((sum, e) => sum + e.count, 0);
  const sideboardCards = sideboard ? sideboard.reduce((sum, e) => sum + e.count, 0) : undefined;

  let creatures = 0;
  let noncreatures = 0;
  let lands = 0;
  const cmcCounts = new Map<number, number>();
  const colorPips = new Map<string, number>();
  const illegalCards: { name: string; status: string }[] = [];
  const unresolvedCards: string[] = [];

  for (const entry of deck) {
    const data = cardData.get(entry.name.toLowerCase());
    if (!data) {
      unresolvedCards.push(entry.name);
      continue;
    }

    const typeLine = data.type_line.toLowerCase();
    if (typeLine.includes("land")) {
      lands += entry.count;
    } else if (typeLine.includes("creature")) {
      creatures += entry.count;
      cmcCounts.set(data.cmc, (cmcCounts.get(data.cmc) ?? 0) + entry.count);
    } else {
      noncreatures += entry.count;
      cmcCounts.set(data.cmc, (cmcCounts.get(data.cmc) ?? 0) + entry.count);
    }

    const pips = countPips(data.mana_cost);
    for (const [color, count] of pips) {
      colorPips.set(color, (colorPips.get(color) ?? 0) + count * entry.count);
    }

    if (format) {
      try {
        const legalities = JSON.parse(data.legalities) as Record<string, string>;
        const status = legalities[format.toLowerCase()] ?? "not_legal";
        if (status !== "legal") {
          illegalCards.push({ name: data.name, status });
        }
      } catch {
        // skip unparseable legalities
      }
    }
  }

  const lines: string[] = [];
  const header = format
    ? `Constructed Deck Analysis (${format}):`
    : "Constructed Deck Analysis:";
  lines.push(header);
  lines.push("");

  if (format && illegalCards.length > 0) {
    lines.push("  LEGALITY ISSUES:");
    for (const card of illegalCards) {
      lines.push(`    ${card.name} — ${card.status} in ${format}`);
    }
    lines.push("");
  } else if (format) {
    lines.push(`  All cards legal in ${format}.`);
    lines.push("");
  }

  lines.push("  Composition:");
  lines.push(`    Total:         ${totalCards} cards`);
  lines.push(`    Creatures:     ${creatures}`);
  lines.push(`    Noncreatures:  ${noncreatures}`);
  lines.push(`    Lands:         ${lands}`);
  if (totalCards < 60) {
    lines.push(`    Deck has ${totalCards} cards (minimum 60 for Constructed)`);
  }
  lines.push("");

  if (sideboardCards !== undefined) {
    lines.push(`  Sideboard: ${sideboardCards} cards`);
    if (sideboardCards !== 15 && sideboardCards !== 0) {
      lines.push(`    Note: Standard sideboard is 15 cards (have ${sideboardCards})`);
    }
    lines.push("");
  }

  const maxCmc = Math.max(...cmcCounts.keys(), 0);
  if (maxCmc > 0) {
    lines.push("  Curve (non-land spells):");
    lines.push(
      `    ${"CMC".padEnd(6)} ${"Count".padStart(6)}  Bar`,
    );
    for (let cmc = 0; cmc <= Math.min(maxCmc, 7); cmc++) {
      const count = cmcCounts.get(cmc) ?? 0;
      const label = cmc === 7 ? "7+" : String(cmc);
      const bar = "\u2588".repeat(Math.min(count, 30));
      lines.push(
        `    ${label.padEnd(6)} ${String(count).padStart(6)}  ${bar}`,
      );
    }
    lines.push("");
  }

  const mana = analyzeManaBase(deck, cardData, totalCards);

  if (unresolvedCards.length > 0) {
    lines.push(`  Unresolved cards (not in database): ${unresolvedCards.join(", ")}`);
    lines.push("");
  }

  // Build curve data for structured output
  const curve: { cmc: number; count: number }[] = [];
  const maxCmcVal = Math.max(...cmcCounts.keys(), 0);
  for (let cmc = 0; cmc <= Math.min(maxCmcVal, 7); cmc++) {
    const count = cmcCounts.get(cmc) ?? 0;
    if (count > 0) curve.push({ cmc, count });
  }

  return {
    type: "structured",
    data: {
      mode: "constructed",
      format: format ?? null,
      total_cards: totalCards,
      composition: { creatures, noncreatures, lands },
      sideboard_count: sideboardCards ?? null,
      illegal_cards: illegalCards.length > 0 ? illegalCards : undefined,
      curve,
      mana,
      unresolved_cards: unresolvedCards.length > 0 ? unresolvedCards : undefined,
      formatted_report: lines.join("\n") + "\n",
    },
    presentation:
      "Constructed deck report — structured layout: legality issues as a warning banner at top (if any), composition summary as a stat block, mana curve as a compact bar chart, mana base as a color-coded table (sources needed vs actual, surplus/deficit). Show swap suggestions prominently if any exist.",
  };
}

// ── Module definition ────────────────────────────────────────

export const deckbuildingModule: NativeReferenceModule = {
  id: "deckbuilding",
  name: "Deck Health & Cut Advisor",
  description: [
    "Analyze a deck against empirical data. Three modes:",
    "",
    "1. HEALTH CHECK (deck only, draft): Compares your limited deck's composition against the empirical averages of winning decks in the same archetype and set.",
    "",
    "2. CUT ADVISOR (deck + cuts, draft): Scores every non-land card's contribution across 5 axes. Returns the N weakest cards ranked as cut candidates.",
    "",
    '3. CONSTRUCTED (mode="constructed"): Analyzes a Constructed deck — format legality check, composition summary, mana curve, color pip requirements, sideboard size. No draft data needed.',
    "",
    "REQUIRES: A deck list (card names + counts). For Constructed mode, also pass format (e.g., 'standard') and optionally sideboard.",
    "",
    "Includes mana base analysis (Frank Karsten methodology): colored source requirements, actual sources from lands, surplus/deficit per color, and land swap suggestions when deficits exist.",
    "",
    "Data source: 17Lands (17lands.com) for draft modes, Scryfall card data for constructed mode.",
  ].join("\n"),
  parameters: {
    deck: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, count: { type: "integer" } } },
      description:
        "Deck list: array of {name, count}. Include all cards — lands and spells.",
    },
    mode: {
      type: "string",
      description:
        'Set to "constructed" for Constructed deck analysis. Omit for draft mode (default).',
    },
    format: {
      type: "string",
      description:
        'Arena format for legality checking in constructed mode (e.g., "standard", "historic", "explorer").',
    },
    sideboard: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, count: { type: "integer" } } },
      description:
        "Sideboard list for constructed mode: array of {name, count}.",
    },
    set: {
      type: "string",
      description:
        "Set code (e.g., 'DSK'). For draft mode only. Auto-detected from card names when omitted.",
    },
    cuts: {
      type: "integer",
      description:
        "Number of cut candidates to suggest. For draft mode only. When present, switches to cut advisor mode.",
    },
    deck_section: {
      type: "string",
      description:
        'Section name containing the deck (e.g., "deck:Mono Black"). Requires save_id. Alternative to passing deck inline.',
    },
    save_id: {
      type: "string",
      description:
        "Save UUID. Required when using deck_section to reference a deck from save data.",
    },
  },

  sectionMappings: [
    {
      sectionParam: "deck_section",
      extract: (sectionData: unknown) => {
        const data = sectionData as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        if (Array.isArray(data.cards)) result.deck = data.cards;
        if (Array.isArray(data.sideboard) && data.sideboard.length > 0) result.sideboard = data.sideboard;
        if (typeof data.format === "string") result.format = data.format.toLowerCase();
        return result;
      },
    },
  ],

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const deck = (query.deck as DeckEntry[]) ?? [];
    if (deck.length === 0) {
      return {
        type: "structured",
        data: { error: "No deck provided. Pass an array of {name, count} entries." },
      };
    }

    const db = env.DB;

    // Constructed mode — format-aware analysis without draft data
    if (query.mode === "constructed") {
      return constructedHealthCheck(db, deck, query.sideboard as DeckEntry[] | undefined, query.format as string | undefined);
    }

    // Resolve card names
    const allNames = deck.map((e) => e.name);
    const meta = await resolveCards(db, allNames);

    // Infer or validate set
    let setCode = ((query.set as string) ?? "").toUpperCase();
    if (!setCode) {
      const inferred = await inferSet(db, allNames);
      if (!inferred) {
        return {
          type: "structured",
          data: {
            error:
              "Could not determine set. Pass a set code explicitly or ensure deck cards exist in the draft ratings database.",
          },
        };
      }
      setCode = inferred;
    }

    const cutsParam = query.cuts as number | undefined;

    if (cutsParam !== undefined && cutsParam > 0) {
      // Cut advisor mode
      const result = await cutAdvisor(db, deck, meta, setCode, cutsParam);
      return {
        type: "structured",
        data: {
          mode: "cut_advisor",
          set: setCode,
          archetype: result.archetype,
          cuts_requested: cutsParam,
          candidates: result.candidates,
        },
        presentation:
          "Cut advisor — ranked table of cut candidates from weakest to strongest, showing card name and per-axis weakness scores. Use visual danger indicators (red for clear cuts, yellow for borderline). If alternatives were suggested, show them as replacement options next to each cut.",
      };
    }

    // Health check mode
    const result = await healthCheck(db, deck, meta, setCode);
    const totalCards = deck.reduce((sum, e) => sum + e.count, 0);
    const mana = analyzeManaBase(deck, meta, totalCards);
    return {
      type: "structured",
      data: {
        mode: "health_check",
        set: setCode,
        archetype: result.archetype,
        alternatives: result.alternatives,
        sections: result.sections,
        mana,
        unresolved_cards: result.unresolved,
      },
      presentation:
        "Deck health check — dashboard layout: mana curve as a bar chart comparing deck vs archetype average, creature/spell/land composition as a pie chart, mana base as a color-coded table (sources needed vs actual, surplus/deficit). Show each section as a card with a status indicator (healthy/warning/critical). If mana swap suggestions exist, present them prominently.",
    };
  },
};
