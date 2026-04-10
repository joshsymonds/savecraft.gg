/** Shared utilities for PoE reference modules. */

/** Sanitize a string for FTS5 MATCH: wrap in double quotes, escape internal double quotes. */
export function fts5Safe(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

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
