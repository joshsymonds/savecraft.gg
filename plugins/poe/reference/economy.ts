/**
 * PoE economy — native reference module.
 *
 * Live price data from poe.ninja's /poe1 API with per-isolate in-memory caching
 * (~1hr TTL). No D1 access — fetches directly. League is auto-detected via
 * /poe1/api/data/index-state when callers omit it.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE = "https://poe.ninja/poe1";
/** Path version segment. poe.ninja's bundle ships only "current" today. */
const VERSION = "current";
/** Types served by /currency/overview. Everything else uses /item/overview. */
const CURRENCY_TYPES = new Set<string>(["Currency", "Fragment"]);
const DEFAULT_TYPE = "UniqueArmour";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 50;
const FETCH_TIMEOUT_MS = 10_000;
const INDEX_STATE_CACHE_KEY = "index-state";

// ---------------------------------------------------------------------------
// poe.ninja response types
// ---------------------------------------------------------------------------

interface SparkLine {
  readonly totalChange?: number;
  readonly data?: ReadonlyArray<number | null>;
}

interface PoeNinjaModifier {
  readonly text: string;
}

interface PoeNinjaItemLine {
  readonly name: string;
  readonly chaosValue: number;
  readonly divineValue?: number;
  readonly icon?: string;
  readonly baseType?: string;
  readonly sparkLine?: SparkLine;
  readonly lowConfidenceSparkLine?: SparkLine;
  readonly listingCount?: number;
  readonly levelRequired?: number;
  readonly implicitModifiers?: ReadonlyArray<PoeNinjaModifier>;
  readonly explicitModifiers?: ReadonlyArray<PoeNinjaModifier>;
  readonly mutatedModifiers?: ReadonlyArray<PoeNinjaModifier>;
  readonly flavourText?: string;
}

interface PoeNinjaItemResponse {
  readonly lines: readonly PoeNinjaItemLine[];
}

interface PoeNinjaCurrencyLeg {
  readonly value: number;
  readonly count?: number;
  readonly listing_count?: number;
}

interface PoeNinjaCurrencyLine {
  readonly currencyTypeName: string;
  readonly chaosEquivalent?: number;
  readonly receive?: PoeNinjaCurrencyLeg;
  readonly receiveSparkLine?: SparkLine;
  readonly lowConfidenceReceiveSparkLine?: SparkLine;
}

interface PoeNinjaCurrencyResponse {
  readonly lines: readonly PoeNinjaCurrencyLine[];
}

interface IndexStateLeague {
  readonly name: string;
  readonly url?: string;
  readonly displayName?: string;
}

interface IndexState {
  readonly economyLeagues: readonly IndexStateLeague[];
  readonly oldEconomyLeagues?: readonly IndexStateLeague[];
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

type Path = "item" | "currency";

interface CachedOverview {
  readonly kind: "overview";
  readonly path: Path;
  readonly itemLines?: readonly PoeNinjaItemLine[];
  readonly currencyLines?: readonly PoeNinjaCurrencyLine[];
  readonly fetchedAt: number;
}

interface CachedIndexState {
  readonly kind: "index-state";
  readonly state: IndexState;
  readonly fetchedAt: number;
}

type CacheEntry = CachedOverview | CachedIndexState;

const cache = new Map<string, CacheEntry>();
/** Singleflight: in-flight fetches deduplicated by cache key. */
const inflight = new Map<string, Promise<CacheEntry | null>>();

/** Clear all caches. Test helper. */
export function resetEconomyCache(): void {
  cache.clear();
  inflight.clear();
}

function cacheGet(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt >= CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
    cache.clear();
  }
  cache.set(key, entry);
}

// ---------------------------------------------------------------------------
// Routing + URL builders
// ---------------------------------------------------------------------------

function pathFor(type: string): Path {
  return CURRENCY_TYPES.has(type) ? "currency" : "item";
}

function overviewUrl(path: Path, league: string, type: string): string {
  return `${BASE}/api/economy/stash/${VERSION}/${path}/overview?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`;
}

function indexStateUrl(): string {
  return `${BASE}/api/data/index-state`;
}

function overviewCacheKey(path: Path, league: string, type: string): string {
  return `overview:${path}:${league}:${type}`;
}

