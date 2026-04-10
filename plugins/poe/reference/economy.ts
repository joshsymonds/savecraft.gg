/**
 * PoE economy — native reference module.
 *
 * Live price data from poe.ninja with per-isolate in-memory caching (~1hr TTL).
 * No D1 access — fetches directly from the poe.ninja API.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";

// ---------------------------------------------------------------------------
// poe.ninja response types
// ---------------------------------------------------------------------------

interface PoeNinjaLine {
  readonly name: string;
  readonly chaosValue: number;
  readonly divineValue: number;
  readonly detailsId: string;
  readonly icon: string;
  readonly baseType?: string;
  readonly sparkline?: { readonly data: ReadonlyArray<number | null> };
  readonly lowConfidenceSparkline?: { readonly data: ReadonlyArray<number | null> };
  readonly listingCount?: number;
}

interface PoeNinjaResponse {
  readonly lines: readonly PoeNinjaLine[];
}

// ---------------------------------------------------------------------------
// Per-isolate cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedPriceData {
  readonly lines: readonly PoeNinjaLine[];
  readonly fetchedAt: number;
}

const MAX_CACHE_ENTRIES = 50;
const priceCache = new Map<string, CachedPriceData>();
/** Singleflight: in-flight fetch promises to deduplicate concurrent requests. */
const inflightFetches = new Map<string, Promise<CachedPriceData | null>>();

/** Clear cache (for tests). */
export function resetEconomyCache(): void {
  priceCache.clear();
  inflightFetches.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_TYPE = "UniqueArmour";
const DEFAULT_LEAGUE = "Settlers";

function computeChange7d(
  sparkline: ReadonlyArray<number | null> | undefined,
): number | null {
  if (!sparkline || sparkline.length === 0) return null;
  const last = sparkline[sparkline.length - 1];
  return last ?? null;
}

function normalizeSparkline(
  sparkline: ReadonlyArray<number | null> | undefined,
): readonly number[] {
  if (!sparkline) return [];
  return sparkline.map((v) => v ?? 0);
}

function lineToResult(
  line: PoeNinjaLine,
  type: string,
): Record<string, unknown> {
  const listingCount = line.listingCount ?? 0;
  return {
    name: line.name,
    type,
    base_type: line.baseType ?? null,
    chaos_value: line.chaosValue,
    divine_value: line.divineValue,
    confidence: listingCount > 10 ? "high" : "low",
    sparkline: normalizeSparkline(line.sparkline?.data),
    change_7d: computeChange7d(line.sparkline?.data),
    icon_url: line.icon,
    listings: listingCount,
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
      description: `poe.ninja item type: UniqueWeapon, UniqueArmour, UniqueAccessory, UniqueFlask, UniqueJewel, SkillGem, Currency, DivinationCard, etc. Default: '${DEFAULT_TYPE}'.`,
    },
    league: {
      type: "string",
      description: `League name. Default: '${DEFAULT_LEAGUE}'.`,
    },
  },

  async execute(
    query: Record<string, unknown>,
    _env: Env,
  ): Promise<ReferenceResult> {
    const searchQuery =
      typeof query.query === "string" ? query.query.trim() : undefined;
    const type =
      typeof query.type === "string" ? query.type.trim() : DEFAULT_TYPE;
    const league =
      typeof query.league === "string" ? query.league.trim() : DEFAULT_LEAGUE;

    if (!searchQuery) {
      return {
        type: "text",
        content:
          "Provide a query parameter with the item name to search for. Optional: type (poe.ninja item type), league.",
      };
    }

    const cacheKey = `${type}:${league}`;
    const now = Date.now();
    let cached = priceCache.get(cacheKey);

    // Fetch if cache miss or expired
    if (!cached || now - cached.fetchedAt >= CACHE_TTL_MS) {
      // Singleflight: reuse in-flight fetch for the same key
      let fetchPromise = inflightFetches.get(cacheKey);
      if (!fetchPromise) {
        fetchPromise = (async (): Promise<CachedPriceData | null> => {
          const url = `https://poe.ninja/api/data/itemoverview?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`;
          const response = await fetch(url, {
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) return null;
          const body = (await response.json()) as PoeNinjaResponse;
          return { lines: body.lines, fetchedAt: Date.now() };
        })();
        inflightFetches.set(cacheKey, fetchPromise);
      }

      let result: CachedPriceData | null;
      try {
        result = await fetchPromise;
      } catch (e) {
        inflightFetches.delete(cacheKey);
        return {
          type: "text",
          content: `poe.ninja is currently unavailable: ${e instanceof Error ? e.message : "unknown error"}. Try again later.`,
        };
      } finally {
        inflightFetches.delete(cacheKey);
      }

      if (!result) {
        return {
          type: "text",
          content: `poe.ninja returned an error for type '${type}' in league '${league}'. Check that the type and league names are correct.`,
        };
      }

      cached = result;
      // Bound cache size
      if (priceCache.size >= MAX_CACHE_ENTRIES) {
        priceCache.clear();
      }
      priceCache.set(cacheKey, cached);
    }

    // Filter by case-insensitive substring match on name
    const queryLower = searchQuery.toLowerCase();
    const matches = cached.lines.filter((line) =>
      line.name.toLowerCase().includes(queryLower),
    );

    return {
      type: "structured",
      data: {
        query: searchQuery,
        league,
        type,
        items: matches.map((line) => lineToResult(line, type)),
        count: matches.length,
      },
    };
  },
};
