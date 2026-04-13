/**
 * Shared commander resolution for EDH reference modules.
 *
 * Looks up a commander by name with a fuzzy fallback chain:
 *   1. Exact (case-insensitive) name match
 *   2. FTS5 prefix match on magic_edh_commanders_fts
 *   3. LIKE substring match
 *
 * Returns the full commander row or null if nothing matches.
 */

import { fts5Safe } from "../../../worker/src/reference/fts5";
import type { Env } from "../../../worker/src/types";

export interface EdhCommanderRow {
  scryfall_id: string;
  name: string;
  slug: string;
  color_identity: string;
  deck_count: number;
  themes: string;
  similar: string;
  rank: number | null;
  salt: number | null;
}

const SELECT_FIELDS =
  "scryfall_id, name, slug, color_identity, deck_count, themes, similar, rank, salt";

export async function resolveCommander(
  env: Env,
  query: string,
): Promise<EdhCommanderRow | null> {
  // 1. Exact name (case-insensitive)
  const exact = await env.DB.prepare(
    `SELECT ${SELECT_FIELDS}
     FROM magic_edh_commanders
     WHERE lower(name) = lower(?)
     LIMIT 1`,
  )
    .bind(query)
    .first<EdhCommanderRow>();
  if (exact) return exact;

  // 2. FTS5 prefix match — turn `fts5Safe(query)` (`"query"`) into `"query*"`
  // by slicing off the closing quote and re-closing with `*"`. This gives
  // FTS5 prefix semantics on the last token so partial names resolve.
  const match = fts5Safe(query).slice(0, -1) + '*"';
  const fts = await env.DB.prepare(
    `SELECT c.scryfall_id, c.name, c.slug, c.color_identity, c.deck_count, c.themes, c.similar, c.rank, c.salt
     FROM magic_edh_commanders_fts f
     JOIN magic_edh_commanders c ON c.scryfall_id = f.scryfall_id
     WHERE f.name MATCH ?
     ORDER BY c.deck_count DESC
     LIMIT 1`,
  )
    .bind(match)
    .first<EdhCommanderRow>();
  if (fts) return fts;

  // 3. LIKE substring fallback — catches mid-string matches FTS prefix misses.
  return env.DB.prepare(
    `SELECT ${SELECT_FIELDS}
     FROM magic_edh_commanders
     WHERE name LIKE ?
     ORDER BY deck_count DESC
     LIMIT 1`,
  )
    .bind(`%${query}%`)
    .first<EdhCommanderRow>();
}