// ---------------------------------------------------------------------------
// Fetch helpers (singleflight on top of cacheGet)
// ---------------------------------------------------------------------------

async function fetchOverview(
  path: Path,
  league: string,
  type: string,
): Promise<CachedOverview | null> {
  const key = overviewCacheKey(path, league, type);
  const existing = cacheGet(key);
  if (existing && existing.kind === "overview") return existing;

  let promise = inflight.get(key);
  if (!promise) {
    promise = (async (): Promise<CacheEntry | null> => {
      const url = overviewUrl(path, league, type);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const fetchedAt = Date.now();
      if (path === "currency") {
        const body = (await response.json()) as PoeNinjaCurrencyResponse;
        return {
          kind: "overview",
          path,
          currencyLines: body.lines,
          fetchedAt,
        };
      }
      const body = (await response.json()) as PoeNinjaItemResponse;
      return {
        kind: "overview",
        path,
        itemLines: body.lines,
        fetchedAt,
      };
    })();
    inflight.set(key, promise);
  }

  let result: CacheEntry | null;
  try {
    result = await promise;
  } finally {
    inflight.delete(key);
  }
  if (!result || result.kind !== "overview") return null;
  cacheSet(key, result);
  return result;
}

async function fetchIndexState(): Promise<IndexState | null> {
  const existing = cacheGet(INDEX_STATE_CACHE_KEY);
  if (existing && existing.kind === "index-state") return existing.state;

  let promise = inflight.get(INDEX_STATE_CACHE_KEY);
  if (!promise) {
    promise = (async (): Promise<CacheEntry | null> => {
      const response = await fetch(indexStateUrl(), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const state = (await response.json()) as IndexState;
      return { kind: "index-state", state, fetchedAt: Date.now() };
    })();
    inflight.set(INDEX_STATE_CACHE_KEY, promise);
  }

  let result: CacheEntry | null;
  try {
    result = await promise;
  } finally {
    inflight.delete(INDEX_STATE_CACHE_KEY);
  }
  if (!result || result.kind !== "index-state") return null;
  cacheSet(INDEX_STATE_CACHE_KEY, result);
  return result.state;
}

// ---------------------------------------------------------------------------
// League resolution
// ---------------------------------------------------------------------------

type LeagueResolution =
  | { readonly ok: true; readonly league: string }
  | { readonly ok: false; readonly message: string };

async function resolveLeague(supplied: string | undefined): Promise<LeagueResolution> {
  let state: IndexState | null;
  try {
    state = await fetchIndexState();
  } catch {
    state = null;
  }

  if (!state || state.economyLeagues.length === 0) {
    if (supplied) {
      // Caller specified one; trust it. We can't validate without index-state,
      // but a bad league name will surface as an empty overview response.
      return { ok: true, league: supplied };
    }
    return {
      ok: false,
      message:
        "Could not auto-detect the current Path of Exile league. Specify a league explicitly (for example, league='Standard').",
    };
  }

  if (!supplied) {
    return { ok: true, league: state.economyLeagues[0]!.name };
  }

  const valid = [
    ...state.economyLeagues,
    ...(state.oldEconomyLeagues ?? []),
  ];
  if (valid.some((l) => l.name === supplied)) {
    return { ok: true, league: supplied };
  }

  const current = state.economyLeagues.map((l) => l.name).join(", ");
  const old = (state.oldEconomyLeagues ?? []).map((l) => l.name).join(", ");
  const oldClause = old ? ` Recent past leagues: ${old}.` : "";
  return {
    ok: false,
    message: `Unknown league '${supplied}'. Current leagues: ${current}.${oldClause}`,
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeSparkline(
  data: ReadonlyArray<number | null> | undefined,
): readonly number[] {
  if (!data) return [];
  return data.map((v) => v ?? 0);
}

function confidenceFromCount(n: number | undefined): "high" | "low" {
  return (n ?? 0) > 10 ? "high" : "low";
}

function modTexts(
  mods: ReadonlyArray<PoeNinjaModifier> | undefined,
): string[] {
  return (mods ?? []).map((m) => m.text);
}

function normalizeItem(
  line: PoeNinjaItemLine,
  type: string,
): Record<string, unknown> {
  const implicit = modTexts(line.implicitModifiers);
  const explicit = modTexts(line.explicitModifiers);
  const mutated = modTexts(line.mutatedModifiers);
  const flavour = line.flavourText;
  const hasMods =
    implicit.length > 0 ||
    explicit.length > 0 ||
    mutated.length > 0 ||
    typeof flavour === "string";
  return {
    name: line.name,
    type,
    base_type: line.baseType ?? null,
    chaos_value: line.chaosValue,
    divine_value: line.divineValue,
    confidence: confidenceFromCount(line.listingCount),
    sparkline: normalizeSparkline(line.sparkLine?.data),
    change_7d: line.sparkLine?.totalChange ?? null,
    icon_url: line.icon,
    listings: line.listingCount ?? 0,
    level_required: line.levelRequired,
    mods: hasMods
      ? { implicit, explicit, mutated, flavour }
      : undefined,
  };
}

function normalizeCurrency(
  line: PoeNinjaCurrencyLine,
  type: string,
): Record<string, unknown> {
  const receive = line.receive;
  return {
    name: line.currencyTypeName,
    type,
    base_type: null,
    chaos_value: line.chaosEquivalent ?? receive?.value ?? 0,
    divine_value: undefined,
    confidence: confidenceFromCount(receive?.count),
    sparkline: normalizeSparkline(line.receiveSparkLine?.data),
    change_7d: line.receiveSparkLine?.totalChange ?? null,
    icon_url: undefined,
    listings: receive?.listing_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const economyModule: NativeReferenceModule = {
  id: "economy",
  name: "Economy Prices",
  description: [
    "Look up current Path of Exile item prices from poe.ninja.",
    "USE PROACTIVELY: query this module when discussing item value, trade decisions,",
    "upgrade budgets, or farming strategies. Returns chaos and divine orb values,",
    "7-day price trends, and listing confidence.",
  ].join(" "),
  parameters: {
    query: {
      type: "string",
      description:
        "Item name to search for (case-insensitive substring match). Example: 'Headhunter'",
    },
    type: {
      type: "string",
      description: `poe.ninja item type: UniqueWeapon, UniqueArmour, UniqueAccessory, UniqueFlask, UniqueJewel, SkillGem, Currency, Fragment, DivinationCard, Oil, Fossil, Essence, Scarab, etc. Default: '${DEFAULT_TYPE}'.`,
    },
    league: {
      type: "string",
      description:
        "League name. Defaults to the current Path of Exile 1 league (auto-detected).",
    },
  },

  async execute(
    query: Record<string, unknown>,
    _env: Env,
  ): Promise<ReferenceResult> {
    const searchQuery =
      typeof query.query === "string" ? query.query.trim() : undefined;
    const type =
      typeof query.type === "string" && query.type.trim().length > 0
        ? query.type.trim()
        : DEFAULT_TYPE;
    const suppliedLeague =
      typeof query.league === "string" && query.league.trim().length > 0
        ? query.league.trim()
        : undefined;

    if (!searchQuery) {
      return {
        type: "text",
        content:
          "Provide a query parameter with the item name to search for. Optional: type (poe.ninja item type), league (defaults to current league).",
      };
    }

    const resolution = await resolveLeague(suppliedLeague);
    if (!resolution.ok) {
      return { type: "text", content: resolution.message };
    }
    const league = resolution.league;
    const path = pathFor(type);

    let overview: CachedOverview | null;
    try {
      overview = await fetchOverview(path, league, type);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      return {
        type: "text",
        content: `poe.ninja is currently unavailable: ${msg}. Try again later.`,
      };
    }

    if (!overview) {
      return {
        type: "text",
        content: `poe.ninja returned an error for type '${type}' in league '${league}'. Check that the type and league names are correct.`,
      };
    }

    const queryLower = searchQuery.toLowerCase();
    let items: Record<string, unknown>[];
    if (overview.path === "currency") {
      items = (overview.currencyLines ?? [])
        .filter((line) =>
          line.currencyTypeName.toLowerCase().includes(queryLower),
        )
        .map((line) => normalizeCurrency(line, type));
    } else {
      items = (overview.itemLines ?? [])
        .filter((line) => line.name.toLowerCase().includes(queryLower))
        .map((line) => normalizeItem(line, type));
    }

    return {
      type: "structured",
      data: {
        query: searchQuery,
        league,
        type,
        items,
        count: items.length,
      },
    };
  },
};
