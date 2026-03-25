/**
 * MTG Arena draft_advisor — native reference module.
 *
 * Contextual draft evaluation only. Two modes:
 *   1. Live pick: pool + pack → ranked pick recommendations with 6-axis scoring
 *   2. Batch review: pick_history (all chosen) → evaluate every pick, summary + full scores
 *
 * For browsing card stats without draft context, use card_stats instead.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";

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
  ata_stddev: number;
}

interface PickHistoryEntry {
  available: string[];
  chosen: string;
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
  mana_cost: string;
  colors: string;
  type_line: string;
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

interface RoleTargetRow {
  color_pair: string;
  role: string;
  avg_count: number;
}

interface CalibrationRow {
  axis: string;
  center: number;
  steepness: number;
}

interface AxisScore {
  raw: number;
  normalized: number;
  weight: number;
  contribution: number;
}

interface PickRecommendation {
  card: string;
  composite_score: number;
  rank: number;
  axes: {
    baseline: AxisScore & { gihwr: number; source: string };
    synergy: AxisScore & {
      top_synergies: Array<{ card: string; delta: number }>;
    };
    role: AxisScore & { roles: string[]; detail: string };
    curve: AxisScore & {
      cmc: number;
      pool_at_cmc: number;
      ideal_at_cmc: number;
    };
    castability: AxisScore & { max_pips: number; estimated_sources: number };
    signal: AxisScore & { ata: number; current_pick: number };
  };
  waspas: { wsm: number; wpm: number; lambda: number };
}

interface PreloadedSetData {
  /** Sigmoid calibration params per axis. */
  sigmoidParams: Record<string, { center: number; steepness: number }>;
  /** All role targets for the set (all color pairs). */
  roleTargets: RoleTargetRow[];
  /** All archetype curves for the set (all color pairs, all CMCs). */
  allCurves: CurveDbRow[];
  /** All card roles for the set. */
  allCardRoles: CardRoleRow[];
  /** All overall draft ratings for the set. */
  allRatings: Map<string, RatingRow>;
  /** All color pair stats for the set: colorPair -> cardName -> row. */
  allColorStats: Map<string, Map<string, RatingRow>>;
  /** Shared metadata cache (grows during batch review). */
  metaCache: Map<string, CardMetaRow>;
}

// ── Karsten castability table ────────────────────────────────

function hypergeomCDF(N: number, K: number, n: number, k: number): number {
  if (k <= 0) return 1;
  if (K < k) return 0;
  let sum = 0;
  for (let i = 0; i < k; i++) {
    sum += (binomCoeff(K, i) * binomCoeff(N - K, n - i)) / binomCoeff(N, n);
  }
  return 1 - sum;
}

