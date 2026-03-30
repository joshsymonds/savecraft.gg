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
import {
  type RatingRow,
  type CardMetaRow,
  type SetMetadataRow,
  type SynergyDbRow,
  type CurveDbRow,
  type CardRoleRow,
  type RoleTargetRow,
  type CalibrationRow,
  type AxisScore,
  type ArchetypeCandidate,
  type WeightSet,
  type PickHistoryEntry,
  BASIC_LAND_NAMES,
  DEFAULT_ASFAN,
  DEFAULT_PACK_SIZE,
  META_BATCH_SIZE,
  ALL_COLOR_COMBOS,
  castabilityLookup,
  countPips,
  estimateSources,
  estimatePotentialSources,
  sigmoid,
  smoothWeight,
  getWeights,
  getWeightProfileLabel,
  determineCandidateArchetypes,
  computeColorCommitment,
  computeSignalFromHistory,
  aggregateArchetypeOpenness,
  placeholders,
  r4,
  computeViabilityTier,
} from "./scoring";

// ── Bomb dampening constants ─────────────────────────────────
// Power-aware castability dampening for elite cards early in draft.
// Based on Saxe's λ_t research and PVDDR's value-above-replacement principle.

/** baselineNorm above this threshold triggers bomb dampening. */
const BOMB_BASELINE_THRESHOLD = 0.8;
/** Dampening reaches zero at this fraction of totalPicks. */
const BOMB_EARLY_DRAFT_FRACTION = 0.6;
/** Controls how aggressively dampening scales with bomb excess. */
const BOMB_DAMPENING_MULTIPLIER = 2.5;
/** Maximum dampening value (caps the castability boost). */
const BOMB_MAX_DAMPENING = 0.35;

interface SetStatsRow {
  set_code: string;
  format: string;
  total_games: number;
  card_count: number;
  avg_gihwr: number;
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
    castability: AxisScore & {
      max_pips: number;
      estimated_sources: number;
      potential_sources: number;
      effective_sources: number;
      source_model: "current" | "splash" | "pivot";
      bomb_dampening: number;
    };
    signal: AxisScore & { ata: number; current_pick: number };
    color_commitment: AxisScore & { color_fit: number };
    opportunity_cost: AxisScore;
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
  /** All color pair stats for the set: archetype -> cardName -> row. */
  allColorStats: Map<string, Map<string, RatingRow>>;
  /** Shared metadata cache (grows during batch review). */
  metaCache: Map<string, CardMetaRow>;
  /** Fixing land density per pack (from set_metadata, default 0.4). */
  asfan: number;
  /** Cards per booster pack (from set_metadata, default 14). */
  packSize: number;
  /** Deck stats per archetype from mtga_draft_deck_stats. */
  deckStatsByPair: Map<string, { total_decks: number; winrate: number }>;
}

