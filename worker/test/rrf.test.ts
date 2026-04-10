import { describe, expect, it } from "vitest";
import { mergeWithRRF } from "../src/reference/rrf";

describe("mergeWithRRF", () => {
  it("returns empty array when both inputs are empty", () => {
    expect(mergeWithRRF([], [], 60, 10)).toEqual([]);
  });

  it("returns bm25 results when vector is empty", () => {
    const result = mergeWithRRF(["a", "b", "c"], [], 60, 10);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("returns vector results when bm25 is empty", () => {
    const result = mergeWithRRF([], ["x", "y", "z"], 60, 10);
    expect(result).toEqual(["x", "y", "z"]);
  });

  it("ranks items appearing in both lists higher", () => {
    // "b" appears in both, so it should be ranked first
    const result = mergeWithRRF(["a", "b", "c"], ["b", "d", "e"], 60, 10);
    expect(result[0]).toBe("b");
  });

  it("respects maxResults cap", () => {
    const bm25 = ["a", "b", "c", "d", "e"];
    const vector = ["f", "g", "h", "i", "j"];
    const result = mergeWithRRF(bm25, vector, 60, 3);
    expect(result.length).toBe(3);
  });

  it("preserves rank order within each list", () => {
    // "a" is rank 0 in bm25, "c" is rank 2 — "a" should score higher
    const result = mergeWithRRF(["a", "b", "c"], [], 60, 10);
    expect(result.indexOf("a")).toBeLessThan(result.indexOf("c"));
  });

  it("handles duplicate IDs within a single list", () => {
    // Shouldn't happen in practice, but should not crash
    const result = mergeWithRRF(["a", "a", "b"], ["b", "c"], 60, 10);
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
  });

  it("uses k parameter to control rank smoothing", () => {
    // With small k, rank position matters a lot: rank 0 = 1/(k+0), rank 4 = 1/(k+4)
    // With large k, rank position barely matters: 1/1000 vs 1/1004 ≈ same
    // A shared item at low ranks can beat or lose to a single-list item at rank 0
    // depending on k.
    const bm25 = ["a", "b", "c", "d", "shared"];  // "shared" at rank 4
    const vector = ["e", "f", "g", "h", "shared"]; // "shared" at rank 4

    // shared score = 1/(k+4) + 1/(k+4) = 2/(k+4)
    // a score = 1/(k+0)
    // With k=1: shared = 2/5 = 0.4, a = 1/1 = 1.0 → a wins
    // With k=100: shared = 2/104 ≈ 0.019, a = 1/100 = 0.01 → shared wins
    const smallK = mergeWithRRF(bm25, vector, 1, 10);
    const largeK = mergeWithRRF(bm25, vector, 100, 10);

    // Small k: single-list rank-0 items beat the shared item
    expect(smallK[0]).toBe("a");
    expect(smallK.indexOf("shared")).toBeGreaterThan(1);

    // Large k: shared item beats single-list items (double contribution outweighs rank)
    expect(largeK[0]).toBe("shared");
  });

  it("merges large lists correctly", () => {
    const bm25 = Array.from({ length: 50 }, (_, i) => `bm25-${i}`);
    const vector = Array.from({ length: 50 }, (_, i) => `vec-${i}`);
    // Add some overlap
    bm25[5] = "shared-1";
    vector[3] = "shared-1";
    bm25[10] = "shared-2";
    vector[7] = "shared-2";

    const result = mergeWithRRF(bm25, vector, 60, 20);
    expect(result.length).toBe(20);
    // Shared items should be near the top
    expect(result.indexOf("shared-1")).toBeLessThan(10);
    expect(result.indexOf("shared-2")).toBeLessThan(10);
  });
});
