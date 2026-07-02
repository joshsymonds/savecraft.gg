/**
 * PoE2 economy — native reference module.
 *
 * Live price data from poe.ninja's /poe2 API with per-isolate in-memory
 * caching (~1hr TTL). No D1 access — fetches directly. League is
 * auto-detected via /poe2/api/data/index-state when callers omit it.
 *
 * poe.ninja's PoE2 economy API is undocumented and has already changed
 * shape once (the classic poe.ninja /api/data/* endpoints, and the older
 * /poe2/api/economy/currencyexchange/overview shape, are both dead). Every
 * response is validated against its expected contract before use — a shape
 * mismatch or fetch failure degrades to a clear "unavailable" result, never
 * partial or garbage prices, and never an unhandled throw.
 *
 * PoE2 splits pricing across two endpoint families with different `type`
 * vocabularies: "exchange" (currency-like, singular type names) and
 * "stash" (unique/stash items, plural type names). Both response shapes
 * are unified here as `{ core: { primary, ... }, lines: [...] }` — prices
 * are always denominated in `core.primary` (divine), which is surfaced
 * verbatim on every result rather than hardcoded.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE = "https://poe.ninja/poe2";
const VERSION = "current";

/** Exchange (currency-like) endpoint types. */
const EXCHANGE_TYPES = new Set<string>([
  "Currency",
  "Fragments",
  "Abyss",
  "UncutGems",
  "LineageSupportGems",
  "Essences",
  "SoulCores",
  "Idols",
  "Runes",
  "Ritual",
  "Expedition",
  "Delirium",
  "Breach",
  "Verisium",
]);

/** Stash (unique/item) endpoint types — note the plural naming. */
const STASH_TYPES = new Set<string>([
  "UniqueWeapons",
  "UniqueArmours",
  "UniqueAccessories",
  "UniqueFlasks",
  "UniqueCharms",
  "UniqueJewels",
  "UniqueSanctumRelics",
  "UniqueTablets",
  "PrecursorTablets",
]);

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Short TTL for cached upstream failures so a misbehaving league/type
 *  doesn't keep slamming poe.ninja while every LLM caller retries. */
const FAILURE_TTL_MS = 60 * 1000; // 1 minute
const MAX_CACHE_ENTRIES = 50;
const FETCH_TIMEOUT_MS = 10_000;
const INDEX_STATE_CACHE_KEY = "index-state";

/** The one crisp failure mode for any contract mismatch or fetch failure —
 *  never a partial result, never a leaked implementation detail. */
const UNAVAILABLE_MESSAGE =
  "Path of Exile 2 economy data unavailable (poe.ninja's API changed or is unreachable). Try again later.";

// ---------------------------------------------------------------------------
// poe.ninja (PoE2) response types
// ---------------------------------------------------------------------------

interface Sparkline {
  readonly totalChange?: number;
  readonly data?: ReadonlyArray<number | null>;
}

interface OverviewLine {
  readonly id?: string;
  readonly name?: string;
  readonly primaryValue: number;
  readonly sparkline?: Sparkline;
}

interface OverviewCore {
  readonly primary: string;
  readonly secondary?: string;
}

interface OverviewResponse {
  readonly core: OverviewCore;
  readonly lines: readonly OverviewLine[];
}

interface IndexStateLeague {
  readonly name: string;
}

interface IndexState {
  readonly economyLeagues: readonly IndexStateLeague[];
  readonly oldEconomyLeagues?: readonly IndexStateLeague[];
}

// ---------------------------------------------------------------------------
// Contract validation — the epic's named defense against poe.ninja's
// undocumented, previously-shifted API shape. Never trust a response body
// past its declared type; validate before use.
// ---------------------------------------------------------------------------

function isValidIndexStateLeague(v: unknown): v is IndexStateLeague {
  return !!v && typeof v === "object" && typeof (v as Record<string, unknown>).name === "string";
}

function isValidIndexState(v: unknown): v is IndexState {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  if (!Array.isArray(obj.economyLeagues)) return false;
  if (!obj.economyLeagues.every(isValidIndexStateLeague)) return false;
  if (obj.oldEconomyLeagues !== undefined) {
    if (!Array.isArray(obj.oldEconomyLeagues)) return false;
    if (!obj.oldEconomyLeagues.every(isValidIndexStateLeague)) return false;
  }
  return true;
}

function isValidOverviewLine(v: unknown): v is OverviewLine {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  const hasIdentity = typeof obj.id === "string" || typeof obj.name === "string";
  return hasIdentity && typeof obj.primaryValue === "number";
}

