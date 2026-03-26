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
  return { sections, archetype: archetypeInfo, unresolved };
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

// ── Module definition ────────────────────────────────────────

export const deckbuildingModule: NativeReferenceModule = {
  id: "deckbuilding",
  name: "Deck Health & Cut Advisor",
  description: [
    "Analyze a limited deck against empirical data from winning decks. Two modes:",
    "",
    "1. HEALTH CHECK (deck only): Compares your deck's composition (land count, creature count, curve, fixing, removal, castability) against the empirical averages of winning decks in the same archetype and set. Returns per-section status (good/warning/issue) with explanations.",
    "",
    "2. CUT ADVISOR (deck + cuts): Scores every non-land card's contribution across 5 axes — baseline win rate, synergy with other deck cards, curve fit, role fulfillment, and castability. Returns the N weakest cards ranked as cut candidates with per-axis breakdown and plain-language reasons.",
    "",
    "REQUIRES: A deck list (card names + counts). For general deckbuilding questions without a specific deck (e.g., 'how many Evolving Wilds should I play?'), construct a representative deck and run it through this module at varying configurations to ground your advice in data.",
    "",
    "FOR CARD AVAILABILITY QUESTIONS ('what fixing is in this format?', 'what removal exists?'), use card_search instead.",
    "FOR CARD PERFORMANCE QUESTIONS ('how does Evolving Wilds actually perform?'), use card_stats instead.",
    "FOR MANA SOURCE MATH (Karsten colored source requirements), use mana_base instead.",
    "",
    "This module provides the empirical 'what do winning decks look like?' perspective. Combine with mana_base (mathematical requirements) and card_search/card_stats (card-level data) for complete deckbuilding advice.",
    "",
    "Data source: 17Lands (17lands.com), licensed CC BY 4.0.",
  ].join("\n"),
  parameters: {
    deck: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, count: { type: "integer" } } },
      description:
        "Deck list: array of {name, count}. Include all cards — lands and spells.",
    },
    set: {
      type: "string",
      description:
        "Set code (e.g., 'DSK'). Auto-detected from card names when omitted.",
    },
    cuts: {
      type: "integer",
      description:
        "Number of cut candidates to suggest. When present, switches to cut advisor mode. Omit for health check mode.",
    },
  },

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
      };
    }

    // Health check mode
    const result = await healthCheck(db, deck, meta, setCode);
    return {
      type: "structured",
      data: {
        mode: "health_check",
        set: setCode,
        archetype: result.archetype,
        sections: result.sections,
        unresolved_cards: result.unresolved,
      },
    };
  },
};
