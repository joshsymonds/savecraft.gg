/**
 * Reciprocal Rank Fusion (RRF) — merges two ranked ID lists into one.
 *
 * Used to combine FTS5 keyword results with Vectorize semantic results.
 * Each ID gets a score of 1/(k + rank) from each list, and scores are summed.
 * Higher k smooths differences between ranks (k=60 is standard).
 *
 * The result is capped at maxResults to prevent D1's 100-parameter bind limit
 * from being exceeded when the merged list is used in SQL IN clauses.
 */
export function mergeWithRRF(
  bm25Ids: string[],
  vectorIds: string[],
  k: number,
  maxResults: number,
): string[] {
  const scores = new Map<string, number>();

  for (const [rank, id] of bm25Ids.entries()) {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
  }
  for (const [rank, id] of vectorIds.entries()) {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
  }

  return [...scores.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, maxResults)
    .map(([id]) => id);
}