// ── Preload set-level data for batch review ──────────────────

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
          `SELECT front_face_name AS name, cmc, mana_cost, colors, type_line, produced_mana FROM mtga_cards WHERE front_face_name IN (${ph}) AND is_default = 1`,
        )
        .bind(...chunk)
        .all<CardMetaRow>(),
    );
  }

  const [
    calibrationResult,
    setMetaResult,
    roleTargetResult,
    curveResult,
    cardRoleResult,
    ratingsResult,
    colorStatsResult,
    deckStatsResult,
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
        `SELECT asfan, pack_size FROM mtga_set_metadata WHERE set_code = ?1`,
      )
      .bind(setCode)
      .all<SetMetadataRow>(),
    db
      .prepare(
        `SELECT archetype, role, avg_count FROM mtga_draft_role_targets WHERE set_code = ?1`,
      )
      .bind(setCode)
      .all<RoleTargetRow>(),
    db
      .prepare(
        `SELECT archetype, cmc, avg_count, total_decks FROM mtga_draft_archetype_curves WHERE set_code = ?1`,
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
        `SELECT set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata FROM mtga_draft_archetype_stats WHERE set_code = ?1`,
      )
      .bind(setCode)
      .all<RatingRow & { archetype: string }>(),
    db
      .prepare(
        `SELECT archetype, total_decks, splash_rate, splash_winrate, nonsplash_winrate FROM mtga_draft_deck_stats WHERE set_code = ?1`,
      )
      .bind(setCode)
      .all<{
        archetype: string;
        total_decks: number;
        splash_rate: number;
        splash_winrate: number;
        nonsplash_winrate: number;
      }>(),
    ...metaChunks,
  ]);

  // Build sigmoid params from D1 calibration table (no hardcoded defaults).
  const sigmoidParams: Record<string, { center: number; steepness: number }> =
    {};
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
    const archetype = (row as RatingRow & { archetype: string }).archetype;
    let byCard = allColorStats.get(archetype);
    if (!byCard) {
      byCard = new Map();
      allColorStats.set(archetype, byCard);
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

  // Build deck stats map with derived archetype win rate.
  const deckStatsByPair = new Map<
    string,
    { total_decks: number; winrate: number }
  >();
  for (const row of deckStatsResult.results) {
    const wr =
      row.splash_rate * row.splash_winrate +
      (1 - row.splash_rate) * row.nonsplash_winrate;
    deckStatsByPair.set(row.archetype, {
      total_decks: row.total_decks,
      winrate: wr,
    });
  }

  const setMeta = setMetaResult.results[0];
  return {
    sigmoidParams,
    roleTargets: roleTargetResult.results,
    allCurves: curveResult.results,
    allCardRoles: cardRoleResult.results,
    allRatings,
    allColorStats,
    metaCache,
    asfan: setMeta?.asfan ?? DEFAULT_ASFAN,
    packSize: setMeta?.pack_size ?? DEFAULT_PACK_SIZE,
    deckStatsByPair,
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
            `SELECT front_face_name AS name, cmc, mana_cost, colors, type_line, produced_mana FROM mtga_cards WHERE front_face_name IN (${ph}) AND is_default = 1`,
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
        `SELECT front_face_name AS name, cmc, mana_cost, colors, type_line, produced_mana FROM mtga_cards WHERE front_face_name IN (${metaPlaceholders}) AND is_default = 1`,
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
    .filter(
      (m): m is CardMetaRow => m != null && !BASIC_LAND_NAMES.has(m.name),
    );

  // 2. Determine candidate archetypes.
  const candidates = determineCandidateArchetypes(poolMeta, pickNumber);
  const primaryArchetype = candidates[0]?.archetype ?? "_overall";
  const confidence = candidates.length > 0 ? (candidates[0]?.weight ?? 0) : 0;

  // 3. Fetch baseline stats for pack cards.
  const packNames = packMeta.map((m) => m.name);
  if (packNames.length === 0) {
    return {
      type: "structured",
      data: { error: "No pack cards found in card database" },
    };
  }

  const realCandidates = candidates.filter((c) => c.archetype !== "_overall");
  const poolNames = poolMeta.map((m) => m.name);
  const allCardNames = [
    ...new Set([
      ...poolMeta.map((m) => m.name),
      ...packMeta.map((m) => m.name),
    ]),
  ];

  // Build all query promises — use preloaded data when available.
  // Query all card names (pack + pool) so opportunity cost can use pool baselines.
  const overallPromise: Promise<{ results: RatingRow[] }> = preloaded
    ? Promise.resolve({
        results: allCardNames
          .map((n) => preloaded.allRatings.get(n))
          .filter((r): r is RatingRow => r != null),
      })
    : db
        .prepare(
          `SELECT * FROM mtga_draft_ratings WHERE set_code = ?1 AND card_name IN (${placeholders(allCardNames.length, 2)})`,
        )
        .bind(setCode, ...allCardNames)
        .all<RatingRow>();

  // Single bulk fetch for all archetype stats — no per-candidate queries.
  const colorStatsPromise: Promise<{
    results: (RatingRow & { archetype: string })[];
  }> = preloaded
    ? Promise.resolve({
        results: (() => {
          const all: (RatingRow & { archetype: string })[] = [];
          for (const [arch, byCard] of preloaded.allColorStats) {
            for (const name of packNames) {
              const row = byCard.get(name);
              if (row)
                all.push({ ...row, archetype: arch } as RatingRow & {
                  archetype: string;
                });
            }
          }
          return all;
        })(),
      })
    : db
        .prepare(
          `SELECT set_code, card_name, archetype, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata FROM mtga_draft_archetype_stats WHERE set_code = ?1 AND card_name IN (${placeholders(packNames.length, 2)})`,
        )
        .bind(setCode, ...packNames)
        .all<RatingRow & { archetype: string }>();

  // Synergies are always pick-dependent — always query.
  const synergyPromise =
    poolNames.length > 0 && packNames.length > 0
      ? (() => {
          const packPH = placeholders(packNames.length, 2);
          const poolPH = placeholders(poolNames.length, 2 + packNames.length);
          return db
            .prepare(
              `SELECT card_a, card_b, synergy_delta, games_together FROM mtga_draft_synergies WHERE set_code = ?1 AND card_a IN (${packPH}) AND card_b IN (${poolPH})`,
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
                (r) => r.archetype === primaryArchetype,
              )
            : [],
      })
    : primaryArchetype !== "_overall"
      ? db
          .prepare(
            `SELECT cmc, avg_count FROM mtga_draft_archetype_curves WHERE set_code = ?1 AND archetype = ?2`,
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
          `SELECT archetype, role, avg_count FROM mtga_draft_role_targets WHERE set_code = ?1`,
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

  const setMetaPromise: Promise<{ results: SetMetadataRow[] }> = preloaded
    ? Promise.resolve({ results: [] as SetMetadataRow[] }) // already loaded
    : db
        .prepare(
          `SELECT asfan, pack_size FROM mtga_set_metadata WHERE set_code = ?1`,
        )
        .bind(setCode)
        .all<SetMetadataRow>();

  const deckStatsPromise: Promise<{
    results: {
      archetype: string;
      total_decks: number;
      splash_rate: number;
      splash_winrate: number;
      nonsplash_winrate: number;
    }[];
  }> = preloaded
    ? Promise.resolve({
        results: [...preloaded.deckStatsByPair.entries()].map(
          ([archetype, stats]) => ({
            archetype,
            total_decks: stats.total_decks,
            splash_rate: 0,
            splash_winrate: stats.winrate,
            nonsplash_winrate: stats.winrate,
          }),
        ),
      })
    : db
        .prepare(
          `SELECT archetype, total_decks, splash_rate, splash_winrate, nonsplash_winrate FROM mtga_draft_deck_stats WHERE set_code = ?1`,
        )
        .bind(setCode)
        .all<{
          archetype: string;
          total_decks: number;
          splash_rate: number;
          splash_winrate: number;
          nonsplash_winrate: number;
        }>();

  const [
    overallRatings,
    colorStatsResult,
    synergyResult,
    curveResult,
    roleResult,
    roleTargetResult,
    calibrationResult,
    setMetaResult,
    deckStatsResult,
  ] = await Promise.all([
    overallPromise,
    colorStatsPromise,
    synergyPromise,
    curvePromise,
    rolePromise,
    roleTargetPromise,
    calibrationPromise,
    setMetaPromise,
    deckStatsPromise,
  ]);

  const overallByName = new Map(
    overallRatings.results.map((r) => [r.card_name, r]),
  );

  // Build nested archetype → card → stats map from bulk result.
  const colorStatsByPairAndCard = new Map<string, Map<string, RatingRow>>();
  for (const row of colorStatsResult.results) {
    let byCard = colorStatsByPairAndCard.get(row.archetype);
    if (!byCard) {
      byCard = new Map();
      colorStatsByPairAndCard.set(row.archetype, byCard);
    }
    byCard.set(row.card_name, row);
  }

  // Bayesian priors for shrinkage. Stored as `center` values in calibration.
  const DEFAULT_ARCHETYPE_PRIOR = 750;
  const DEFAULT_SYNERGY_PRIOR = 75;
  const archetypePrior = preloaded
    ? (preloaded.sigmoidParams["archetype_prior"]?.center ??
      DEFAULT_ARCHETYPE_PRIOR)
    : (calibrationResult.results.find((c) => c.axis === "archetype_prior")
        ?.center ?? DEFAULT_ARCHETYPE_PRIOR);
  const synergyPrior = preloaded
    ? (preloaded.sigmoidParams["synergy_prior"]?.center ??
      DEFAULT_SYNERGY_PRIOR)
    : (calibrationResult.results.find((c) => c.axis === "synergy_prior")
        ?.center ?? DEFAULT_SYNERGY_PRIOR);

  // Build deck stats for archetype viability filtering and format-adjusted weighting.
  const deckCountByPair = new Map<string, number>();
  const archetypeWinRate = new Map<string, number>();
  for (const row of deckStatsResult.results) {
    deckCountByPair.set(row.archetype, row.total_decks);
    const wr =
      row.splash_rate * row.splash_winrate +
      (1 - row.splash_rate) * row.nonsplash_winrate;
    archetypeWinRate.set(row.archetype, wr);
  }
  const totalDecksAllPairs = [...deckCountByPair.values()].reduce(
    (a, b) => a + b,
    0,
  );

  // Format-adjust archetype weights: multiply each candidate's weight by the
  // archetype's empirical win rate, then re-normalize. When commitment is
  // roughly equal between two archetypes, this steers toward the stronger one.
  // When one archetype dominates by commitment, the adjustment barely matters.
  if (archetypeWinRate.size > 0) {
    const avgWr =
      [...archetypeWinRate.values()].reduce((a, b) => a + b, 0) /
      archetypeWinRate.size;
    let adjustedTotal = 0;
    for (const c of realCandidates) {
      const wr = archetypeWinRate.get(c.archetype) ?? avgWr;
      c.weight *= wr;
      adjustedTotal += c.weight;
    }
    if (adjustedTotal > 0) {
      for (const c of realCandidates) {
        c.weight /= adjustedTotal;
      }
    }
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
    // Bayesian shrinkage: sparse synergy pairs shrink toward zero delta.
    const n = row.games_together;
    const effectiveDelta =
      n + synergyPrior > 0 ? (n * row.synergy_delta) / (n + synergyPrior) : 0;
    list.push({ card: row.card_b, delta: r4(effectiveDelta) });
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
      targetsByPairRole.set(`${rt.archetype}:${rt.role}`, rt.avg_count);
    }
    const allRoles = new Set(roleTargetResult.results.map((rt) => rt.role));
    for (const role of allRoles) {
      let blended = 0;
      let totalWeight = 0;
      for (const cand of realCandidates) {
        const key = `${cand.archetype}:${role}`;
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
        const built: Record<string, { center: number; steepness: number }> = {};
        for (const cal of calibrationResult.results) {
          built[cal.axis] = { center: cal.center, steepness: cal.steepness };
        }
        return built;
      })();

  // Resolve set metadata (ASFAN + pack size).
  const asfan = preloaded
    ? preloaded.asfan
    : (setMetaResult.results[0]?.asfan ?? DEFAULT_ASFAN);
  const packSize = preloaded
    ? preloaded.packSize
    : (setMetaResult.results[0]?.pack_size ?? DEFAULT_PACK_SIZE);
  const totalPicks = packSize * 3;
  const remainingPicks = Math.max(0, totalPicks - pickNumber);

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
                `SELECT front_face_name AS name, cmc, mana_cost, colors, produced_mana FROM mtga_cards WHERE front_face_name IN (${ph}) AND is_default = 1`,
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
              `SELECT front_face_name AS name, cmc, mana_cost, colors, produced_mana FROM mtga_cards WHERE front_face_name IN (${missingPH}) AND is_default = 1`,
            )
            .bind(...missingMeta)
            .all<CardMetaRow>();
          for (const r of extraMeta.results) {
            metaByName.set(r.name, r);
          }
        }
      }

      const cardOpenness = computeSignalFromHistory(
        pickHistory,
        ataByCard,
        packSize,
      );
      archetypeOpenness = aggregateArchetypeOpenness(cardOpenness, metaByName);
    }
  }

  // Estimate mana base for castability scoring.
  const estimatedSources = estimateSources(poolMeta);

  // Compute per-color commitment for color_commitment axis.
  const colorCommitments = computeColorCommitment(poolMeta, pickNumber);

  // Compute scores for each pack card.
  const weights = getWeights(pickNumber);
  const profileLabel = getWeightProfileLabel(pickNumber);

  const recommendations: PickRecommendation[] = [];

  for (const packCard of packMeta) {
    const name = packCard.name;
    const packCardPips = countPips(packCard.mana_cost);

    // Baseline: multi-archetype weighted GIH WR with Bayesian shrinkage.
    // Each archetype's GIH WR is blended toward the overall mean based on
    // sample size: effective = (n * arch_gihwr + prior * overall) / (n + prior)
    const overallGihwr = overallByName.get(name)?.gihwr ?? 0;
    let baselineGihwr = 0;
    let baselineSource = "_overall";
    if (realCandidates.length > 0) {
      let weightedSum = 0;
      let totalWeight = 0;
      for (const cand of realCandidates) {
        const colorRow = colorStatsByPairAndCard.get(cand.archetype)?.get(name);
        if (colorRow) {
          const n = colorRow.games_in_hand;
          const effectiveGihwr =
            n + archetypePrior > 0
              ? (n * colorRow.gihwr + archetypePrior * overallGihwr) /
                (n + archetypePrior)
              : overallGihwr;
          weightedSum += effectiveGihwr * cand.weight;
          totalWeight += cand.weight;
          if (cand.weight > 0 && baselineSource === "_overall") {
            baselineSource = cand.archetype;
          }
        }
      }
      if (totalWeight > 0) {
        baselineGihwr = weightedSum / totalWeight;
      } else {
        baselineGihwr = overallGihwr;
      }
    } else {
      baselineGihwr = overallGihwr;
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
      const colorSet = new Set(packCardPips.keys());
      let bestOpenness = 0;
      for (const combo of ALL_COLOR_COMBOS) {
        if ([...combo].some((c) => colorSet.has(c))) {
          const o = archetypeOpenness.get(combo) ?? 0;
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

    // Castability — with pivot-potential source estimation.
    const cardPips = packCardPips;
    const maxPips = Math.max(0, ...[...cardPips.values()]);
    const castTurn = Math.max(1, Math.min(6, Math.ceil(packCard.cmc)));
    let castabilityScore = 1.0;
    let worstCurrentSources = 17;
    let worstPotentialSources = 0;
    let worstEffectiveSources = 17;
    let worstSourceModel: "current" | "splash" | "pivot" = "current";
    if (maxPips > 0) {
      let worstCastability = 1.0;
      for (const [color, pips] of cardPips) {
        const currentSrc = estimatedSources.get(color) ?? 0;
        const potentialSrc = estimatePotentialSources(
          remainingPicks,
          pips,
          asfan,
        );
        const effectiveSrc = Math.max(currentSrc, potentialSrc);
        const prob = castabilityLookup(effectiveSrc, pips, castTurn);
        if (prob < worstCastability) {
          worstCastability = prob;
          worstCurrentSources = currentSrc;
          worstPotentialSources = potentialSrc;
          worstEffectiveSources = effectiveSrc;
          worstSourceModel =
            currentSrc >= potentialSrc
              ? "current"
              : pips <= 1
                ? "splash"
                : "pivot";
        }
      }
      castabilityScore = worstCastability;
    }

    // Color commitment: how well this card fits the current draft direction.
    let colorFit = 1.0; // Colorless cards always fit
    if (packCardPips.size > 0) {
      colorFit = Math.max(
        ...[...packCardPips.keys()].map((c) => colorCommitments.get(c) ?? 0),
      );
    }

    // Opportunity cost: what pool value do we strand by taking this card?
    let opportunityScore = 1.0;
    if (packCardPips.size > 0 && poolMeta.length > 0) {
      // Find the implied pair: highest-weight candidate that includes at least
      // one of this card's colors. If none match, use the top candidate.
      const cardColorSet = new Set(packCardPips.keys());

      // Compute total pool value once (shared across all candidate pairs).
      let totalPoolValue = 0;
      for (let idx = 0; idx < poolMeta.length; idx++) {
        const baseline = overallByName.get(poolMeta[idx]!.name)?.gihwr ?? 0;
        if (baseline > 0) totalPoolValue += baseline * ((idx + 1) / pickNumber);
      }

      // Try each candidate pair that overlaps with the card's colors.
      const overlappingPairs = candidates.filter(
        (c) =>
          c.archetype !== "_overall" &&
          (cardColorSet.has(c.archetype[0]!) ||
            cardColorSet.has(c.archetype[1]!)),
      );
      // Also consider the primary pair as fallback.
      const pairsToTry =
        overlappingPairs.length > 0
          ? overlappingPairs
          : candidates.filter((c) => c.archetype !== "_overall").slice(0, 1);

      let bestStrandedValue = Infinity;
      let found = false;

      for (const candidate of pairsToTry) {
        const pairColors = new Set([
          candidate.archetype[0]!,
          candidate.archetype[1]!,
        ]);
        let strandedValue = 0;

        for (let idx = 0; idx < poolMeta.length; idx++) {
          const poolCard = poolMeta[idx]!;
          const poolCardColors = countPips(poolCard.mana_cost);
          const poolBaseline = overallByName.get(poolCard.name)?.gihwr ?? 0;
          if (poolBaseline <= 0) continue;

          // Colorless pool cards are never stranded.
          if (poolCardColors.size === 0) continue;

          // Card is stranded if none of its colors are in the implied pair.
          const onColor = [...poolCardColors.keys()].some((c) =>
            pairColors.has(c),
          );
          if (!onColor) {
            strandedValue += poolBaseline * ((idx + 1) / pickNumber);
          }
        }

        if (strandedValue < bestStrandedValue) {
          bestStrandedValue = strandedValue;
          found = true;
        }
      }

      if (found && totalPoolValue > 0) {
        opportunityScore = Math.max(
          0,
          Math.min(1, 1 - bestStrandedValue / totalPoolValue),
        );
      }
    }

    // Sigmoid normalization — all params from D1 calibration table.
    // Card-intrinsic axes (baseline, synergy, signal) use percentile-based
    // calibration; state-dependent axes use theoretical constants.
    const bsp = sp.baseline!;
    const ssp = sp.synergy!;
    const csp = sp.curve!;
    const sigsp = sp.signal!;
    const rsp = sp.role!;
    const ccsp = sp.color_commitment!;
    const ocsp = sp.opportunity_cost!;
    const baselineNorm = sigmoid(baselineGihwr, bsp.center, bsp.steepness);
    const synergyNorm = sigmoid(synergySum, ssp.center, ssp.steepness);
    const curveNorm = sigmoid(curveScore, csp.center, csp.steepness);
    const signalNorm = sigmoid(signalScore, sigsp.center, sigsp.steepness);
    const roleNorm = sigmoid(roleScore, rsp.center, rsp.steepness);
    const colorCommitmentNorm = sigmoid(colorFit, ccsp.center, ccsp.steepness);
    const opportunityCostNorm = sigmoid(
      opportunityScore,
      ocsp.center,
      ocsp.steepness,
    );
    // Power-aware castability dampening for elite cards early in draft.
    const bombExcess = Math.max(0, baselineNorm - BOMB_BASELINE_THRESHOLD);
    const earlyFactor = Math.max(
      0,
      1 - pickNumber / (totalPicks * BOMB_EARLY_DRAFT_FRACTION),
    );
    const bombDampening = Math.min(
      BOMB_MAX_DAMPENING,
      bombExcess * earlyFactor * BOMB_DAMPENING_MULTIPLIER,
    );
    const castabilityNorm =
      castabilityScore + (1 - castabilityScore) * bombDampening;

    // WASPAS hybrid.
    const wsm =
      weights.baseline * baselineNorm +
      weights.synergy * synergyNorm +
      weights.curve * curveNorm +
      weights.signal * signalNorm +
      weights.role * roleNorm +
      weights.castability * castabilityNorm +
      weights.colorCommitment * colorCommitmentNorm +
      weights.opportunityCost * opportunityCostNorm;

    const castNormSafe = Math.max(0.001, castabilityNorm);
    const ccNormSafe = Math.max(0.001, colorCommitmentNorm);
    const ocNormSafe = Math.max(0.001, opportunityCostNorm);
    const wpm =
      baselineNorm ** weights.baseline *
      synergyNorm ** weights.synergy *
      curveNorm ** weights.curve *
      signalNorm ** weights.signal *
      roleNorm ** weights.role *
      castNormSafe ** weights.castability *
      ccNormSafe ** weights.colorCommitment *
      ocNormSafe ** weights.opportunityCost;

    const lambda = 0.85 - 0.35 * (pickNumber / totalPicks);
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
          gihwr: r4(baselineGihwr),
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
          estimated_sources: worstCurrentSources,
          potential_sources: r4(worstPotentialSources),
          effective_sources: r4(worstEffectiveSources),
          source_model: worstSourceModel,
          bomb_dampening: r4(bombDampening),
        },
        signal: {
          raw: r4(signalScore),
          normalized: r4(signalNorm),
          weight: r4(weights.signal),
          contribution: r4(weights.signal * signalNorm),
          ata: r4(ata),
          current_pick: pickNumber,
        },
        color_commitment: {
          raw: r4(colorFit),
          normalized: r4(colorCommitmentNorm),
          weight: r4(weights.colorCommitment),
          contribution: r4(weights.colorCommitment * colorCommitmentNorm),
          color_fit: r4(colorFit),
        },
        opportunity_cost: {
          raw: r4(opportunityScore),
          normalized: r4(opportunityCostNorm),
          weight: r4(weights.opportunityCost),
          contribution: r4(weights.opportunityCost * opportunityCostNorm),
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
      archetype: (() => {
        const allDeckShares = [...deckCountByPair.values()].map((c) =>
          totalDecksAllPairs > 0 ? c / totalDecksAllPairs : 0,
        );
        return {
          primary: primaryArchetype,
          candidates: candidates
            .filter((c) => {
              if (c.archetype === "_overall") return true;
              if (c.archetype === primaryArchetype) return true;
              if (totalDecksAllPairs === 0) return true;
              const deckCount = deckCountByPair.get(c.archetype) ?? 0;
              return deckCount / totalDecksAllPairs >= 0.02;
            })
            .map((c) => {
              const deckCount = deckCountByPair.get(c.archetype) ?? 0;
              const deckShare =
                totalDecksAllPairs > 0
                  ? Math.round((deckCount / totalDecksAllPairs) * 1000) / 1000
                  : 0;
              const { viability, format_context } = computeViabilityTier(
                deckShare,
                allDeckShares,
              );
              return {
                archetype: c.archetype,
                weight: Math.round(c.weight * 100) / 100,
                deck_count: deckCount,
                deck_share: deckShare,
                viability,
                format_context,
              };
            }),
          confidence: Math.round(confidence * 100) / 100,
        };
      })(),
      pick_number: pickNumber,
      weight_profile: profileLabel,
      weights: {
        baseline: Math.round(weights.baseline * 100) / 100,
        synergy: Math.round(weights.synergy * 100) / 100,
        curve: Math.round(weights.curve * 100) / 100,
        signal: Math.round(weights.signal * 100) / 100,
        role: Math.round(weights.role * 100) / 100,
        castability: Math.round(weights.castability * 100) / 100,
        color_commitment: Math.round(weights.colorCommitment * 100) / 100,
        opportunity_cost: Math.round(weights.opportunityCost * 100) / 100,
      },
      recommendations,
    },
  };
}

// ── Archetype warning generation ─────────────────────────────

export interface ArchetypeFrame {
  pick_number: number;
  display_label: string;
  primary: string;
  primary_weight: number;
  secondary: string;
  secondary_weight: number;
  viability: string;
  phase: "exploration" | "emerging" | "committed";
}

const PIVOT_GAP = 0.08;
const SPLIT_GAP = 0.05;
const SPLIT_RUN = 3;

/** Pivot/split/weakness warnings from a sequence of archetype frames. */
export function generateArchetypeWarnings(
  frames: ArchetypeFrame[],
): string[] {
  const warnings: string[] = [];

  // Initialize sustained primary from the last exploration frame, so we
  // enter the emerging phase with the archetype the drafter established.
  let sustainedPrimary = "";
  for (const f of frames) {
    if (f.phase === "exploration") {
      sustainedPrimary = f.primary;
    } else {
      break;
    }
  }
  let commitmentPointPrimary = ""; // frozen snapshot at first emerging frame

  // Split run tracking
  let splitRunStart = "";
  let splitRunLength = 0;
  let splitArchA = "";
  let splitArchB = "";
  let splitStartPhase: "emerging" | "committed" = "emerging";

  function flushSplitRun(endLabel: string): void {
    if (splitRunLength >= SPLIT_RUN) {
      const archetypes = [splitArchA, splitArchB].sort().join(" and ");
      if (splitStartPhase === "committed") {
        warnings.push(
          `${splitRunStart}–${endLabel}: split between ${archetypes} — still undecided in committed phase`,
        );
      } else {
        warnings.push(
          `${splitRunStart}–${endLabel}: split between ${archetypes}`,
        );
      }
    }
    splitRunLength = 0;
    splitRunStart = "";
    splitArchA = "";
    splitArchB = "";
  }

  let prevLabel = "";
  for (const frame of frames) {
    // Skip exploration phase entirely
    if (frame.phase === "exploration") continue;

    // Initialize commitment point and sustained (if not set from exploration)
    if (!commitmentPointPrimary) {
      if (!sustainedPrimary) {
        sustainedPrimary = frame.primary;
      }
      commitmentPointPrimary = frame.primary;

      // Weak archetype at commitment point
      if (frame.viability === "sparse" || frame.viability === "fringe") {
        const pctNote = frame.viability === "fringe" ? "<5%" : "5-25%";
        warnings.push(
          `Entering commitment phase in ${frame.primary} (${frame.viability} — only ${pctNote} of winning decks in this format)`,
        );
      }
    }

    // Pivot detection: check if current primary differs from sustained
    if (frame.primary !== sustainedPrimary) {
      // Compute weight gap between new primary and sustained primary
      let sustainedWeight: number;
      if (frame.secondary === sustainedPrimary) {
        sustainedWeight = frame.secondary_weight;
      } else {
        // Sustained primary isn't even in top 2 — clearly a pivot
        sustainedWeight = 0;
      }
      const gap = frame.primary_weight - sustainedWeight;

      if (gap > PIVOT_GAP) {
        // Genuine pivot — update sustained and emit warning
        const verb = frame.phase === "committed" ? "pivot" : "drift";
        warnings.push(
          `${frame.display_label}: ${verb} from ${sustainedPrimary} to ${frame.primary}`,
        );
        sustainedPrimary = frame.primary;
      }
    }
    // When primary matches sustained, no action needed — sustained stays.

    // Split detection: top-two gap < SPLIT_GAP
    const topTwoGap = frame.primary_weight - frame.secondary_weight;
    if (topTwoGap < SPLIT_GAP) {
      const pairA = frame.primary;
      const pairB = frame.secondary;
      if (splitRunLength === 0) {
        splitRunStart = frame.display_label;
        splitArchA = pairA;
        splitArchB = pairB;
        splitStartPhase = frame.phase === "committed" ? "committed" : "emerging";
        splitRunLength = 1;
      } else {
        // Continue run if it's the same pair of archetypes (in either order)
        const sameA = splitArchA;
        const sameB = splitArchB;
        if (
          (pairA === sameA && pairB === sameB) ||
          (pairA === sameB && pairB === sameA)
        ) {
          splitRunLength++;
          // Upgrade to committed if any frame in the run is committed
          if (frame.phase === "committed") {
            splitStartPhase = "committed";
          }
        } else {
          // Different pair — flush and start new run
          flushSplitRun(frame.display_label);
          splitRunStart = frame.display_label;
          splitArchA = pairA;
          splitArchB = pairB;
          splitStartPhase = frame.phase === "committed" ? "committed" : "emerging";
          splitRunLength = 1;
        }
      }
    } else {
      if (splitRunLength > 0) {
        // Gap widened — flush the run ending at the last split frame
        flushSplitRun(prevLabel || frame.display_label);
      }
    }

    prevLabel = frame.display_label;
  }

  // Flush any trailing split run using last frame's label
  if (splitRunLength > 0 && frames.length > 0) {
    flushSplitRun(frames[frames.length - 1]!.display_label);
  }

  // Final archetype weakness
  const finalFrame = frames[frames.length - 1];
  if (
    finalFrame &&
    finalFrame.phase !== "exploration" &&
    (finalFrame.viability === "sparse" || finalFrame.viability === "fringe")
  ) {
    warnings.push(
      `Final archetype ${finalFrame.primary} is ${finalFrame.viability} — consider alternatives in deckbuilding`,
    );
  }

  // Commitment-to-final summary: compare frozen snapshot to final primary
  const finalPrimary = finalFrame?.primary;
  if (
    commitmentPointPrimary &&
    finalPrimary &&
    commitmentPointPrimary !== finalPrimary
  ) {
    warnings.push(
      `Archetype shift: started as ${commitmentPointPrimary} at the commitment point and ended as ${finalPrimary}`,
    );
  }

  return warnings;
}

// ── Batch review mode ────────────────────────────────────────

interface BatchPickResult {
  pick_number: number;
  pack_number: number;
  pick_in_pack: number;
  display_label: string;
  chosen: string;
  chosen_rank: number;
  chosen_composite: number;
  recommended: string;
  recommended_composite: number;
  classification: "optimal" | "good" | "questionable" | "miss";
  archetype_snapshot: {
    primary: string;
    primary_weight: number;
    confidence: number;
    secondary: string;
    secondary_weight: number;
    viability: string;
    phase: "exploration" | "emerging" | "committed";
  };
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
  const batchPackSize = preloaded.packSize;

  const results: BatchPickResult[] = [];
  const poolSoFar: string[] = [];
  let optimal = 0;
  let good = 0;
  let questionable = 0;
  let misses = 0;

  for (let i = 0; i < pickHistory.length; i++) {
    const entry = pickHistory[i]!;
    if (!entry.chosen || entry.available.length === 0) continue;
    // Skip basic land picks entirely — they have zero marginal value in Arena
    // (unlimited basics available for free during deckbuilding).
    if (BASIC_LAND_NAMES.has(entry.chosen)) continue;

    const pickNumber = i + 1;
    const packNumber = Math.floor(i / batchPackSize);
    const pickInPack = (i % batchPackSize) + 1;

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
    const data = pickResult.data as {
      recommendations: PickRecommendation[];
      archetype: {
        primary: string;
        confidence: number;
        candidates: { archetype: string; weight: number; viability: string }[];
      };
    };
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

    const candidates = data.archetype?.candidates ?? [];
    const primaryCand = candidates.find(
      (c) => c.archetype === data.archetype?.primary,
    );
    const primaryViability = primaryCand?.viability ?? "fringe";
    const primaryWeight = primaryCand?.weight ?? 0;
    // Secondary: first candidate that isn't the primary and isn't _overall
    const secondaryCand = candidates.find(
      (c) =>
        c.archetype !== data.archetype?.primary && c.archetype !== "_overall",
    );
    results.push({
      pick_number: pickNumber,
      pack_number: packNumber + 1,
      pick_in_pack: pickInPack,
      display_label: `P${packNumber + 1}P${pickInPack}`,
      chosen: entry.chosen,
      chosen_rank: chosenRank,
      chosen_composite: chosenComposite,
      recommended: topRec.card,
      recommended_composite: topRec.composite_score,
      classification,
      archetype_snapshot: {
        primary: data.archetype?.primary ?? "_overall",
        primary_weight: primaryWeight,
        confidence: data.archetype?.confidence ?? 0,
        secondary: secondaryCand?.archetype ?? "_overall",
        secondary_weight: secondaryCand?.weight ?? 0,
        viability: primaryViability,
        phase:
          pickNumber < 12
            ? "exploration"
            : pickNumber < 21
              ? "emerging"
              : "committed",
      },
    });
  }

  // Build archetype frames and generate warnings via pure function
  const archetypeFrames: ArchetypeFrame[] = results.map((pick) => ({
    pick_number: pick.pick_number,
    display_label: pick.display_label,
    primary: pick.archetype_snapshot.primary,
    primary_weight: pick.archetype_snapshot.primary_weight,
    secondary: pick.archetype_snapshot.secondary,
    secondary_weight: pick.archetype_snapshot.secondary_weight,
    viability: pick.archetype_snapshot.viability,
    phase: pick.archetype_snapshot.phase,
  }));
  const archetypeWarnings = generateArchetypeWarnings(archetypeFrames);

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
        archetype_warnings: archetypeWarnings,
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
    "SET: Do not pass 'set' — it is auto-detected from the card names you provide. Only pass set explicitly to force a specific set.",
    "",
    "TWO MODES:",
    "",
    "1. LIVE PICK (set + pool + pack): Rank each card in the pack using 8 axes — baseline (archetype-weighted GIH WR), synergy (pairwise interaction with pool), curve (CMC gap detection), signal (archetype openness), role (creature/removal/fixing composition), castability (Karsten hypergeometric), color commitment (draft direction fit), opportunity cost (stranded pool value). Combined via WASPAS hybrid scoring.",
    "   - Pass pick_history (array of {available, chosen}) to enable accumulated signal tracking across the full draft.",
    "   - Read component breakdowns to explain WHY a card scores high — don't just report the rank.",
    "   - Warn when castability < 80%. Warn when a role category is empty.",
    "",
    "2. BATCH REVIEW (set + pick_history where all picks have 'chosen'): Compact overview of a completed draft. Returns summary (optimal/good/questionable/miss counts) plus per-pick classification with chosen rank and top recommendation. NO full axis breakdowns — use this to identify which picks to examine, then call LIVE PICK mode for detailed analysis of specific picks.",
    "   - Each pick is evaluated with the pool-so-far and history-so-far at that point.",
    "   - 'optimal' = chosen was rank 1, 'good' = rank 2, 'questionable' = rank 3, 'miss' = rank 4+.",
    "   - For detailed analysis of specific picks, call LIVE PICK mode with pool = in_deck, pack = available, pick_number from the draft_history section data.",
    "",
    "WEIGHT PROFILES: Early picks (1-14, pack 1) favor baseline + signal — castability is near-zero because color commitment should be minimal through pack 1. Mid picks (15-28, pack 2) balance all axes as castability rises. Late picks (29+, pack 3) favor synergy + role + curve + castability.",
    "",
    "CASTABILITY uses pivot-potential modeling: off-color cards get credit for sources you could acquire over remaining picks. Single-pip cards use splash curve (ASFAN-dependent), double-pip cards use pivot curve (steeper decay). Output includes source_model ('current'/'splash'/'pivot') to explain the estimation basis.",
    "",
    "BOMB DAMPENING: Cards with exceptional baseline (normalized > 0.80) receive power-aware castability dampening early in draft — the bomb_dampening field shows the boost. This reflects draft theory: 'take the bomb, fix the mana later' dominates color concerns in pack 1. Double-pip off-color in pack 1 is a deck-building flag, not a draft-time disqualifier. Note the mana difficulty but do not steer the drafter away from bombs based on castability alone.",
    "",
    "SPLASH RULES (deck-building, not early-draft): Only splash single-pip cards at CMC 4+ with 3+ sources. Never splash double-pip. Check castability score — below 0.7 means unreliable.",
    "",
    "Data source: 17Lands (17lands.com), licensed CC BY 4.0.",
  ].join("\n"),
  parameters: {
    set: {
      type: "string",
      description:
        "Set code — auto-detected from card names when omitted. Only pass to override auto-detection.",
    },
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
        "Current pick number (1-based, typically 1 to pack_size*3). Affects weight profile and castability potential. Default 10.",
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
    draft_section: {
      type: "string",
      description:
        'Section name containing draft history (e.g., "draft_history"). Requires save_id. Auto-detects live pick vs review mode.',
    },
    save_id: {
      type: "string",
      description: "Save UUID. Required when using draft_section.",
    },
  },

  view_default: "visible",
  sectionMappings: [
    {
      sectionParam: "draft_section",
      extract: (sectionData: unknown) => {
        // Section shape: {drafts: [{eventName, draftType, picks: [...]}]}
        // Use the last (most recent) draft.
        const data = sectionData as Record<string, unknown>;
        const drafts = Array.isArray(data.drafts)
          ? (data.drafts as Array<{ picks?: unknown[] }>)
          : [];
        const lastDraft = drafts[drafts.length - 1];
        const picks = Array.isArray(lastDraft?.picks)
          ? (lastDraft.picks as Array<{
              packNumber: number;
              pickNumber: number;
              in_deck: Array<{ name: string }>;
              available: Array<{ name: string }>;
              picked: string;
            }>)
          : [];
        if (picks.length === 0) return {};

        const lastPick = picks[picks.length - 1]!;
        const isLive = !lastPick.picked;

        if (isLive) {
          // Live pick mode: extract pool + pack from the last (incomplete) pick
          const pool = lastPick.in_deck.map((c) => c.name);
          const pack = lastPick.available.map((c) => c.name);
          const pickNumber = lastPick.pickNumber + 1; // 1-based
          return { pool, pack, pick_number: pickNumber };
        }

        // Review mode: extract pick_history from all completed picks
        const pickHistory = picks.map((p) => ({
          available: p.available.map((c) => c.name),
          chosen: p.picked,
        }));
        return { pick_history: pickHistory };
      },
    },
  ],

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    let setCode = ((query.set as string) ?? "").toUpperCase();
    const pool = ((query.pool as string[]) ?? []).slice(0, 45);
    const pack = ((query.pack as string[]) ?? []).slice(0, 15);
    const maxPicks = 60; // generous upper bound; actual totalPicks derived from set_metadata inside contextualPick
    const pickNumber = Math.max(
      1,
      Math.min(
        maxPicks,
        typeof query.pick_number === "number" ? query.pick_number : 10,
      ),
    );
    const pickHistory = Array.isArray(query.pick_history)
      ? (query.pick_history as Array<{ available?: string[]; chosen?: string }>)
          .slice(0, maxPicks)
          .filter((e) => Array.isArray(e?.available))
          .map((e) => ({
            available: e.available!.slice(0, 15),
            chosen: e.chosen ?? "",
          }))
      : undefined;

    // Auto-infer set from card names when not provided.
    if (!setCode) {
      const allNames = new Set<string>();
      for (const name of pack) allNames.add(name);
      for (const name of pool) allNames.add(name);
      if (pickHistory) {
        for (const entry of pickHistory) {
          if (entry.chosen) allNames.add(entry.chosen);
        }
      }

      if (allNames.size === 0) {
        return {
          type: "text",
          content:
            "Cannot determine set: no card names provided. Pass pack, pool, or pick_history with card names, or specify {set: 'TMT'} explicitly.\n",
        };
      }

      const nameList = [...allNames];
      const setCounts = new Map<string, number>();

      for (let i = 0; i < nameList.length; i += META_BATCH_SIZE) {
        const chunk = nameList.slice(i, i + META_BATCH_SIZE);
        const inferPH = placeholders(chunk.length, 1);
        const chunkResult = await env.DB.prepare(
          `SELECT set_code, COUNT(*) as matches FROM mtga_draft_ratings WHERE card_name IN (${inferPH}) GROUP BY set_code`,
        )
          .bind(...chunk)
          .all<{ set_code: string; matches: number }>();

        for (const row of chunkResult.results) {
          setCounts.set(
            row.set_code,
            (setCounts.get(row.set_code) ?? 0) + row.matches,
          );
        }
      }

      const rows = [...setCounts.entries()]
        .map(([set_code, matches]) => ({ set_code, matches }))
        .toSorted((a, b) => b.matches - a.matches)
        .slice(0, 2);

      if (rows.length === 0) {
        const available = await env.DB.prepare(
          "SELECT set_code FROM mtga_draft_set_stats ORDER BY set_code",
        ).all<{ set_code: string }>();
        const codes = available.results.map((r) => r.set_code).join(", ");
        return {
          type: "text",
          content: `No draft data found for these card names. Available sets: ${codes}\n`,
        };
      }

      const top = rows[0]!;
      const runner = rows[1];

      if (!runner || top.matches - runner.matches >= 3) {
        setCode = top.set_code;
      } else {
        return {
          type: "text",
          content: `Could not determine set: cards match ${top.set_code} (${top.matches} matches) and ${runner.set_code} (${runner.matches} matches). Pass {set: '${top.set_code}'} to specify.\n`,
        };
      }
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
        type: "text",
        content: `Set "${setCode}" not found. Available sets: ${codes}\n`,
      };
    }

    // Mode 1: Live pick (pack present, pool may be empty for P1P1).
    if (pack.length > 0) {
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
      type: "text",
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
