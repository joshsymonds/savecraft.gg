/**
 * Shared scoring primitives for MTGA reference modules.
 *
 * Extracted from draft-advisor.ts to be reused by deckbuilding and other
 * modules that need castability, archetype detection, synergy, signal,
 * curve, role scoring, or pick-adaptive weights.
 *
 * This module has NO dependencies on Env, D1, or worker internals —
 * it is pure TypeScript math and type definitions.
 */

// ── DB row types ─────────────────────────────────────────────

export interface RatingRow {
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

export interface CardMetaRow {
  name: string;
  cmc: number;
  mana_cost: string;
  colors: string;
  type_line: string;
  produced_mana: string;
}

export interface SetMetadataRow {
  set_code: string;
  asfan: number;
  pack_size: number;
}

export interface SynergyDbRow {
  card_a: string;
  card_b: string;
  synergy_delta: number;
}

export interface CurveDbRow {
  archetype: string;
  cmc: number;
  avg_count: number;
  total_decks: number;
}

export interface CardRoleRow {
  front_face_name: string;
  role: string;
}

export interface RoleTargetRow {
  archetype: string;
  role: string;
  avg_count: number;
}

export interface CalibrationRow {
  axis: string;
  center: number;
  steepness: number;
}

// ── Scoring types ────────────────────────────────────────────

export interface AxisScore {
  raw: number;
  normalized: number;
  weight: number;
  contribution: number;
}

export interface ArchetypeCandidate {
  colorPair: string;
  weight: number;
}

export interface WeightSet {
  baseline: number;
  synergy: number;
  curve: number;
  signal: number;
  role: number;
  castability: number;
  colorCommitment: number;
  opportunityCost: number;
}

// ── Constants ────────────────────────────────────────────────

export const DEFAULT_ASFAN = 0.4;
export const DEFAULT_PACK_SIZE = 14;
export const META_BATCH_SIZE = 99;

/** All basic land card names in Magic: The Gathering. These are always
 *  available for free during Arena deckbuilding, so drafting one has zero
 *  marginal value. The draft advisor excludes them from recommendations. */
export const BASIC_LAND_NAMES: ReadonlySet<string> = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
  "Snow-Covered Plains",
  "Snow-Covered Island",
  "Snow-Covered Swamp",
  "Snow-Covered Mountain",
  "Snow-Covered Forest",
  "Snow-Covered Wastes",
]);

/** All 31 non-empty subsets of WUBRG, ordered by size then WUBRG position.
 *  5 mono + 10 pair + 10 triple + 5 quad + 1 five-color. */
export const ALL_COLOR_COMBOS: readonly string[] = (() => {
  const colors = "WUBRG";
  const combos: string[] = [];
  for (let mask = 1; mask < 1 << colors.length; mask++) {
    let combo = "";
    for (let i = 0; i < colors.length; i++) {
      if (mask & (1 << i)) combo += colors[i];
    }
    combos.push(combo);
  }
  combos.sort((a, b) => a.length - b.length);
  return combos;
})();

/** Required sigmoid calibration axes. All params come from the D1
 *  mtga_draft_calibration table — card-intrinsic axes (baseline, synergy,
 *  signal) are percentile-calibrated during import, state-dependent axes
 *  (castability, color_commitment, opportunity_cost, curve, role) use
 *  theoretical constants written by the Go pipeline. */
export const REQUIRED_CALIBRATION_AXES = [
  "baseline",
  "synergy",
  "signal",
  "castability",
  "color_commitment",
  "opportunity_cost",
  "curve",
  "role",
] as const;

// ── Karsten castability table ────────────────────────────────

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

