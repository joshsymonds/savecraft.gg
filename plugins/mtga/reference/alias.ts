/**
 * Shared alias resolution for magic_card_aliases.
 *
 * Two-pass pattern: callers first query by front_face_name COLLATE NOCASE.
 * For unresolved names, resolveAliases looks up magic_card_aliases → oracle_id
 * → default printing in magic_cards.
 */

import { placeholders } from "./scoring";

const ALIAS_BATCH_SIZE = 50;

/**
 * For a list of unresolved card names, look up magic_card_aliases to find
 * their oracle_ids, then return the default printing rows for those oracle_ids.
 *
 * Returns a Map from lowercase alias name → row (with the selected columns).
 * The caller specifies which columns to SELECT from magic_cards.
 *
 * @internal Only called by reference modules with hardcoded column strings.
 * SAFETY: `columns` is interpolated into SQL — it must be a hardcoded string
 * literal, never user input.
 */
export async function resolveAliases<T extends { name: string }>(
  db: D1Database,
  unresolvedNames: string[],
  columns: string,
): Promise<Map<string, T>> {
  if (unresolvedNames.length === 0) return new Map();

  const result = new Map<string, T>();

  for (let i = 0; i < unresolvedNames.length; i += ALIAS_BATCH_SIZE) {
    const chunk = unresolvedNames.slice(i, i + ALIAS_BATCH_SIZE);
    const ph = placeholders(chunk.length, 1);

    // Join alias table → magic_cards to get the default printing in one query.
    const rows = await db
      .prepare(
        `SELECT ${columns}, mca.alias_name
         FROM magic_card_aliases mca
         JOIN magic_cards mc ON mc.oracle_id = mca.oracle_id AND mc.is_default = 1
         WHERE mca.alias_name IN (${ph})`,
      )
      .bind(...chunk)
      .all<T & { alias_name: string }>();

    for (const row of rows.results) {
      // Map from the alias name the user typed (lowercase) to the resolved row.
      result.set(row.alias_name.toLowerCase(), row);
    }
  }

  return result;
}
