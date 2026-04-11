import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { rulesSearchModule } from "../../plugins/mtga/reference/rules-search";
import { getNativeModule, registerNativeModule } from "../src/reference/registry";
import { mergeWithRRF } from "../src/reference/rrf";

import { cleanAll } from "./helpers";

// ── RRF merge unit tests ─────────────────────────────────────

describe("mergeWithRRF", () => {
  it("merges two ranked lists using reciprocal rank fusion", () => {
    const bm25 = ["rule-a", "rule-b", "rule-c"];
    const vector = ["rule-b", "rule-d", "rule-a"];

    const merged = mergeWithRRF(bm25, vector, 60, 100);

    // rule-b: 1/(60+1) + 1/(60+0) = 0.01639 + 0.01667 = 0.03306 (highest)
    // rule-a: 1/(60+0) + 1/(60+2) = 0.01667 + 0.01613 = 0.03279
    // rule-d: 0 + 1/(60+1) = 0.01639
    // rule-c: 1/(60+2) + 0 = 0.01613
    expect(merged[0]).toBe("rule-b");
    expect(merged[1]).toBe("rule-a");
    expect(merged).toContain("rule-c");
    expect(merged).toContain("rule-d");
    expect(merged.length).toBe(4);
  });

  it("handles empty bm25 list (vector-only)", () => {
    const merged = mergeWithRRF([], ["rule-x", "rule-y"], 60, 100);
    expect(merged).toEqual(["rule-x", "rule-y"]);
  });

  it("handles empty vector list (bm25-only)", () => {
    const merged = mergeWithRRF(["rule-x", "rule-y"], [], 60, 100);
    expect(merged).toEqual(["rule-x", "rule-y"]);
  });

  it("handles both lists empty", () => {
    expect(mergeWithRRF([], [], 60, 100)).toEqual([]);
  });

  it("deduplicates entries", () => {
    const merged = mergeWithRRF(["rule-a"], ["rule-a"], 60, 100);
    expect(merged).toEqual(["rule-a"]);
  });

  it("truncates merged output to maxResults", () => {
    // 60 unique FTS IDs + 60 unique vector IDs = 120 total after merge
    const bm25 = Array.from({ length: 60 }, (_, index) => `fts-${String(index)}`);
    const vector = Array.from({ length: 60 }, (_, index) => `vec-${String(index)}`);
    const merged = mergeWithRRF(bm25, vector, 60, 60);
    expect(merged.length).toBe(60);
  });

  it("returns all results when under maxResults", () => {
    const bm25 = ["a", "b", "c"];
    const vector = ["d", "e"];
    const merged = mergeWithRRF(bm25, vector, 60, 100);
    expect(merged.length).toBe(5);
  });
});

// ── Rules search native module integration tests ─────────────