function hypergeomCDF(N: number, K: number, n: number, k: number): number {
  if (k <= 0) return 1;
  if (K < k) return 0;
  let sum = 0;
  for (let i = 0; i < k; i++) {
    sum += (binomCoeff(K, i) * binomCoeff(N - K, n - i)) / binomCoeff(N, n);
  }
  return 1 - sum;
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

export function castabilityLookup(
  sources: number,
  pips: number,
  turn: number,
): number {
  const s = Math.max(0, Math.min(17, Math.round(sources)));
  const p = Math.max(1, Math.min(3, pips));
  const t = Math.max(1, Math.min(6, turn));
  return CASTABILITY_TABLE[s]?.[p]?.[t] ?? 0;
}

// ── Pip counting & source estimation ───────────���─────────────

export function countPips(manaCost: string): Map<string, number> {
  const pips = new Map<string, number>();
  const matches = manaCost.matchAll(/\{([WUBRG])\}/g);
  for (const m of matches) {
    const color = m[1]!;
    pips.set(color, (pips.get(color) ?? 0) + 1);
  }
  return pips;
}

export function estimateSources(poolMeta: CardMetaRow[]): Map<string, number> {
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

  // Fixing lands (e.g. Evolving Wilds) have no colored pips in their mana cost
  // but tap for one or more colors. Each such card is +1 source for every color
  // it produces, including colors already in the pip distribution — a UB deck
  // with Evolving Wilds genuinely has one more U and B source than without it.
  for (const card of poolMeta) {
    if (!card.produced_mana || card.produced_mana === "[]") continue;
    try {
      const produced = JSON.parse(card.produced_mana) as string[];
      for (const color of produced) {
        if (["W", "U", "B", "R", "G"].includes(color)) {
          sources.set(color, (sources.get(color) ?? 0) + 1);
        }
      }
    } catch {
      // Malformed produced_mana — skip.
    }
  }

  return sources;
}

// ── Sigmoid normalization ────────────────────────────────────

export function sigmoid(x: number, center: number, steepness: number): number {
  return 1 / (1 + Math.exp(-steepness * (x - center)));
}

// ── Pivot-potential source estimation ─────────────────────────

/**
 * Estimate acquirable sources for an off-color card based on remaining picks.
 *
 * Two categorically separate curves:
 * - Splash (1 pip): models acquiring fixing lands. Rate is ASFAN-dependent
 *   because fixing density varies enormously by format (0.05–1.1 ASFAN).
 * - Pivot (2+ pips): models drafting on-color cards in a new color. Rate is
 *   ASFAN-independent because on-color cards exist at ~20% per color across
 *   all formats — you're picking up playable cards and basics, not just duals.
 */
export function estimatePotentialSources(
  remainingPicks: number,
  pips: number,
  asfan: number,
): number {
  if (pips <= 1) {
    return Math.min(4, remainingPicks * asfan * 0.35);
  }
  const pivotViability = sigmoid(remainingPicks, 18, 0.25);
  return Math.min(7, remainingPicks * 0.22 * pivotViability);
}

// ── Continuous pick-adaptive weights ─────────────────────────

export function smoothWeight(
  pick: number,
  startVal: number,
  endVal: number,
  midpoint: number,
  steepness: number,
): number {
  const t = sigmoid(pick, midpoint, steepness);
  return startVal + (endVal - startVal) * t;
}

export function getWeights(pickNumber: number): WeightSet {
  const baseline = smoothWeight(pickNumber, 0.45, 0.12, 15, 4);
  const synergy = smoothWeight(pickNumber, 0.05, 0.28, 18, 5);
  const role = smoothWeight(pickNumber, 0.05, 0.22, 20, 4);
  const curve = smoothWeight(pickNumber, 0.03, 0.13, 22, 5);
  const castability = smoothWeight(pickNumber, 0.02, 0.10, 25, 4);
  const signal = smoothWeight(pickNumber, 0.25, 0.05, 12, 4);
  const colorCommitment = smoothWeight(pickNumber, 0.03, 0.05, 21, 6);
  const opportunityCost = smoothWeight(pickNumber, 0.02, 0.12, 24, 4);

  // Cap combined color commitment + opportunity cost at 18% of total weight.
  // Both axes penalize off-color cards — without a cap they double-team and
  // can erase a bomb's baseline advantage.
  const maxColorShare = 0.18;
  const rawOther = baseline + synergy + role + curve + castability + signal;
  const rawColor = colorCommitment + opportunityCost;
  const colorCap = rawOther * (maxColorShare / (1 - maxColorShare));
  const colorScale = rawColor > colorCap ? colorCap / rawColor : 1;
  const adjColorCommitment = colorCommitment * colorScale;
  const adjOpportunityCost = opportunityCost * colorScale;

  const total = rawOther + adjColorCommitment + adjOpportunityCost;
  return {
    baseline: baseline / total,
    synergy: synergy / total,
    curve: curve / total,
    signal: signal / total,
    role: role / total,
    castability: castability / total,
    colorCommitment: adjColorCommitment / total,
    opportunityCost: adjOpportunityCost / total,
  };
}

export function getWeightProfileLabel(pickNumber: number): string {
  if (pickNumber <= 14) return "early";
  if (pickNumber <= 28) return "mid";
  return "late";
}

// ── Color commitment model ───────────────────────────────────

const COLORS = ["W", "U", "B", "R", "G"] as const;
const OPEN_BONUS = 0.3;
const PAIR_THRESHOLD = 1e-6;

/**
 * Layer 1: Per-color commitment via sigmoid on pip share.
 *
 * Maps each color's fraction of total pips to a 0–1 commitment level:
 *   0% pips → ~0.1 (open, not locked out)
 *  15% pips → ~0.5 (present but not dominant)
 *  40%+ pips → ~0.95 (locked in)
 *
 * For picks 1–5, all commitments are dampened toward a uniform 0.2
 * so the first card's color doesn't overdetermine the draft direction.
 */
export function computeColorCommitment(
  poolMeta: CardMetaRow[],
  pickNumber: number,
): Map<string, number> {
  const pipCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const card of poolMeta) {
    for (const [color, count] of countPips(card.mana_cost)) {
      if (color in pipCounts) pipCounts[color] = (pipCounts[color] ?? 0) + count;
    }
  }

  const totalPips = Object.values(pipCounts).reduce((a, b) => a + b, 0);
  const earlyDampen = Math.max(0, (6 - pickNumber) / 5);

  const commitments = new Map<string, number>();
  for (const color of COLORS) {
    const pipShare = totalPips > 0 ? pipCounts[color]! / totalPips : 0;
    const raw = sigmoid(pipShare, 0.15, 15);
    const effective = raw * (1 - earlyDampen) + 0.2 * earlyDampen;
    commitments.set(color, effective);
  }

  return commitments;
}

