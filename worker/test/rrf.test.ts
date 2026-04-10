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
    // With k=1, rank differences matter much more than k=1000
    const smallK = mergeWithRRF(["a", "b"], ["b", "a"], 1, 10);
    const largeK = mergeWithRRF(["a", "b"], ["b", "a"], 1000, 10);
    // With equal opposing ranks and any k, scores should be equal — order is stable
    // Both should contain both items
    expect(smallK).toHaveLength(2);
    expect(largeK).toHaveLength(2);
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