describe("rules_search native module", () => {
  beforeEach(async () => {
    await cleanAll();
    // Re-register after cleanAll clears the registry
    registerNativeModule("mtga", rulesSearchModule);
  });

  async function seedRules(): Promise<void> {
    await env.DB.batch([
      // Structured table
      env.DB.prepare(
        "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
      ).bind("702.2", "Deathtouch is a static ability.", null, null),
      env.DB.prepare(
        "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
      ).bind(
        "702.2a",
        "Deathtouch is a keyword ability that means any damage dealt by the source is lethal.",
        null,
        '["704.5"]',
      ),
      env.DB.prepare(
        "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
      ).bind("704.5", "The state-based actions are as follows.", null, null),
      env.DB.prepare(
        "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
      ).bind(
        "614.1",
        "Some continuous effects are replacement effects.",
        "Example: If two replacement effects would apply, the affected player chooses which to apply first.",
        null,
      ),
      // FTS5 entries (must match structured table)
      env.DB.prepare("INSERT INTO mtga_rules_fts (number, text, example) VALUES (?, ?, ?)").bind(
        "702.2",
        "Deathtouch is a static ability.",
        "",
      ),
      env.DB.prepare("INSERT INTO mtga_rules_fts (number, text, example) VALUES (?, ?, ?)").bind(
        "702.2a",
        "Deathtouch is a keyword ability that means any damage dealt by the source is lethal.",
        "",
      ),
      env.DB.prepare("INSERT INTO mtga_rules_fts (number, text, example) VALUES (?, ?, ?)").bind(
        "704.5",
        "The state-based actions are as follows.",
        "",
      ),
      env.DB.prepare("INSERT INTO mtga_rules_fts (number, text, example) VALUES (?, ?, ?)").bind(
        "614.1",
        "Some continuous effects are replacement effects.",
        "Example: If two replacement effects would apply, the affected player chooses which to apply first.",
      ),
      // Trample rules for multi-keyword testing
      env.DB.prepare(
        "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
      ).bind(
        "702.19",
        "Trample is a static ability that modifies the rules for assigning combat damage.",
        null,
        null,
      ),
      env.DB.prepare(
        "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
      ).bind(
        "702.19b",
        "A creature with trample and deathtouch assigns 1 damage to each blocking creature and the rest to the defending player.",
        null,
        null,
      ),
      env.DB.prepare("INSERT INTO mtga_rules_fts (number, text, example) VALUES (?, ?, ?)").bind(
        "702.19",
        "Trample is a static ability that modifies the rules for assigning combat damage.",
        "",
      ),
      env.DB.prepare("INSERT INTO mtga_rules_fts (number, text, example) VALUES (?, ?, ?)").bind(
        "702.19b",
        "A creature with trample and deathtouch assigns 1 damage to each blocking creature and the rest to the defending player.",
        "",
      ),
    ]);
  }

  it("is registered as a native module for mtga", () => {
    const module_ = getNativeModule("mtga", "rules_search");
    expect(module_).toBeDefined();
    expect(module_!.name).toBe("Rules Search");
  });

  it("returns error for empty query", async () => {
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({}, env);
    expect(result.type).toBe("text");
    expect((result as { content: string }).content).toContain("Specify one of");
  });

  // ── Rule number lookup ───────────────────────────────────

  it("looks up rule by exact number", async () => {
    await seedRules();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ rule: "702.2" }, env);

    expect(result.type).toBe("text");
    const text = (result as { content: string }).content;
    expect(text).toContain("702.2");
    expect(text).toContain("Deathtouch is a static ability");
    // Should include subrule 702.2a
    expect(text).toContain("702.2a");
  });

  it("expands cross-references from see_also", async () => {
    await seedRules();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ rule: "702.2" }, env);

    const text = (result as { content: string }).content;
    // 702.2a has see_also: ["704.5"], so 704.5 should appear in cross-references
    expect(text).toContain("704.5");
    expect(text).toContain("state-based actions");
  });

  it("returns not found for nonexistent rule", async () => {
    await seedRules();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ rule: "999.99" }, env);

    const text = (result as { content: string }).content;
    expect(text).toContain("No rule found");
  });

  // ── Keyword search (BM25 via FTS5) ──────────────────────

  // Strip AI + Vectorize so keyword tests exercise BM25 only and don't
  // hit the network (Vectorize calls are slow/flaky in Miniflare).
  const bm25Env = { ...env, AI: undefined, MTGA_RULES_INDEX: undefined } as unknown as typeof env;

  it("keyword search returns BM25-ranked results", async () => {
    await seedRules();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ keyword: "deathtouch" }, bm25Env);

    expect(result.type).toBe("text");
    const text = (result as { content: string }).content;
    expect(text).toContain("702.2");
    expect(text).toContain("702.2a");
    // Should NOT contain unrelated rules
    expect(text).not.toContain("614.1");
  });

  it("keyword search handles multiple terms", async () => {
    await seedRules();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ keyword: "trample deathtouch" }, bm25Env);

    expect(result.type).toBe("text");
    const text = (result as { content: string }).content;
    // Should find rules about both trample and deathtouch
    expect(text).toContain("702.19b");
    // Should not return "No rules found"
    expect(text).not.toContain("No rules found");
  });

  // ── Response formatting ──────────────────────────────────

  it("rule lookup includes effective date header", async () => {
    await seedRules();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ rule: "702.2" }, env);
    const text = (result as { content: string }).content;
    expect(text).toContain("MTG Comprehensive Rules (effective");
  });

  it("rule lookup includes cross-reference annotation", async () => {
    await seedRules();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ rule: "702.2" }, env);
    const text = (result as { content: string }).content;
    expect(text).toContain("auto-expanded from see-also references");
  });

  it("keyword search includes cite-rules guidance", async () => {
    await seedRules();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ keyword: "deathtouch" }, bm25Env);
    const text = (result as { content: string }).content;
    expect(text).toContain("cite specific rule numbers");
  });

  it("module description includes proactive usage guidance", () => {
    const module_ = getNativeModule("mtga", "rules_search")!;
    expect(module_.description).toContain("USE PROACTIVELY");
    expect(module_.description).toContain("Do not rely on training data");
  });
});
