/**
 * Safe JSON parse helper shared by reference modules.
 *
 * Returns the parsed value or `fallback` if the input is empty or invalid.
 * Used to coerce D1 TEXT columns storing JSON (color_identity, themes,
 * legalities, etc.) into typed values without crashing the module on
 * malformed rows.
 */
export function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