/**
 * Layer 2: Derive archetype weights from individual color commitments.
 *
 * Produces weights for all 31 WUBRG subsets using a tiered formula:
 *   - Mono (1 color): c_X
 *   - Pair (2 colors): c_A * c_B + OPEN_BONUS * (1-c_A) * c_B + OPEN_BONUS * c_A * (1-c_B)
 *   - Triple+ (3-5 colors): Π(c_X for X in combo) — pure product
 *
 * The open bonus models the two-color strategic question "what's my second
 * color?" For three or more colors, commitment is either intentional (wedge
 * format) or incidental (splash), both captured by the pure product.
 *
 * Returns normalized weights summing to 1.0, sorted by weight descending.
 */
export function deriveArchetypeWeights(
  commitments: Map<string, number>,
): ArchetypeCandidate[] {
  const candidates: { colorPair: string; raw: number }[] = [];
  for (const combo of ALL_COLOR_COMBOS) {
    let raw: number;
    if (combo.length === 1) {
      raw = commitments.get(combo) ?? 0;
    } else if (combo.length === 2) {
      const cA = commitments.get(combo[0]!) ?? 0;
      const cB = commitments.get(combo[1]!) ?? 0;
      raw =
        cA * cB +
        OPEN_BONUS * (1 - cA) * cB +
        OPEN_BONUS * cA * (1 - cB);
    } else {
      raw = 1;
      for (const c of combo) {
        raw *= commitments.get(c) ?? 0;
      }
    }
    candidates.push({ colorPair: combo, raw });
  }

  const totalRaw = candidates.reduce((s, p) => s + p.raw, 0);
  if (totalRaw < PAIR_THRESHOLD) {
    return [{ colorPair: "_overall", weight: 1.0 }];
  }

  candidates.sort((a, b) => b.raw - a.raw);
  return candidates.map((p) => ({
    colorPair: p.colorPair,
    weight: p.raw / totalRaw,
  }));
}

/**
 * Determines candidate archetypes from pool cards using a two-layer model:
 * Layer 1 computes per-color commitment from pip shares, Layer 2 derives
 * weights for all 31 color combinations.
 */
export function determineCandidateArchetypes(
  poolMeta: CardMetaRow[],
  pickNumber: number = 15,
): ArchetypeCandidate[] {
  const commitments = computeColorCommitment(poolMeta, pickNumber);
  return deriveArchetypeWeights(commitments);
}

// ── Signal tracking ──────────────────────────────────────────

export interface PickHistoryEntry {
  available: string[];
  chosen: string;
}

export function computeSignalFromHistory(
  pickHistory: PickHistoryEntry[],
  ataByCard: Map<string, { ata: number; stddev: number }>,
  packSize: number,
): Map<string, number> {
  const openness = new Map<string, number>();
  const learningRate = 0.15;
  const packMultiplier = [1.0, 0.6, 0.8];

  for (let i = 0; i < pickHistory.length; i++) {
    const entry = pickHistory[i]!;
    const globalPick = i + 1;
    const packIndex = Math.floor(i / packSize);
    const pickInPack = (i % packSize) + 1;

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

export function aggregateArchetypeOpenness(
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

    for (const combo of ALL_COLOR_COMBOS) {
      if ([...combo].some((c) => colorSet.has(c))) {
        archSums.set(combo, (archSums.get(combo) ?? 0) + signal);
        archCounts.set(combo, (archCounts.get(combo) ?? 0) + 1);
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

// ── Utilities ────────────────────────────────────────────────

export function placeholders(count: number, startIdx: number): string {
  return Array.from({ length: count }, (_, i) => `?${startIdx + i}`).join(",");
}

/** Round to 4 decimal places for output precision. */
export function r4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