function binomCoeff(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  const m = Math.min(k, n - k);
  for (let i = 0; i < m; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

const CASTABILITY_TABLE: number[][][] = (() => {
  const table: number[][][] = [];
  for (let sources = 0; sources <= 17; sources++) {
    table[sources] = [];
    for (let pips = 1; pips <= 3; pips++) {
      table[sources]![pips] = [];
      for (let turn = 1; turn <= 6; turn++) {
        const cardsSeen = 7 + turn - 1;
        table[sources]![pips]![turn] = hypergeomCDF(
          40,
          sources,
          cardsSeen,
          pips,
        );
      }
    }
  }
  return table;
})();

function castabilityLookup(
  sources: number,
  pips: number,
  turn: number,
): number {
  const s = Math.max(0, Math.min(17, Math.round(sources)));
  const p = Math.max(1, Math.min(3, pips));
  const t = Math.max(1, Math.min(6, turn));
  return CASTABILITY_TABLE[s]?.[p]?.[t] ?? 0;
}

function countPips(manaCost: string): Map<string, number> {
  const pips = new Map<string, number>();
  const matches = manaCost.matchAll(/\{([WUBRG])\}/g);
  for (const m of matches) {
    const color = m[1]!;
    pips.set(color, (pips.get(color) ?? 0) + 1);
  }
  return pips;
}

function estimateSources(poolMeta: CardMetaRow[]): Map<string, number> {
  const totalPips = new Map<string, number>();
  for (const card of poolMeta) {
    for (const [color, count] of countPips(card.mana_cost)) {
      totalPips.set(color, (totalPips.get(color) ?? 0) + count);
    }
  }
  const pipSum = [...totalPips.values()].reduce((a, b) => a + b, 0);
  if (pipSum === 0) return new Map();

  const sources = new Map<string, number>();
  for (const [color, count] of totalPips) {
    sources.set(color, Math.round((17 * count) / pipSum));
  }
  return sources;
}

interface ArchetypeCandidate {
  colorPair: string;
  weight: number;
}

// ── Sigmoid normalization ────────────────────────────────────

function sigmoid(x: number, center: number, steepness: number): number {
  return 1 / (1 + Math.exp(-steepness * (x - center)));
}

const DEFAULT_SIGMOID_PARAMS: Record<
  string,
  { center: number; steepness: number }
> = {
  baseline: { center: 0.535, steepness: 25 },
  synergy: { center: 0, steepness: 4 },
  curve: { center: 0, steepness: 3 },
  signal: { center: 0, steepness: 3 },
  role: { center: 0.3, steepness: 5 },
};

// ── Continuous pick-adaptive weights ─────────────────────────

function smoothWeight(
  pick: number,
  startVal: number,
  endVal: number,
  midpoint: number,
  steepness: number,
): number {
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
  const baseline = smoothWeight(pickNumber, 0.4, 0.15, 15, 0.25);
  const synergy = smoothWeight(pickNumber, 0.05, 0.3, 18, 0.2);
  const curve = smoothWeight(pickNumber, 0.05, 0.15, 22, 0.2);
  const signal = smoothWeight(pickNumber, 0.25, 0.1, 12, 0.25);
  const role = smoothWeight(pickNumber, 0.05, 0.25, 20, 0.25);
  const castability = smoothWeight(pickNumber, 0.2, 0.05, 10, 1 / 3);

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

/** Round to 4 decimal places for output precision. */
function r4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// ── Archetype detection ──────────────────────────────────────

const ALL_COLOR_PAIRS = [
  "WU",
  "WB",
  "WR",
  "WG",
  "UB",
  "UR",
  "UG",
  "BR",
  "BG",
  "RG",
];

function determineCandidateArchetypes(
  poolMeta: CardMetaRow[],
): ArchetypeCandidate[] {
  const pips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const card of poolMeta) {
    for (const [color, count] of countPips(card.mana_cost)) {
      if (color in pips) pips[color] = (pips[color] ?? 0) + count;
    }
  }

  const scored = ALL_COLOR_PAIRS.map((pair) => ({
    colorPair: pair,
    score: (pips[pair[0]!] ?? 0) * (pips[pair[1]!] ?? 0),
  }));

  const nonzero = scored.filter((s) => s.score > 0);
  if (nonzero.length === 0) {
    return [{ colorPair: "_overall", weight: 1.0 }];
  }

  nonzero.sort((a, b) => b.score - a.score);
  const totalScore = nonzero.reduce((s, t) => s + t.score, 0);
  return nonzero.map((t) => ({
    colorPair: t.colorPair,
    weight: t.score / totalScore,
  }));
}

function placeholders(count: number, startIdx: number): string {
  return Array.from({ length: count }, (_, i) => `?${startIdx + i}`).join(",");
}

// ── Signal tracking ──────────────────────────────────────────

function computeSignalFromHistory(
  pickHistory: PickHistoryEntry[],
  ataByCard: Map<string, { ata: number; stddev: number }>,
): Map<string, number> {
  const openness = new Map<string, number>();
  const learningRate = 0.15;
  const packMultiplier = [1.0, 0.6, 0.8];

  for (let i = 0; i < pickHistory.length; i++) {
    const entry = pickHistory[i]!;
    const globalPick = i + 1;
    const packIndex = Math.floor(i / 14);
    const pickInPack = (i % 14) + 1;

    const confidence = Math.exp(-0.5 * ((pickInPack - 8) / 4) ** 2);
    const pMult = packMultiplier[Math.min(packIndex, 2)] ?? 0.8;

    for (const cardName of entry.available) {
      const stats = ataByCard.get(cardName);
      if (!stats || stats.ata <= 0) continue;

      const stddev = stats.stddev > 0.5 ? stats.stddev : 2.0;
      const evidence = (globalPick - stats.ata) / stddev;
      const weightedEvidence = evidence * confidence * pMult * learningRate;

      openness.set(cardName, (openness.get(cardName) ?? 0) + weightedEvidence);
    }
  }

  return openness;
}

function aggregateArchetypeOpenness(
  cardOpenness: Map<string, number>,
  cardMeta: Map<string, CardMetaRow>,
): Map<string, number> {
  const archSums = new Map<string, number>();
  const archCounts = new Map<string, number>();

  for (const [cardName, signal] of cardOpenness) {
    const meta = cardMeta.get(cardName);
    if (!meta) continue;
    const colors = countPips(meta.mana_cost);
    const colorSet = new Set(colors.keys());

    for (const pair of ALL_COLOR_PAIRS) {
      if (colorSet.has(pair[0]!) || colorSet.has(pair[1]!)) {
        archSums.set(pair, (archSums.get(pair) ?? 0) + signal);
        archCounts.set(pair, (archCounts.get(pair) ?? 0) + 1);
      }
    }
  }

  const result = new Map<string, number>();
  for (const [pair, sum] of archSums) {
    const count = archCounts.get(pair) ?? 1;
    result.set(pair, Math.max(-1, Math.min(1, sum / count)));
  }
  return result;
}

// ── Preload set-level data for batch review ──────────────────

const META_BATCH_SIZE = 99;

async function preloadSetData(
  db: D1Database,
  setCode: string,
  cardNames: string[],
): Promise<PreloadedSetData> {
  // Batch metadata queries to stay within D1's bind parameter limit.
  const uniqueNames = [...new Set(cardNames)];
  const metaChunks: Array<Promise<D1Result<CardMetaRow>>> = [];
  for (let i = 0; i < uniqueNames.length; i += META_BATCH_SIZE) {
    const chunk = uniqueNames.slice(i, i + META_BATCH_SIZE);
    const ph = placeholders(chunk.length, 1);
    metaChunks.push(
      db
        .prepare(
          `SELECT front_face_name AS name, cmc, mana_cost, colors, type_line FROM mtga_cards WHERE front_face_name IN (${ph}) AND is_default = 1`,
        )
        .bind(...chunk)
        .all<CardMetaRow>(),
    );
  }

  const [
    calibrationResult,
    roleTargetResult,
    curveResult,
    cardRoleResult,
    ratingsResult,
    colorStatsResult,
    ...metaResults
  ] = await Promise.all([
    db
      .prepare(
        `SELECT axis, center, steepness FROM mtga_draft_calibration WHERE set_code = ?1`,
      )
      .bind(setCode)
      .all<CalibrationRow>(),
    db
      .prepare(
        `SELECT color_pair, role, avg_count FROM mtga_draft_role_targets WHERE set_code = ?1`,
      )
      .bind(setCode)
      .all<RoleTargetRow>(),
    db
      .prepare(
        `SELECT color_pair, cmc, avg_count, total_decks FROM mtga_draft_archetype_curves WHERE set_code = ?1`,
      )
      .bind(setCode)
      .all<CurveDbRow>(),
    db
      .prepare(
        `SELECT front_face_name, role FROM mtga_card_roles WHERE set_code = ?1`,
      )
      .bind(setCode)
      .all<CardRoleRow>(),
    db
      .prepare(`SELECT * FROM mtga_draft_ratings WHERE set_code = ?1`)
      .bind(setCode)
      .all<RatingRow>(),
    db
      .prepare(
        `SELECT set_code, card_name, color_pair, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata FROM mtga_draft_color_stats WHERE set_code = ?1`,
      )
      .bind(setCode)
      .all<RatingRow & { color_pair: string }>(),
    ...metaChunks,
  ]);

  // Build sigmoid params.
  const sigmoidParams: Record<string, { center: number; steepness: number }> = {
    ...DEFAULT_SIGMOID_PARAMS,
  };
  for (const cal of calibrationResult.results) {
    sigmoidParams[cal.axis] = { center: cal.center, steepness: cal.steepness };
  }

  // Build ratings map.
  const allRatings = new Map<string, RatingRow>();
  for (const row of ratingsResult.results) {
    allRatings.set(row.card_name, row);
  }

  // Build nested color stats map.
  const allColorStats = new Map<string, Map<string, RatingRow>>();
  for (const row of colorStatsResult.results) {
    const colorPair = (row as RatingRow & { color_pair: string }).color_pair;
    let byCard = allColorStats.get(colorPair);
    if (!byCard) {
      byCard = new Map();
      allColorStats.set(colorPair, byCard);
    }
    byCard.set(row.card_name, row);
  }

  // Build metadata cache.
  const metaCache = new Map<string, CardMetaRow>();
  for (const result of metaResults) {
    for (const row of result.results) {
      metaCache.set(row.name, row);
    }
  }

  return {
    sigmoidParams,
    roleTargets: roleTargetResult.results,
    allCurves: curveResult.results,
    allCardRoles: cardRoleResult.results,
    allRatings,
    allColorStats,
    metaCache,
  };
}

// ── Contextual pick evaluation ───────────────────────────────

async function contextualPick(
  db: D1Database,
  setCode: string,
  pool: string[],
  pack: string[],
  pickNumber: number,
  pickHistory?: PickHistoryEntry[],
  preloaded?: PreloadedSetData,
): Promise<ReferenceResult> {
  // 1. Resolve card metadata for all pool + pack cards.
  const allNames = [...new Set([...pool, ...pack])];
  let metaByName: Map<string, CardMetaRow>;

  if (preloaded) {
    // Look up from cache; query only missing cards.
    metaByName = new Map<string, CardMetaRow>();
    const missing: string[] = [];
    for (const name of allNames) {
      const cached = preloaded.metaCache.get(name);
      if (cached) {
        metaByName.set(name, cached);
      } else {
        missing.push(name);
      }
    }
    if (missing.length > 0) {
      for (let i = 0; i < missing.length; i += META_BATCH_SIZE) {
        const chunk = missing.slice(i, i + META_BATCH_SIZE);
        const ph = placeholders(chunk.length, 1);
        const result = await db
          .prepare(
            `SELECT front_face_name AS name, cmc, mana_cost, colors, type_line FROM mtga_cards WHERE front_face_name IN (${ph}) AND is_default = 1`,
          )
          .bind(...chunk)
          .all<CardMetaRow>();
        for (const row of result.results) {
          metaByName.set(row.name, row);
          preloaded.metaCache.set(row.name, row);
        }
      }
    }
  } else {
    const metaPlaceholders = placeholders(allNames.length, 1);
    const metaResult = await db
      .prepare(
        `SELECT front_face_name AS name, cmc, mana_cost, colors, type_line FROM mtga_cards WHERE front_face_name IN (${metaPlaceholders}) AND is_default = 1`,
      )
      .bind(...allNames)
      .all<CardMetaRow>();
    metaByName = new Map(metaResult.results.map((r) => [r.name, r]));
  }

  const poolMeta = pool
    .map((n) => metaByName.get(n))
    .filter((m): m is CardMetaRow => m != null);
  const packMeta = pack
    .map((n) => metaByName.get(n))
    .filter((m): m is CardMetaRow => m != null);

  // 2. Determine candidate archetypes.
  const candidates = determineCandidateArchetypes(poolMeta);
  const primaryArchetype = candidates[0]?.colorPair ?? "_overall";
  const confidence = candidates.length > 0 ? (candidates[0]?.weight ?? 0) : 0;

  // 3. Fetch baseline stats for pack cards.
  const packNames = packMeta.map((m) => m.name);
  if (packNames.length === 0) {
    return {
      type: "structured",
      data: { error: "No pack cards found in card database" },
    };
  }

  const realCandidates = candidates.filter((c) => c.colorPair !== "_overall");
  const poolNames = poolMeta.map((m) => m.name);
  const allCardNames = [
    ...new Set([
      ...poolMeta.map((m) => m.name),
      ...packMeta.map((m) => m.name),
    ]),
  ];

  // Build all query promises — use preloaded data when available.
  const overallPromise: Promise<{ results: RatingRow[] }> = preloaded
    ? Promise.resolve({
        results: packNames
          .map((n) => preloaded.allRatings.get(n))
          .filter((r): r is RatingRow => r != null),
      })
    : db
        .prepare(
          `SELECT * FROM mtga_draft_ratings WHERE set_code = ?1 AND card_name IN (${placeholders(packNames.length, 2)})`,
        )
        .bind(setCode, ...packNames)
        .all<RatingRow>();

  const colorStatsPromises: Array<Promise<{ results: RatingRow[] }>> = preloaded
    ? realCandidates.map((cand) => {
        const byCard = preloaded.allColorStats.get(cand.colorPair);
        const results = byCard
          ? packNames
              .map((n) => byCard.get(n))
              .filter((r): r is RatingRow => r != null)
          : [];
        return Promise.resolve({ results });
      })
    : realCandidates.map((cand) => {
        const colorPlaceholders = placeholders(packNames.length, 3);
        return db
          .prepare(
            `SELECT set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata FROM mtga_draft_color_stats WHERE set_code = ?1 AND color_pair = ?2 AND card_name IN (${colorPlaceholders})`,
          )
          .bind(setCode, cand.colorPair, ...packNames)
          .all<RatingRow>();
      });

  // Synergies are always pick-dependent — always query.
  const synergyPromise =
    poolNames.length > 0 && packNames.length > 0
      ? (() => {
          const packPH = placeholders(packNames.length, 2);
          const poolPH = placeholders(poolNames.length, 2 + packNames.length);
          return db
            .prepare(
              `SELECT card_a, card_b, synergy_delta FROM mtga_draft_synergies WHERE set_code = ?1 AND card_a IN (${packPH}) AND card_b IN (${poolPH})`,
            )
            .bind(setCode, ...packNames, ...poolNames)
            .all<SynergyDbRow>();
        })()
      : Promise.resolve({ results: [] as SynergyDbRow[] });

  const curvePromise: Promise<{ results: CurveDbRow[] }> = preloaded
    ? Promise.resolve({
        results:
          primaryArchetype !== "_overall"
            ? preloaded.allCurves.filter(
                (r) => r.color_pair === primaryArchetype,
              )
            : [],
      })
    : primaryArchetype !== "_overall"
      ? db
          .prepare(
            `SELECT cmc, avg_count FROM mtga_draft_archetype_curves WHERE set_code = ?1 AND color_pair = ?2`,
          )
          .bind(setCode, primaryArchetype)
          .all<CurveDbRow>()
      : Promise.resolve({ results: [] as CurveDbRow[] });

  const rolePromise: Promise<{ results: CardRoleRow[] }> = preloaded
    ? Promise.resolve({
        results:
          allCardNames.length > 0
            ? (() => {
                const nameSet = new Set(allCardNames);
                return preloaded.allCardRoles.filter((r) =>
                  nameSet.has(r.front_face_name),
                );
              })()
            : [],
      })
    : allCardNames.length > 0
      ? (() => {
          const rolePH = placeholders(allCardNames.length, 2);
          return db
            .prepare(
              `SELECT front_face_name, role FROM mtga_card_roles WHERE set_code = ?1 AND front_face_name IN (${rolePH})`,
            )
            .bind(setCode, ...allCardNames)
            .all<CardRoleRow>();
        })()
      : Promise.resolve({ results: [] as CardRoleRow[] });

  const roleTargetPromise: Promise<{ results: RoleTargetRow[] }> = preloaded
    ? Promise.resolve({ results: preloaded.roleTargets })
    : db
        .prepare(
          `SELECT color_pair, role, avg_count FROM mtga_draft_role_targets WHERE set_code = ?1`,
        )
        .bind(setCode)
        .all<RoleTargetRow>();

  const calibrationPromise: Promise<{ results: CalibrationRow[] }> = preloaded
    ? Promise.resolve({ results: [] as CalibrationRow[] }) // sigmoid params already built
    : db
        .prepare(
          `SELECT axis, center, steepness FROM mtga_draft_calibration WHERE set_code = ?1`,
        )
        .bind(setCode)
        .all<CalibrationRow>();

  const allResults = await Promise.all([
    overallPromise,
    ...colorStatsPromises,
    synergyPromise,
    curvePromise,
    rolePromise,
    roleTargetPromise,
    calibrationPromise,
  ]);
  const overallRatings = allResults[0] as Awaited<typeof overallPromise>;
  const colorStatsResults = allResults.slice(
    1,
    1 + colorStatsPromises.length,
  ) as Array<Awaited<(typeof colorStatsPromises)[number]>>;
  const [
    synergyResult,
    curveResult,
    roleResult,
    roleTargetResult,
    calibrationResult,
  ] = allResults.slice(1 + colorStatsPromises.length) as [
    Awaited<typeof synergyPromise>,
    Awaited<typeof curvePromise>,
    Awaited<typeof rolePromise>,
    Awaited<typeof roleTargetPromise>,
    Awaited<typeof calibrationPromise>,
  ];

  const overallByName = new Map(
    overallRatings.results.map((r) => [r.card_name, r]),
  );

  const colorStatsByPairAndCard = new Map<string, Map<string, RatingRow>>();
  for (let i = 0; i < realCandidates.length; i++) {
    const byCard = new Map(
      colorStatsResults[i]!.results.map((r) => [r.card_name, r]),
    );
    colorStatsByPairAndCard.set(realCandidates[i]!.colorPair, byCard);
  }

  const synergyByPackCard = new Map<
    string,
    Array<{ card: string; delta: number }>
  >();
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

  const poolCMCHist = new Map<number, number>();
  for (const card of poolMeta) {
    const bucket = Math.min(Math.floor(card.cmc), 7);
    poolCMCHist.set(bucket, (poolCMCHist.get(bucket) ?? 0) + 1);
  }

  const cardRolesMap = new Map<string, Set<string>>();
  for (const row of roleResult.results) {
    let roles = cardRolesMap.get(row.front_face_name);
    if (!roles) {
      roles = new Set();
      cardRolesMap.set(row.front_face_name, roles);
    }
    roles.add(row.role);
  }

  const roleTargetsByRole = new Map<string, number>();
  if (roleTargetResult.results.length > 0) {
    const targetsByPairRole = new Map<string, number>();
    for (const rt of roleTargetResult.results) {
      targetsByPairRole.set(`${rt.color_pair}:${rt.role}`, rt.avg_count);
    }
    const allRoles = new Set(roleTargetResult.results.map((rt) => rt.role));
    for (const role of allRoles) {
      let blended = 0;
      let totalWeight = 0;
      for (const cand of realCandidates) {
        const key = `${cand.colorPair}:${role}`;
        const target = targetsByPairRole.get(key);
        if (target !== undefined) {
          blended += target * cand.weight;
          totalWeight += cand.weight;
        }
      }
      if (totalWeight > 0) {
        roleTargetsByRole.set(role, blended / totalWeight);
      }
    }
  }

  const poolRoleCounts = new Map<string, number>();
  for (const card of poolMeta) {
    const roles = cardRolesMap.get(card.name);
    if (roles) {
      for (const role of roles) {
        poolRoleCounts.set(role, (poolRoleCounts.get(role) ?? 0) + 1);
      }
    }
  }

  const sp: Record<string, { center: number; steepness: number }> = preloaded
    ? preloaded.sigmoidParams
    : (() => {
        const built: Record<string, { center: number; steepness: number }> = {
          ...DEFAULT_SIGMOID_PARAMS,
        };
        for (const cal of calibrationResult.results) {
          built[cal.axis] = { center: cal.center, steepness: cal.steepness };
        }
        return built;
      })();

  // Compute accumulated signal from pick history (if provided).
  let archetypeOpenness: Map<string, number> | null = null;
  if (pickHistory && pickHistory.length > 0) {
    const historyCards = new Set<string>();
    for (const entry of pickHistory) {
      for (const card of entry.available) {
        historyCards.add(card);
      }
    }

    if (historyCards.size > 0) {
      const historyNames = [...historyCards];

      // ATA data: use preloaded ratings if available, otherwise query.
      const ataByCard = new Map<string, { ata: number; stddev: number }>();
      if (preloaded) {
        for (const name of historyNames) {
          const row = preloaded.allRatings.get(name);
          if (row) {
            ataByCard.set(name, { ata: row.ata, stddev: row.ata_stddev });
          }
        }
      } else {
        const histPH = placeholders(historyNames.length, 2);
        const ataResult = await db
          .prepare(
            `SELECT card_name, ata, ata_stddev FROM mtga_draft_ratings WHERE set_code = ?1 AND card_name IN (${histPH})`,
          )
          .bind(setCode, ...historyNames)
          .all<{ card_name: string; ata: number; ata_stddev: number }>();
        for (const row of ataResult.results) {
          ataByCard.set(row.card_name, {
            ata: row.ata,
            stddev: row.ata_stddev,
          });
        }
      }

      // Missing metadata for history cards.
      if (preloaded) {
        const missingMeta = historyNames.filter((n) => !metaByName.has(n));
        for (const name of missingMeta) {
          const cached = preloaded.metaCache.get(name);
          if (cached) {
            metaByName.set(name, cached);
          }
        }
        // Any still missing after cache check? Query DB.
        const stillMissing = historyNames.filter((n) => !metaByName.has(n));
        if (stillMissing.length > 0) {
          for (let i = 0; i < stillMissing.length; i += META_BATCH_SIZE) {
            const chunk = stillMissing.slice(i, i + META_BATCH_SIZE);
            const ph = placeholders(chunk.length, 1);
            const extraMeta = await db
              .prepare(
                `SELECT front_face_name AS name, cmc, mana_cost, colors FROM mtga_cards WHERE front_face_name IN (${ph}) AND is_default = 1`,
              )
              .bind(...chunk)
              .all<CardMetaRow>();
            for (const r of extraMeta.results) {
              metaByName.set(r.name, r);
              preloaded.metaCache.set(r.name, r);
            }
          }
        }
      } else {
        const missingMeta = historyNames.filter((n) => !metaByName.has(n));
        if (missingMeta.length > 0) {
          const missingPH = placeholders(missingMeta.length, 1);
          const extraMeta = await db
            .prepare(
              `SELECT front_face_name AS name, cmc, mana_cost, colors FROM mtga_cards WHERE front_face_name IN (${missingPH}) AND is_default = 1`,
            )
            .bind(...missingMeta)
            .all<CardMetaRow>();
          for (const r of extraMeta.results) {
            metaByName.set(r.name, r);
          }
        }
      }

      const cardOpenness = computeSignalFromHistory(pickHistory, ataByCard);
      archetypeOpenness = aggregateArchetypeOpenness(cardOpenness, metaByName);
    }
  }

  // Estimate mana base for castability scoring.
  const estimatedSources = estimateSources(poolMeta);

  // Compute scores for each pack card.
  const weights = getWeights(pickNumber);
  const profileLabel = getWeightProfileLabel(pickNumber);

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
    const topSynergies = [...synergies]
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3);

    // Curve: gap detection + ideal curve comparison.
    const isLand = packCard.type_line?.includes("Land") ?? false;
    const cardCMC = Math.min(Math.floor(packCard.cmc), 7);
    const poolAtCMC = poolCMCHist.get(cardCMC) ?? 0;
    const idealAtCMC = idealCurve?.get(cardCMC) ?? 0;
    let curveScore = 0;
    if (!isLand) {
      if (idealCurve && idealAtCMC > 0) {
        curveScore = (idealAtCMC - poolAtCMC) / idealAtCMC;
      } else if (poolAtCMC === 0 && pool.length > 3) {
        curveScore = 0.5;
      }
    }

    // Signal: archetype openness.
    const ata = overallByName.get(name)?.ata ?? 0;
    let signalScore = 0;
    if (archetypeOpenness && archetypeOpenness.size > 0) {
      const cardColors = countPips(packCard.mana_cost);
      const colorSet = new Set(cardColors.keys());
      let bestOpenness = 0;
      for (const pair of ALL_COLOR_PAIRS) {
        if (colorSet.has(pair[0]!) || colorSet.has(pair[1]!)) {
          const o = archetypeOpenness.get(pair) ?? 0;
          if (Math.abs(o) > Math.abs(bestOpenness)) {
            bestOpenness = o;
          }
        }
      }
      signalScore = bestOpenness;
    } else if (ata > 0) {
      const ataStddev = overallByName.get(name)?.ata_stddev ?? 0;
      const stddev = ataStddev > 0.5 ? ataStddev : 2.0;
      signalScore = Math.max(-1, Math.min(1, (pickNumber - ata) / stddev));
    }

    // Role: deck composition gap.
    const cardRoles = cardRolesMap.get(name);
    let roleScore = 0;
    let bestRoleDetail = "";
    const roleList: string[] = cardRoles ? [...cardRoles] : [];
    if (cardRoles && roleTargetsByRole.size > 0) {
      for (const role of cardRoles) {
        const target = roleTargetsByRole.get(role) ?? 0;
        if (target <= 0) continue;
        const poolCount = poolRoleCounts.get(role) ?? 0;
        let need = Math.max(0, (target - poolCount) / target);
        if (poolCount === 0 && target >= 3 && pickNumber >= 25) {
          need *= 1.5;
        }
        if (need > roleScore) {
          roleScore = need;
          const poolStr = `${poolCount}/${Math.round(target * 10) / 10}`;
          bestRoleDetail = `${role} (pool has ${poolStr} target)`;
        }
      }
    }

    // Castability.
    const cardPips = countPips(packCard.mana_cost);
    const maxPips = Math.max(0, ...[...cardPips.values()]);
    const castTurn = Math.max(1, Math.min(6, Math.ceil(packCard.cmc)));
    let castabilityScore = 1.0;
    let castabilitySources = 17;
    if (maxPips > 0) {
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

    if (pickNumber <= 5) {
      const dampenFactor = Math.max(0, (6 - pickNumber) / 5);
      castabilityScore =
        castabilityScore + (1 - castabilityScore) * dampenFactor;
    }

    // Sigmoid normalization.
    const bsp = sp.baseline ?? DEFAULT_SIGMOID_PARAMS.baseline!;
    const ssp = sp.synergy ?? DEFAULT_SIGMOID_PARAMS.synergy!;
    const csp = sp.curve ?? DEFAULT_SIGMOID_PARAMS.curve!;
    const sigsp = sp.signal ?? DEFAULT_SIGMOID_PARAMS.signal!;
    const rsp = sp.role ?? DEFAULT_SIGMOID_PARAMS.role!;
    const baselineNorm = sigmoid(baselineGihwr, bsp.center, bsp.steepness);
    const synergyNorm = sigmoid(synergySum, ssp.center, ssp.steepness);
    const curveNorm = sigmoid(curveScore, csp.center, csp.steepness);
    const signalNorm = sigmoid(signalScore, sigsp.center, sigsp.steepness);
    const roleNorm = sigmoid(roleScore, rsp.center, rsp.steepness);
    const castabilityNorm = castabilityScore;

    // WASPAS hybrid.
    const wsm =
      weights.baseline * baselineNorm +
      weights.synergy * synergyNorm +
      weights.curve * curveNorm +
      weights.signal * signalNorm +
      weights.role * roleNorm +
      weights.castability * castabilityNorm;

    const castNormSafe = Math.max(0.001, castabilityNorm);
    const wpm =
      baselineNorm ** weights.baseline *
      synergyNorm ** weights.synergy *
      curveNorm ** weights.curve *
      signalNorm ** weights.signal *
      roleNorm ** weights.role *
      castNormSafe ** weights.castability;

    const lambda = 0.85 - 0.35 * (pickNumber / 42);
    const compositeScore = lambda * wsm + (1 - lambda) * wpm;

    recommendations.push({
      card: name,
      composite_score: r4(compositeScore),
      rank: 0,
      axes: {
        baseline: {
          raw: r4(baselineGihwr),
          normalized: r4(baselineNorm),
          weight: r4(weights.baseline),
          contribution: r4(weights.baseline * baselineNorm),
          gihwr: baselineGihwr,
          source: baselineSource,
        },
        synergy: {
          raw: r4(synergySum),
          normalized: r4(synergyNorm),
          weight: r4(weights.synergy),
          contribution: r4(weights.synergy * synergyNorm),
          top_synergies: topSynergies,
        },
        role: {
          raw: r4(roleScore),
          normalized: r4(roleNorm),
          weight: r4(weights.role),
          contribution: r4(weights.role * roleNorm),
          roles: roleList,
          detail: bestRoleDetail || "no role data",
        },
        curve: {
          raw: r4(curveScore),
          normalized: r4(curveNorm),
          weight: r4(weights.curve),
          contribution: r4(weights.curve * curveNorm),
          cmc: cardCMC,
          pool_at_cmc: poolAtCMC,
          ideal_at_cmc: Math.round(idealAtCMC * 100) / 100,
        },
        castability: {
          raw: r4(castabilityScore),
          normalized: r4(castabilityNorm),
          weight: r4(weights.castability),
          contribution: r4(weights.castability * castabilityNorm),
          max_pips: maxPips,
          estimated_sources: castabilitySources,
        },
        signal: {
          raw: r4(signalScore),
          normalized: r4(signalNorm),
          weight: r4(weights.signal),
          contribution: r4(weights.signal * signalNorm),
          ata,
          current_pick: pickNumber,
        },
      },
      waspas: { wsm: r4(wsm), wpm: r4(wpm), lambda: r4(lambda) },
    });
  }

  recommendations.sort((a, b) => b.composite_score - a.composite_score);
  for (let i = 0; i < recommendations.length; i++) {
    recommendations[i]!.rank = i + 1;
  }

  return {
    type: "structured",
    data: {
      archetype: {
        primary: primaryArchetype,
        candidates: candidates.map((c) => ({
          color_pair: c.colorPair,
          weight: Math.round(c.weight * 100) / 100,
        })),
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

// ── Batch review mode ────────────────────────────────────────

interface BatchPickResult {
  pick_number: number;
  pack_number: number;
  pick_in_pack: number;
  chosen: string;
  chosen_rank: number;
  chosen_composite: number;
  recommended: string;
  recommended_composite: number;
  classification: "optimal" | "good" | "questionable" | "miss";
}

async function batchReview(
  db: D1Database,
  setCode: string,
  pickHistory: PickHistoryEntry[],
): Promise<ReferenceResult> {
  // Collect all unique card names across entire pick history.
  const allCardNames = new Set<string>();
  for (const entry of pickHistory) {
    for (const card of entry.available) allCardNames.add(card);
    if (entry.chosen) allCardNames.add(entry.chosen);
  }

  // Preload all set-level data once.
  const preloaded = await preloadSetData(db, setCode, [...allCardNames]);

  const results: BatchPickResult[] = [];
  const poolSoFar: string[] = [];
  let optimal = 0;
  let good = 0;
  let questionable = 0;
  let misses = 0;

  for (let i = 0; i < pickHistory.length; i++) {
    const entry = pickHistory[i]!;
    if (!entry.chosen || entry.available.length === 0) continue;

    const pickNumber = i + 1;
    const packNumber = Math.floor(i / 14);
    const pickInPack = (i % 14) + 1;

    // Run contextual evaluation for this pick with pool-so-far and the history up to this point.
    const historyUpToNow = pickHistory.slice(0, i);
    const pickResult = await contextualPick(
      db,
      setCode,
      [...poolSoFar],
      entry.available,
      pickNumber,
      historyUpToNow.length > 0 ? historyUpToNow : undefined,
      preloaded,
    );

    poolSoFar.push(entry.chosen);

    if (pickResult.type !== "structured") continue;
    const data = pickResult.data as { recommendations: PickRecommendation[] };
    const recs = data.recommendations;
    if (recs.length === 0) continue;

    const chosenRec = recs.find((r) => r.card === entry.chosen);
    const topRec = recs[0]!;

    const chosenRank = chosenRec?.rank ?? recs.length + 1;
    const chosenComposite = chosenRec?.composite_score ?? 0;

    let classification: "optimal" | "good" | "questionable" | "miss";
    if (chosenRank === 1) {
      classification = "optimal";
      optimal++;
    } else if (chosenRank === 2) {
      classification = "good";
      good++;
    } else if (chosenRank === 3) {
      classification = "questionable";
      questionable++;
    } else {
      classification = "miss";
      misses++;
    }

    results.push({
      pick_number: pickNumber,
      pack_number: packNumber + 1,
      pick_in_pack: pickInPack,
      chosen: entry.chosen,
      chosen_rank: chosenRank,
      chosen_composite: chosenComposite,
      recommended: topRec.card,
      recommended_composite: topRec.composite_score,
      classification,
    });
  }

  return {
    type: "structured",
    data: {
      summary: {
        total_picks: results.length,
        optimal,
        good,
        questionable,
        misses,
        score:
          results.length > 0
            ? `${optimal}/${results.length} optimal, ${good} good, ${questionable} questionable, ${misses} misses`
            : "No picks to evaluate",
      },
      picks: results,
    },
  };
}

// ── Module definition ────────────────────────────────────────

export const draftAdvisorModule: NativeReferenceModule = {
  id: "draft_advisor",
  name: "Draft Advisor",
  description: [
    "Contextual draft pick evaluation for MTG Arena. This module evaluates cards IN CONTEXT — it does NOT look up individual card stats (use card_stats for that).",
    "",
    "TWO MODES:",
    "",
    "1. LIVE PICK (set + pool + pack): Rank each card in the pack using 6 axes — baseline (archetype-weighted GIH WR), synergy (pairwise interaction with pool), curve (CMC gap detection), signal (archetype openness), role (creature/removal/fixing composition), castability (Karsten hypergeometric). Combined via WASPAS hybrid scoring.",
    "   - Pass pick_history (array of {available, chosen}) to enable accumulated signal tracking across the full draft.",
    "   - Read component breakdowns to explain WHY a card scores high — don't just report the rank.",
    "   - Warn when castability < 80%. Warn when a role category is empty.",
    "",
    "2. BATCH REVIEW (set + pick_history where all picks have 'chosen'): Compact overview of a completed draft. Returns summary (optimal/good/questionable/miss counts) plus per-pick classification with chosen rank and top recommendation. NO full axis breakdowns — use this to identify which picks to examine, then call LIVE PICK mode for detailed analysis of specific picks.",
    "   - Each pick is evaluated with the pool-so-far and history-so-far at that point.",
    "   - 'optimal' = chosen was rank 1, 'good' = rank 2, 'questionable' = rank 3, 'miss' = rank 4+.",
    "   - For detailed analysis of specific picks, call LIVE PICK mode with pool = in_deck, pack = available, pick_number from the draft_history section data.",
    "",
    "WEIGHT PROFILES: Early picks (1-5) favor baseline + signal + castability. Mid picks (6-20) balance all axes. Late picks (21-42) favor synergy + role + curve.",
    "",
    "SPLASH RULES: Only splash single-pip cards at CMC 4+ with 3+ sources. Never splash double-pip. Check castability score — below 0.7 means unreliable.",
    "",
    "Data source: 17Lands (17lands.com), licensed CC BY 4.0.",
  ].join("\n"),
  parameters: {
    set: { type: "string", description: "Set code (e.g., 'TMT'). Required." },
    pool: {
      type: "array",
      items: { type: "string" },
      description: "Card names already drafted. Required for live pick mode.",
    },
    pack: {
      type: "array",
      items: { type: "string" },
      description:
        "Card names available in current pack. Required for live pick mode.",
    },
    pick_number: {
      type: "integer",
      description:
        "Current pick number (1-42). Affects weight profile. Default 10.",
    },
    pick_history: {
      type: "array",
      items: {
        type: "object",
        properties: {
          available: { type: "array", items: { type: "string" } },
          chosen: { type: "string" },
        },
      },
      description:
        "Full draft pick history. Each entry: {available: string[], chosen: string}. For live pick: enables accumulated signal. For batch review: all picks must have 'chosen' set.",
    },
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const setCode = ((query.set as string) ?? "").toUpperCase();
    const pool = ((query.pool as string[]) ?? []).slice(0, 45);
    const pack = ((query.pack as string[]) ?? []).slice(0, 15);
    const pickNumber = Math.max(
      1,
      Math.min(
        42,
        typeof query.pick_number === "number" ? query.pick_number : 10,
      ),
    );
    const pickHistory = Array.isArray(query.pick_history)
      ? (query.pick_history as Array<{ available?: string[]; chosen?: string }>)
          .slice(0, 42)
          .filter((e) => Array.isArray(e?.available))
          .map((e) => ({
            available: e.available!.slice(0, 15),
            chosen: e.chosen ?? "",
          }))
      : undefined;

    if (!setCode) {
      return {
        type: "formatted",
        content: "Set code is required. Pass {set: 'TMT'} or similar.\n",
      };
    }

    // Validate set exists.
    const setStats = await env.DB.prepare(
      "SELECT * FROM mtga_draft_set_stats WHERE set_code = ?1",
    )
      .bind(setCode)
      .first<SetStatsRow>();

    if (!setStats) {
      const available = await env.DB.prepare(
        "SELECT set_code FROM mtga_draft_set_stats ORDER BY set_code",
      ).all<{ set_code: string }>();
      const codes = available.results.map((r) => r.set_code).join(", ");
      return {
        type: "formatted",
        content: `Set "${setCode}" not found. Available sets: ${codes}\n`,
      };
    }

    // Mode 1: Live pick (pool + pack present).
    if (pool.length > 0 && pack.length > 0) {
      return contextualPick(
        env.DB,
        setCode,
        pool,
        pack,
        pickNumber,
        pickHistory,
      );
    }

    // Mode 2: Batch review (pick_history with all chosen present, no pool/pack).
    if (
      pickHistory &&
      pickHistory.length > 0 &&
      pickHistory.every((e) => e.chosen !== "")
    ) {
      return batchReview(env.DB, setCode, pickHistory);
    }

    return {
      type: "formatted",
      content:
        [
          "Draft Advisor requires either:",
          "  1. Live pick: set + pool + pack (+ optional pick_number, pick_history)",
          "  2. Batch review: set + pick_history (all picks must have 'chosen')",
          "",
          "For browsing card stats without draft context, use card_stats instead.",
        ].join("\n") + "\n",
    };
  },
};
