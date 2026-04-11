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

  async function seedCardRulings(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO mtga_card_rulings (oracle_id, card_name, published_at, comment) VALUES (?, ?, ?, ?)",
      ).bind(
        "abc-123",
        "Sheoldred, the Apocalypse",
        "2025-02-07",
        "Sheoldred triggers when opponent draws.",
      ),
      env.DB.prepare(
        "INSERT INTO mtga_card_rulings (oracle_id, card_name, published_at, comment) VALUES (?, ?, ?, ?)",
      ).bind(
        "abc-123",
        "Sheoldred, the Apocalypse",
        "2025-03-01",
        "The ability triggers once per card drawn.",
      ),
      env.DB.prepare(
        "INSERT INTO mtga_card_rulings (oracle_id, card_name, published_at, comment) VALUES (?, ?, ?, ?)",
      ).bind(
        "def-456",
        "Lightning Bolt",
        "2025-01-01",
        "Lightning Bolt deals 3 damage to any target.",
      ),
      // FTS5 entries
      env.DB.prepare(
        "INSERT INTO mtga_card_rulings_fts (oracle_id, card_name, comment) VALUES (?, ?, ?)",
      ).bind("abc-123", "Sheoldred, the Apocalypse", "Sheoldred triggers when opponent draws."),
      env.DB.prepare(
        "INSERT INTO mtga_card_rulings_fts (oracle_id, card_name, comment) VALUES (?, ?, ?)",
      ).bind("abc-123", "Sheoldred, the Apocalypse", "The ability triggers once per card drawn."),
      env.DB.prepare(
        "INSERT INTO mtga_card_rulings_fts (oracle_id, card_name, comment) VALUES (?, ?, ?)",
      ).bind("def-456", "Lightning Bolt", "Lightning Bolt deals 3 damage to any target."),
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

  // ── Card rulings ─────────────────────────────────────────

  it("card ruling search finds rulings by card name", async () => {
    await seedCardRulings();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ card: "Sheoldred" }, env);

    expect(result.type).toBe("text");
    const text = (result as { content: string }).content;
    expect(text).toContain("Sheoldred, the Apocalypse");
    expect(text).toContain("triggers when opponent draws");
    expect(text).toContain("once per card drawn");
    // Should NOT include Lightning Bolt
    expect(text).not.toContain("Lightning Bolt");
  });

  it("card ruling search returns not found for unknown card", async () => {
    await seedCardRulings();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ card: "Nonexistent Card" }, env);

    const text = (result as { content: string }).content;
    expect(text).toContain("No card rulings found");
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

  it("card ruling response includes authority attribution", async () => {
    await seedCardRulings();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ card: "Sheoldred" }, env);
    const text = (result as { content: string }).content;
    expect(text).toContain("Card Rulings via Scryfall");
    expect(text).toContain("Comprehensive Rules are always authoritative");
  });

  it("card ruling response cross-references related Comprehensive Rules", async () => {
    // Seed rules that match a card name term, then query by card name
    await seedRules();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO mtga_card_rulings (oracle_id, card_name, published_at, comment) VALUES (?, ?, ?, ?)",
      ).bind("dt-001", "Deathtouch Viper", "2025-01-01", "Deathtouch means any damage is lethal."),
      env.DB.prepare(
        "INSERT INTO mtga_card_rulings_fts (oracle_id, card_name, comment) VALUES (?, ?, ?)",
      ).bind("dt-001", "Deathtouch Viper", "Deathtouch means any damage is lethal."),
    ]);
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ card: "Deathtouch Viper" }, env);
    const text = (result as { content: string }).content;
    // Should include Comp Rules section with deathtouch rules
    expect(text).toContain("MTG Comprehensive Rules");
    expect(text).toContain("AUTHORITATIVE");
    expect(text).toContain("702.2");
    // Should also include the card ruling
    expect(text).toContain("Deathtouch Viper");
    expect(text).toContain("any damage is lethal");
  });

  it("card ruling response works without matching Comprehensive Rules", async () => {
    // "Sheoldred" won't match any Comp Rules terms (no rules seeded with that name)
    await seedCardRulings();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ card: "Sheoldred" }, env);
    const text = (result as { content: string }).content;
    // Should still show card rulings even without matching rules
    expect(text).toContain("Sheoldred, the Apocalypse");
    expect(text).toContain("triggers when opponent draws");
    // Should NOT have the Comp Rules header (no matches)
    expect(text).not.toContain("MTG Comprehensive Rules");
  });

  it("card ruling response flags stale rulings predating current rules", async () => {
    // Seed data has rulings from 2025-02-07 and 2025-03-01, both before
    // the Comprehensive Rules effective date (2025-11-14)
    await seedCardRulings();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ card: "Sheoldred" }, env);
    const text = (result as { content: string }).content;
    expect(text).toContain("All rulings above predate the current Comprehensive Rules");
  });

  it("card ruling response omits staleness warning for current rulings", async () => {
    // Insert a ruling dated after the effective date
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO mtga_card_rulings (oracle_id, card_name, published_at, comment) VALUES (?, ?, ?, ?)",
      ).bind("fresh-001", "Fresh Card", "2026-01-15", "This is a current ruling."),
      env.DB.prepare(
        "INSERT INTO mtga_card_rulings_fts (oracle_id, card_name, comment) VALUES (?, ?, ?)",
      ).bind("fresh-001", "Fresh Card", "This is a current ruling."),
    ]);
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ card: "Fresh Card" }, env);
    const text = (result as { content: string }).content;
    expect(text).toContain("Fresh Card");
    expect(text).not.toContain("All rulings above predate");
  });

  it("module description includes proactive usage guidance", () => {
    const module_ = getNativeModule("mtga", "rules_search")!;
    expect(module_.description).toContain("USE PROACTIVELY");
    expect(module_.description).toContain("Do not rely on training data");
  });
});
