/** Shared utilities for PoE reference modules. */

export { fts5Safe } from "../../../worker/src/reference/fts5";

/** Parse a JSON column value (string) back to an array. Returns [] on null or parse failure. */
export function parseJsonColumn(value: string | null): unknown[] {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
