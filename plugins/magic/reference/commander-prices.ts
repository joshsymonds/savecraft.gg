/**
 * Shared price-resolution helper for the commander_* modules.
 *
 * Resolves a set of card names to (price, reserved, priced_at) tuples by
 * querying:
 *   1. magic_edh_card_prices (EDHREC TCGPlayer mid, M1.2)
 *   2. magic_cards (Scryfall default-printing fallback, M1.1)
 *
 * Precedence: EDHREC overrides Scryfall when both have a price, since EDHREC
 * is what users see on EDHREC. Reserved-list flag comes from Scryfall (EDHREC
 * doesn't carry it). priced_at comes from EDHREC (Scryfall has no per-row
 * timestamp).
 *
 * D1 has a 100-bind-parameter limit per prepared statement. We chunk inputs
 * into batches of CHUNK_SIZE so user inputs (decklists, must_include lists,
 * tier decks > 90 names) don't hit the wall.
 *
 * Returned Map keys are lowercase to absorb case variance from user-supplied
 * decklists ("sol ring" vs "Sol Ring"). Callers should `name.toLowerCase()`
 * when looking up.
 */

import type { Env } from "../../../worker/src/types";

const CHUNK_SIZE = 90; // leaves headroom under the 100-bind ceiling

export interface ResolvedPrice {
  price: number | null;
  reserved: boolean;
}

interface EdhPriceRow {
  card_name: string;
  price_usd: number | null;
  priced_at: string | null;
}

interface ScryPriceRow {
  card_name: string;
  price_usd: number | null;
  reserved: number;
}

export interface PriceLookupResult {
  /** Map<lowercase card name, ResolvedPrice>. Cards with no source have entries with both fields null/false. */
  prices: Map<string, ResolvedPrice>;
  /** Most-recent priced_at across the EDHREC matches; null when no EDHREC rows matched. */
  pricedAt: string | null;
}

/**
 * Resolve prices for a set of card names. Chunks the input to fit D1's
 * 100-bind ceiling, fans out queries in parallel, and merges results.
 */
export async function resolveCardPrices(
  env: Env,
  names: string[],
): Promise<PriceLookupResult> {
  const result: PriceLookupResult = {
    prices: new Map(),
    pricedAt: null,
  };
  if (names.length === 0) return result;

  // Dedupe before binding to avoid wasted bind slots on repeats.
  const uniqueNames = [...new Set(names)];
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueNames.length; i += CHUNK_SIZE) {
    chunks.push(uniqueNames.slice(i, i + CHUNK_SIZE));
  }

  // Two queries per chunk — EDHREC + Scryfall — fanned out in parallel.
  const queries = chunks.flatMap((chunk) => {
    const placeholders = chunk.map(() => "?").join(",");
    return [
      env.DB
        .prepare(
          `SELECT card_name, tcgplayer_price AS price_usd, priced_at
           FROM magic_edh_card_prices
           WHERE card_name IN (${placeholders})`,
        )
        .bind(...chunk)
        .all<EdhPriceRow>(),
      env.DB
        .prepare(
          `SELECT name AS card_name, price_usd, reserved
           FROM magic_cards
           WHERE is_default = 1 AND name IN (${placeholders})`,
        )
        .bind(...chunk)
        .all<ScryPriceRow>(),
    ];
  });
  const all = await Promise.all(queries);

  // Even-indexed batches are EDHREC results, odd are Scryfall.
  let mostRecent: string | null = null;
  // Apply Scryfall first so EDHREC overrides where both have prices.
  for (let i = 1; i < all.length; i += 2) {
    for (const row of all[i]!.results ?? []) {
      const r = row as ScryPriceRow;
      result.prices.set(r.card_name.toLowerCase(), {
        price: r.price_usd,
        reserved: r.reserved === 1,
      });
    }
  }
  for (let i = 0; i < all.length; i += 2) {
    for (const row of all[i]!.results ?? []) {
      const r = row as EdhPriceRow;
      const lower = r.card_name.toLowerCase();
      if (r.price_usd != null) {
        const existing = result.prices.get(lower);
        result.prices.set(lower, {
          price: r.price_usd,
          reserved: existing?.reserved ?? false,
        });
      }
      if (r.priced_at != null && (mostRecent == null || r.priced_at > mostRecent)) {
        mostRecent = r.priced_at;
      }
    }
  }
  result.pricedAt = mostRecent;
  return result;
}

/**
 * Resolve which of the given names are on the WotC Game Changers list.
 * Chunks the input to fit D1's 100-bind ceiling. Returns the matching
 * names verbatim (whatever casing magic_game_changers stores).
 */
export async function resolveGameChangers(
  env: Env,
  names: string[],
): Promise<string[]> {
  if (names.length === 0) return [];
  const uniqueNames = [...new Set(names)];
  const out: string[] = [];
  for (let i = 0; i < uniqueNames.length; i += CHUNK_SIZE) {
    const chunk = uniqueNames.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const result = await env.DB
      .prepare(
        `SELECT card_name FROM magic_game_changers
         WHERE card_name IN (${placeholders})`,
      )
      .bind(...chunk)
      .all<{ card_name: string }>();
    for (const row of result.results ?? []) {
      out.push(row.card_name);
    }
  }
  return out;
}