function isValidOverview(v: unknown): v is OverviewResponse {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  const core = obj.core;
  if (!core || typeof core !== "object") return false;
  if (typeof (core as Record<string, unknown>).primary !== "string") return false;
  if (!Array.isArray(obj.lines)) return false;
  return obj.lines.every(isValidOverviewLine);
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

type Family = "exchange" | "stash";

interface CachedOverview {
  readonly kind: "overview";
  readonly family: Family;
  readonly core: OverviewCore;
  readonly lines: readonly OverviewLine[];
  readonly fetchedAt: number;
}

interface CachedIndexState {
  readonly kind: "index-state";
  readonly state: IndexState;
  readonly fetchedAt: number;
}

/** Sentinel for upstream non-OK responses or contract mismatches. Prevents
 *  thundering herd against poe.ninja while LLM callers retry the same bad
 *  league/type combo (or while poe.ninja is serving a shifted shape). */
interface CachedFailure {
  readonly kind: "failure";
  readonly fetchedAt: number;
}

type CacheEntry = CachedOverview | CachedIndexState | CachedFailure;

const cache = new Map<string, CacheEntry>();
/** Singleflight: in-flight fetches deduplicated by cache key. */
const inflight = new Map<string, Promise<CacheEntry>>();

/** Clear all caches. Test helper. */
export function resetEconomyCache(): void {
  cache.clear();
  inflight.clear();
}

function cacheGet(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  const ttl = entry.kind === "failure" ? FAILURE_TTL_MS : CACHE_TTL_MS;
  if (Date.now() - entry.fetchedAt >= ttl) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
    // FIFO-evict the oldest entry. Skip INDEX_STATE_CACHE_KEY since every
    // league-resolution path depends on it; losing it stampedes that fetch.
    for (const k of cache.keys()) {
      if (k === INDEX_STATE_CACHE_KEY) continue;
      cache.delete(k);
      break;
    }
  }
  cache.set(key, entry);
}

/**
 * Cache + singleflight + negative-cache wrapper around an upstream fetch.
 * `fetcher` returns a positive cache entry on success, or `null` on a
 * documented upstream failure (non-OK response, or a response that fails
 * contract validation) — null gets cached as a short-TTL failure sentinel.
 * Network errors thrown by `fetch` propagate uncached so transient blips
 * can retry immediately.
 */
async function cachedFetch<T extends CachedOverview | CachedIndexState>(
  key: string,
  fetcher: () => Promise<T | null>,
): Promise<T | null> {
  const existing = cacheGet(key);
  if (existing) {
    if (existing.kind === "failure") return null;
    return existing as T;
  }

  let promise = inflight.get(key);
  if (!promise) {
    promise = (async (): Promise<CacheEntry> => {
      const result = await fetcher();
      return result ?? { kind: "failure", fetchedAt: Date.now() };
    })();
    inflight.set(key, promise);
  }

  let result: CacheEntry;
  try {
    result = await promise;
  } finally {
    inflight.delete(key);
  }
  cacheSet(key, result);
  return result.kind === "failure" ? null : (result as T);
}

// ---------------------------------------------------------------------------
// Routing + URL builders
// ---------------------------------------------------------------------------

function familyFor(type: string): Family | undefined {
  if (EXCHANGE_TYPES.has(type)) return "exchange";
  if (STASH_TYPES.has(type)) return "stash";
  return undefined;
}

function overviewUrl(family: Family, league: string, type: string): string {
  const path =
    family === "exchange"
      ? `economy/exchange/${VERSION}/overview`
      : `economy/stash/${VERSION}/item/overview`;
  return `${BASE}/api/${path}?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`;
}

function indexStateUrl(): string {
  return `${BASE}/api/data/index-state`;
}

function overviewCacheKey(family: Family, league: string, type: string): string {
  return `overview:${family}:${league}:${type}`;
}

