/**
 * Economy pricing cache harness shared by native reference modules that
 * front an external price API (poe.ninja for both `poe` and `poe2`) with
 * per-isolate in-memory caching, singleflight, and negative caching.
 *
 * A single shared module-level cache would collide callers that reuse the
 * same cache key across games (e.g. both PoE economy modules cache their
 * league-index-state fetch under the same key) — so this exports a
 * `createEconomyCache()` factory. Each plugin module creates its own
 * instance at module scope, giving it dedicated `cache`/`inflight` maps.
 *
 * Generic over the plugin's own positive cache-entry type(s) (e.g. a
 * `CachedOverview | CachedIndexState` union) — the negative-cache failure
 * sentinel is an implementation detail of this harness and never escapes it.
 * Entries are stored as a single named `CacheSlot<T>` (rather than a raw
 * `T | Failure` union) so every cache/lookup function has one concrete
 * return shape regardless of what `T` resolves to at each call site.
 */

export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Short TTL for cached upstream failures so a misbehaving league/type
 *  doesn't keep slamming the upstream API while every LLM caller retries. */
export const FAILURE_TTL_MS = 60 * 1000; // 1 minute
export const MAX_CACHE_ENTRIES = 50;
export const FETCH_TIMEOUT_MS = 10_000;
export const INDEX_STATE_CACHE_KEY = "index-state";

/** Nominal sentinel for a cached upstream failure. A unique symbol (rather
 *  than a string discriminant like `kind`) guarantees it can never collide
 *  with a caller's own entry shape, however that shape is defined. */
const FAILURE: unique symbol = Symbol("economy-cache-failure");

interface CacheSlot<T> {
  readonly value: T | typeof FAILURE;
  readonly fetchedAt: number;
}

export interface EconomyCache<T> {
  /**
   * Cache + singleflight + negative-cache wrapper around an upstream fetch.
   * `fetcher` returns a positive cache entry on success, or `null` on a
   * documented upstream failure — null gets cached as a short-TTL failure
   * sentinel. Network errors thrown by `fetcher` propagate uncached so
   * transient blips can retry immediately.
   */
  cachedFetch<U extends T>(key: string, fetcher: () => Promise<U | null>): Promise<U | null>;
  /** Clear all caches. Test helper. */
  reset(): void;
}

/** Create a new, independently-owned economy cache instance. */
export function createEconomyCache<T>(): EconomyCache<T> {
  const cache = new Map<string, CacheSlot<T>>();
  /** Singleflight: in-flight fetches deduplicated by cache key. */
  const inflight = new Map<string, Promise<CacheSlot<T>>>();

  function cacheGet(key: string): CacheSlot<T> | undefined {
    const slot = cache.get(key);
    if (!slot) return undefined;
    const ttl = slot.value === FAILURE ? FAILURE_TTL_MS : CACHE_TTL_MS;
    if (Date.now() - slot.fetchedAt >= ttl) {
      cache.delete(key);
      return undefined;
    }
    return slot;
  }

  function cacheSet(key: string, slot: CacheSlot<T>): void {
    if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
      // FIFO-evict the oldest entry. Skip INDEX_STATE_CACHE_KEY since every
      // league-resolution path depends on it; losing it stampedes that fetch.
      for (const k of cache.keys()) {
        if (k === INDEX_STATE_CACHE_KEY) continue;
        cache.delete(k);
        break;
      }
    }
    cache.set(key, slot);
  }

  async function cachedFetch<U extends T>(
    key: string,
    fetcher: () => Promise<U | null>,
  ): Promise<U | null> {
    const existing = cacheGet(key);
    if (existing) {
      return existing.value === FAILURE ? null : (existing.value as U);
    }

    let promise = inflight.get(key);
    if (!promise) {
      promise = (async (): Promise<CacheSlot<T>> => {
        const result = await fetcher();
        return { value: result ?? FAILURE, fetchedAt: Date.now() };
      })();
      inflight.set(key, promise);
    }

    let slot: CacheSlot<T>;
    try {
      slot = await promise;
    } finally {
      inflight.delete(key);
    }
    cacheSet(key, slot);
    return slot.value === FAILURE ? null : (slot.value as U);
  }

  function reset(): void {
    cache.clear();
    inflight.clear();
  }

  return { cachedFetch, reset };
}
