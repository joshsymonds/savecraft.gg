/** Sanitize a string for FTS5 MATCH: wrap in double quotes, escape internal double quotes. */
export function fts5Safe(s: string): string {
  return `"${s.replaceAll('"', '""')}"`;
}
