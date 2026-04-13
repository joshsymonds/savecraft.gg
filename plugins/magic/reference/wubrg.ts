/**
 * WUBRG color subset SQL helpers for EDH reference modules.
 *
 * Commander's "color identity subset" rule: a combo/commander fits in a
 * user's deck iff every color letter in its required colors is also in the
 * user's allowed colors. We enforce this in SQL by stripping the user's
 * allowed letters from the column and checking the result is empty.
 *
 * Two flavors:
 *   - `buildSubsetExpr(userColors, col)`: column stores a plain uppercase
 *     string like "BG" (as in magic_edh_combos.colors)
 *   - `buildJSONSubsetExpr(userColors, col)`: column stores a JSON array
 *     like '["B","G"]' (as in magic_edh_commanders.color_identity) —
 *     strips JSON punctuation first
 *
 * Inputs must be validated separately via `isValidColors()` before use.
 * The returned expression embeds fixed uppercase letters from a constant
 * array — never user input — so it is injection-safe by construction.
 */

const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;
const VALID_COLORS_RE = /^[WUBRG]*$/;

/** Validate a user-provided colors string (WUBRG letters only). */
export function isValidColors(userColors: string): boolean {
  return VALID_COLORS_RE.test(userColors);
}

/**
 * Build a SQL expression that is `= ''` when the given column's color
 * identity is a subset of `userColors`. The column is expected to hold a
 * plain uppercase string of WUBRG letters (no JSON, no punctuation).
 */
export function buildSubsetExpr(userColors: string, columnExpr: string): string {
  const toStrip = ALL_COLORS.filter((c) => userColors.includes(c));
  let expr = columnExpr;
  for (const letter of toStrip) {
    expr = `REPLACE(${expr}, '${letter}', '')`;
  }
  return expr;
}

/**
 * Build a SQL expression for columns that store the color identity as a
 * JSON array (e.g. `'["W","U","B","G"]'`). Strips JSON punctuation before
 * stripping the user's allowed color letters.
 */
export function buildJSONSubsetExpr(userColors: string, columnExpr: string): string {
  // Remove JSON punctuation first so only color letters remain.
  const stripped = `REPLACE(REPLACE(REPLACE(REPLACE(${columnExpr}, '[', ''), ']', ''), '"', ''), ',', '')`;
  return buildSubsetExpr(userColors, stripped);
}