function validTypesMessage(): string {
  return [
    `Valid exchange types: ${[...EXCHANGE_TYPES].join(", ")}.`,
    `Valid stash (unique item) types: ${[...STASH_TYPES].join(", ")}.`,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Fetch helpers (singleflight + contract validation on top of cacheGet)
// ---------------------------------------------------------------------------

function fetchOverview(
  family: Family,
  league: string,
  type: string,
): Promise<CachedOverview | null> {
  return cachedFetch<CachedOverview>(overviewCacheKey(family, league, type), async () => {
    const response = await fetch(overviewUrl(family, league, type), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!isValidOverview(body)) return null;
    return {
      kind: "overview",
      family,
      core: body.core,
      lines: body.lines,
      fetchedAt: Date.now(),
    };
  });
}

async function fetchIndexState(): Promise<IndexState | null> {
  const cached = await cachedFetch<CachedIndexState>(INDEX_STATE_CACHE_KEY, async () => {
    const response = await fetch(indexStateUrl(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!isValidIndexState(body)) return null;
    return { kind: "index-state", state: body, fetchedAt: Date.now() };
  });
  return cached?.state ?? null;
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

  if (!state) {
    if (supplied) {
      // Caller specified one; trust it. We can't validate without
      // index-state, but a bad league name will surface as an empty
      // overview response.
      return { ok: true, league: supplied };
    }
    return { ok: false, message: UNAVAILABLE_MESSAGE };
  }

  if (!supplied) {
    if (state.economyLeagues.length === 0) {
      return { ok: false, message: UNAVAILABLE_MESSAGE };
    }
    return { ok: true, league: state.economyLeagues[0]!.name };
  }

  const valid = [...state.economyLeagues, ...(state.oldEconomyLeagues ?? [])];
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

function normalizeSparkline(data: ReadonlyArray<number | null> | undefined): readonly number[] {
  if (!data) return [];
  return data.map((v) => v ?? 0);
}

function normalizeLine(
  line: OverviewLine,
  type: string,
  denomination: string,
): Record<string, unknown> {
  return {
    name: line.name ?? line.id,
    type,
    price: line.primaryValue,
    denomination,
    sparkline: normalizeSparkline(line.sparkline?.data),
    change_7d: line.sparkline?.totalChange ?? null,
  };
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const economyModule: NativeReferenceModule = {
  id: "economy",
  name: "Economy Prices",
  description: [
    "Look up current Path of Exile 2 item and currency prices from poe.ninja.",
    "USE PROACTIVELY: query this module when discussing item value, trade decisions,",
    "upgrade budgets, or farming strategies. Prices are always denominated in",
    "poe.ninja's primary currency (divine orbs) and every result is labeled with",
    "that denomination and the league it was pulled from.",
  ].join(" "),
  parameters: {
    query: {
      type: "string",
      description:
        "Item or currency name to search for (case-insensitive substring match). Example: 'Divine Orb'",
    },
    type: {
      type: "string",
      description: `poe.ninja PoE2 type — required. ${validTypesMessage()}`,
    },
    league: {
      type: "string",
      description:
        "League name (case-sensitive). Defaults to the current Path of Exile 2 league (auto-detected).",
    },
  },

  async execute(query: Record<string, unknown>, _env: Env): Promise<ReferenceResult> {
    const searchQuery = typeof query.query === "string" ? query.query.trim() : undefined;
    const typeRaw =
      typeof query.type === "string" && query.type.trim().length > 0
        ? query.type.trim()
        : undefined;
    const suppliedLeague =
      typeof query.league === "string" && query.league.trim().length > 0
        ? query.league.trim()
        : undefined;

    if (!searchQuery) {
      return {
        type: "text",
        content:
          "Provide a query parameter with the item or currency name to search for. Also required: type. " +
          validTypesMessage(),
      };
    }

    if (!typeRaw) {
      return {
        type: "text",
        content: `Provide a type parameter. ${validTypesMessage()}`,
      };
    }

    const family = familyFor(typeRaw);
    if (!family) {
      return {
        type: "text",
        content: `Unknown type '${typeRaw}'. ${validTypesMessage()}`,
      };
    }

    const resolution = await resolveLeague(suppliedLeague);
    if (!resolution.ok) {
      return { type: "text", content: resolution.message };
    }
    const league = resolution.league;

    let overview: CachedOverview | null;
    try {
      overview = await fetchOverview(family, league, typeRaw);
    } catch {
      return { type: "text", content: UNAVAILABLE_MESSAGE };
    }

    if (!overview) {
      return { type: "text", content: UNAVAILABLE_MESSAGE };
    }

    const denomination = overview.core.primary;
    const queryLower = searchQuery.toLowerCase();
    const items = overview.lines
      .filter((line) => (line.name ?? line.id ?? "").toLowerCase().includes(queryLower))
      .map((line) => normalizeLine(line, typeRaw, denomination));

    return {
      type: "structured",
      data: {
        query: searchQuery,
        league,
        type: typeRaw,
        denomination,
        items,
        count: items.length,
      },
    };
  },
};
