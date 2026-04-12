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
    // Rules section (before reasoning guide) should NOT contain unrelated rules
    const rulesSection = text.split("═══ Rules Reasoning Guide ═══")[0]!;
    expect(rulesSection).not.toContain("614.1");
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

  // ── Interaction patterns ──────────────────────────────────

  async function seedInteractions(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_interactions (id, title, mechanics, card_names, rule_numbers, breakdown, common_error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        1,
        "Blood Moon + Sagas",
        "layers,type-changing,SBA,ability-granting",
        "Blood Moon,Urza's Saga",
        "305.7,613.1d,613.1f,704.5s,714.4",
        "Step 1: Blood Moon applies in Layer 4 (type-changing). Urza's Saga becomes a Mountain.\nStep 2: In Layer 6, Blood Moon removes abilities from rules text (305.7). Chapter abilities are rules text — removed.\nStep 3: Abilities GRANTED by resolved chapter abilities are NOT rules text — they persist (305.7 explicitly excludes granted abilities).\nStep 4: SBA check (704.5s): 'a Saga with one or more chapter abilities' — Saga has zero chapter abilities, so SBA does not trigger.\nResult: Saga survives as a Mountain. If chapter II had resolved, the Construct-making ability persists permanently.",
        "LLMs conflate 'chapter ability' (rules text, removed by Blood Moon) with 'ability granted BY a chapter ability' (effect-granted, preserved per 305.7). They also apply the old pre-May-2025 rule that sacrificed Sagas with zero chapter abilities.",
      ),
      env.DB.prepare(
        `INSERT INTO mtga_interactions_fts (id, title, mechanics, card_names, breakdown)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        1,
        "Blood Moon + Sagas",
        "layers,type-changing,SBA,ability-granting",
        "Blood Moon,Urza's Saga",
        "Step 1: Blood Moon applies in Layer 4 (type-changing). Urza's Saga becomes a Mountain.",
      ),
      env.DB.prepare(
        `INSERT INTO mtga_interactions (id, title, mechanics, card_names, rule_numbers, breakdown, common_error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        2,
        "Replacement Effect Ordering (Torbran + Furnace of Rath)",
        "replacement-effects,damage-modification",
        "Torbran Thane of Red Fell,Furnace of Rath",
        "614.1,616.1",
        "When multiple replacement effects modify the same event, the affected player or controller of the affected object chooses the order (616.1). For damage to a player, THAT PLAYER chooses — not the controller of the replacement sources.",
        "LLMs assume the controller of the replacement effect sources chooses the order. In Torbran + Furnace of Rath, the opponent (taking damage) chooses, and will pick: double first (6), then +2 (8) — not +2 first (5) then double (10).",
      ),
      env.DB.prepare(
        `INSERT INTO mtga_interactions_fts (id, title, mechanics, card_names, breakdown)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        2,
        "Replacement Effect Ordering (Torbran + Furnace of Rath)",
        "replacement-effects,damage-modification",
        "Torbran Thane of Red Fell,Furnace of Rath",
        "When multiple replacement effects modify the same event, the affected player or controller of the affected object chooses the order (616.1).",
      ),
    ]);
  }

  it("keyword search returns matched interactions alongside rules", async () => {
    await seedRules();
    await seedInteractions();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ keyword: "Blood Moon" }, bm25Env);

    const text = (result as { content: string }).content;
    expect(text).toContain("Interaction Patterns");
    expect(text).toContain("Blood Moon + Sagas");
    expect(text).toContain("chapter ability");
  });

  it("interactions match by card name", async () => {
    await seedRules();
    await seedInteractions();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ keyword: "Urza's Saga" }, bm25Env);

    const text = (result as { content: string }).content;
    expect(text).toContain("Blood Moon + Sagas");
  });

  it("interactions match by mechanic", async () => {
    await seedRules();
    await seedInteractions();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ keyword: "replacement effects" }, bm25Env);

    const text = (result as { content: string }).content;
    expect(text).toContain("Replacement Effect Ordering");
    expect(text).toContain("Torbran");
  });

  it("no interactions returned when nothing matches", async () => {
    await seedRules();
    await seedInteractions();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ keyword: "deathtouch" }, bm25Env);

    const text = (result as { content: string }).content;
    expect(text).not.toContain("Interaction Patterns");
  });

  it("rule number lookup also searches interactions by rule number", async () => {
    await seedRules();
    await seedInteractions();
    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ rule: "614.1" }, env);

    const text = (result as { content: string }).content;
    // 614.1 is in the replacement effects interaction's rule_numbers
    expect(text).toContain("Interaction Patterns");
    expect(text).toContain("Replacement Effect Ordering");
  });

  it("caps interaction results at MAX_INTERACTIONS (3)", async () => {
    await seedRules();
    // Seed 5 interactions all matching "layers"
    const stmts = [];
    for (let n = 1; n <= 5; n++) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO mtga_interactions (id, title, mechanics, card_names, rule_numbers, breakdown, common_error)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          n,
          `Layer Interaction ${String(n)}`,
          "layers",
          "Card A,Card B",
          "613.1",
          `Breakdown ${String(n)}`,
          `Error ${String(n)}`,
        ),
        env.DB.prepare(
          `INSERT INTO mtga_interactions_fts (id, title, mechanics, card_names, breakdown)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(
          n,
          `Layer Interaction ${String(n)}`,
          "layers",
          "Card A,Card B",
          `Breakdown ${String(n)}`,
        ),
      );
    }
    await env.DB.batch(stmts);

    const module_ = getNativeModule("mtga", "rules_search")!;
    const result = await module_.execute({ keyword: "layers" }, bm25Env);
    const text = (result as { content: string }).content;

    // Should have interaction patterns section
    expect(text).toContain("Interaction Patterns");
    // Count occurrences of "Layer Interaction" — should be at most 3
    const matches = text.match(/Layer Interaction \d/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(3);
  });

  // ── Reasoning guide ───────────────────────────────────────

  it("every response includes reasoning guide placeholder", async () => {
    await seedRules();
    const module_ = getNativeModule("mtga", "rules_search")!;

    // Check keyword search
    const kwResult = await module_.execute({ keyword: "deathtouch" }, bm25Env);
    const kwText = (kwResult as { content: string }).content;
    expect(kwText).toContain("Reasoning Guide");

    // Check rule lookup
    const ruleResult = await module_.execute({ rule: "702.2" }, env);
    const ruleText = (ruleResult as { content: string }).content;
    expect(ruleText).toContain("Reasoning Guide");
  });
});
