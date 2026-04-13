import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { resolveSectionParams } from "../src/reference/section-resolution";
import type { NativeReferenceModule, ReferenceResult } from "../src/reference/types";

import { cleanAll, seedSaveWithData } from "./helpers";

/** Minimal module that echoes its query params back as structured data. */
function echoModule(
  sectionMappings?: NativeReferenceModule["sectionMappings"],
): NativeReferenceModule {
  return {
    id: "echo",
    name: "Echo",
    description: "Echoes query params for testing",
    sectionMappings,
    execute(query): Promise<ReferenceResult> {
      return Promise.resolve({ type: "structured", data: { ...query } });
    },
  };
}

describe("section-reference resolution", () => {
  const USER_A = "user-aaa";
  const USER_B = "user-bbb";

  beforeEach(async () => {
    await cleanAll();
  });

  it("resolves deck data from a section reference", async () => {
    // Seed a save with a deck section
    const saveId = await seedSaveWithData(USER_A, "magic", "TestDeck");
    const deckData = {
      id: "deck-uuid",
      name: "Mono Black",
      format: "Standard",
      cards: [{ arenaId: 87_521, name: "Sheoldred, the Apocalypse", count: 4 }],
      sideboard: [],
    };
    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveId, "deck:Mono Black", "Deck list", JSON.stringify(deckData))
      .run();

    const module = echoModule([
      {
        sectionParam: "deck_section",
        extract: (data: unknown) => {
          const d = data as { cards: unknown };
          return { deck: d.cards };
        },
      },
    ]);

    const query: Record<string, unknown> = {
      save_id: saveId,
      deck_section: "deck:Mono Black",
    };

    const resolved = await resolveSectionParams(env.DB, USER_A, module, query);
    expect(resolved.deck).toEqual(deckData.cards);
    // Section params should be stripped from the resolved query
    expect(resolved.deck_section).toBeUndefined();
    expect(resolved.save_id).toBeUndefined();
  });

  it("returns error when save_id is missing with section param", async () => {
    const module = echoModule([
      {
        sectionParam: "deck_section",
        extract: (data: unknown) => {
          const d = data as { cards: unknown };
          return { deck: d.cards };
        },
      },
    ]);

    const query: Record<string, unknown> = {
      deck_section: "deck:Mono Black",
    };

    await expect(resolveSectionParams(env.DB, USER_A, module, query)).rejects.toThrow(
      "save_id is required",
    );
  });

  it("rejects cross-user section access", async () => {
    const saveId = await seedSaveWithData(USER_A, "magic", "TestDeck");
    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveId, "deck:Test", "Deck", '{"cards":[]}')
      .run();

    const module = echoModule([
      {
        sectionParam: "deck_section",
        extract: (data: unknown) => {
          const d = data as { cards: unknown };
          return { deck: d.cards };
        },
      },
    ]);

    const query: Record<string, unknown> = {
      save_id: saveId,
      deck_section: "deck:Test",
    };

    // USER_B tries to access USER_A's save
    await expect(resolveSectionParams(env.DB, USER_B, module, query)).rejects.toThrow(
      "Save not found",
    );
  });

  it("query params take precedence over section-extracted values", async () => {
    const saveId = await seedSaveWithData(USER_A, "magic", "TestDeck");
    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveId, "deck:Test", "Deck", '{"cards":[{"name":"Swamp","count":17}]}')
      .run();

    const module = echoModule([
      {
        sectionParam: "deck_section",
        extract: (data: unknown) => {
          const d = data as { cards: unknown };
          return { deck: d.cards };
        },
      },
    ]);

    const inlineDeck = [{ name: "Lightning Bolt", count: 4 }];
    const query: Record<string, unknown> = {
      save_id: saveId,
      deck_section: "deck:Test",
      deck: inlineDeck, // explicit query param wins over section-extracted deck
    };

    const resolved = await resolveSectionParams(env.DB, USER_A, module, query);
    expect(resolved.deck).toEqual(inlineDeck);
    expect(resolved.deck_section).toBeUndefined();
  });

  it("allows orthogonal query params alongside section-extracted params", async () => {
    // Reproduces production bug: deck_section extracts format from saved deck,
    // but query also passes mode + format. The conflict check wrongly rejects
    // because format appears in both extracted data and query params.
    const saveId = await seedSaveWithData(USER_A, "magic", "TestDeck");
    const deckData = {
      cards: [{ name: "Sheoldred", count: 4 }],
      format: "Standard",
    };
    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveId, "deck:Reanimator", "Deck", JSON.stringify(deckData))
      .run();

    const module = echoModule([
      {
        sectionParam: "deck_section",
        extract: (data: unknown) => {
          const d = data as Record<string, unknown>;
          const result: Record<string, unknown> = {};
          if (Array.isArray(d.cards)) result.deck = d.cards;
          if (typeof d.format === "string") result.format = d.format.toLowerCase();
          return result;
        },
      },
    ]);

    const query: Record<string, unknown> = {
      save_id: saveId,
      deck_section: "deck:Reanimator",
      mode: "constructed",
      format: "standard", // also extracted from section — should not conflict
    };

    // Query params (mode, format) should coexist with section-extracted deck.
    // format from query should win over format from section.
    const resolved = await resolveSectionParams(env.DB, USER_A, module, query);
    expect(resolved.deck).toEqual(deckData.cards);
    expect(resolved.mode).toBe("constructed");
    expect(resolved.format).toBe("standard");
    expect(resolved.deck_section).toBeUndefined();
    expect(resolved.save_id).toBeUndefined();
  });

  it("passes through inline data unchanged when no section reference", async () => {
    const module = echoModule([
      {
        sectionParam: "deck_section",
        extract: (data: unknown) => {
          const d = data as { cards: unknown };
          return { deck: d.cards };
        },
      },
    ]);

    const inlineDeck = [{ name: "Lightning Bolt", count: 4 }];
    const query: Record<string, unknown> = {
      deck: inlineDeck,
      deck_size: 60,
    };

    const resolved = await resolveSectionParams(env.DB, USER_A, module, query);
    expect(resolved.deck).toEqual(inlineDeck);
    expect(resolved.deck_size).toBe(60);
  });

  it("works with modules that have no sectionMappings", async () => {
    const module = echoModule(); // no sectionMappings

    const query: Record<string, unknown> = {
      deck: [{ name: "Lightning Bolt", count: 4 }],
    };

    const resolved = await resolveSectionParams(env.DB, USER_A, module, query);
    expect(resolved.deck).toEqual(query.deck);
  });

  it("resolves section when section is not found", async () => {
    const saveId = await seedSaveWithData(USER_A, "magic", "TestDeck");

    const module = echoModule([
      {
        sectionParam: "deck_section",
        extract: (data: unknown) => {
          const d = data as { cards: unknown };
          return { deck: d.cards };
        },
      },
    ]);

    const query: Record<string, unknown> = {
      save_id: saveId,
      deck_section: "deck:Nonexistent",
    };

    await expect(resolveSectionParams(env.DB, USER_A, module, query)).rejects.toThrow(
      "requires the",
    );
  });
});

// ── Module-specific section mapping tests ─────────────────────

describe("draft_advisor section mapping auto-detect", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  it("auto-detects live pick when last pick has no chosen card", async () => {
    // Import the module to get its sectionMappings
    const { draftAdvisorModule } = await import("../../plugins/magic/reference/draft-advisor");
    const mapping = draftAdvisorModule.sectionMappings?.find(
      (m) => m.sectionParam === "draft_section",
    );
    expect(mapping).toBeDefined();

    // Simulate draft_history section: {drafts: [{picks: [...]}]}
    // Real section shape wraps picks inside a drafts array.
    const draftData = {
      drafts: [
        {
          eventName: "QuickDraft_TEST",
          draftType: "quick",
          picks: [
            {
              packNumber: 0,
              pickNumber: 0,
              in_deck: [],
              available: [{ name: "Card A" }, { name: "Card B" }, { name: "Card C" }],
              picked: "Card A",
            },
            {
              packNumber: 0,
              pickNumber: 1,
              in_deck: [{ name: "Card A" }],
              available: [{ name: "Card D" }, { name: "Card E" }],
              picked: "Card D",
            },
            {
              packNumber: 0,
              pickNumber: 2,
              in_deck: [{ name: "Card A" }, { name: "Card D" }],
              available: [{ name: "Card F" }, { name: "Card G" }, { name: "Card H" }],
              picked: "", // live — not yet chosen
            },
          ],
        },
      ],
    };

    const extracted = mapping!.extract(draftData);
    // Should extract pool + pack for live mode
    expect(extracted.pool).toEqual(["Card A", "Card D"]);
    expect(extracted.pack).toEqual(["Card F", "Card G", "Card H"]);
    expect(extracted.pick_number).toBe(3); // 1-based: pickNumber 2 + 1
    // Should NOT have pick_history (that's for review mode)
    expect(extracted.pick_history).toBeUndefined();
  });

  it("auto-detects review mode when all picks are complete", async () => {
    const { draftAdvisorModule } = await import("../../plugins/magic/reference/draft-advisor");
    const mapping = draftAdvisorModule.sectionMappings?.find(
      (m) => m.sectionParam === "draft_section",
    );

    const draftData = {
      drafts: [
        {
          eventName: "QuickDraft_TEST",
          draftType: "quick",
          picks: [
            {
              packNumber: 0,
              pickNumber: 0,
              in_deck: [],
              available: [{ name: "Card A" }, { name: "Card B" }],
              picked: "Card A",
            },
            {
              packNumber: 0,
              pickNumber: 1,
              in_deck: [{ name: "Card A" }],
              available: [{ name: "Card C" }, { name: "Card D" }],
              picked: "Card C",
            },
          ],
        },
      ],
    };

    const extracted = mapping!.extract(draftData);
    // Should extract pick_history for review mode
    expect(extracted.pick_history).toEqual([
      { available: ["Card A", "Card B"], chosen: "Card A" },
      { available: ["Card C", "Card D"], chosen: "Card C" },
    ]);
    // Should NOT have pool/pack (that's for live mode)
    expect(extracted.pool).toBeUndefined();
    expect(extracted.pack).toBeUndefined();
  });
});

describe("collection_diff section mapping", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  it("extracts deck cards from deck section", async () => {
    const { collectionDiffModule } = await import("../../plugins/magic/reference/collection-diff");
    const mapping = collectionDiffModule.sectionMappings?.find(
      (m) => m.sectionParam === "deck_section",
    );
    expect(mapping).toBeDefined();

    const deckData = {
      id: "deck-uuid",
      name: "Test Deck",
      format: "Standard",
      cards: [
        { arenaId: 100, name: "Sheoldred", count: 4 },
        { arenaId: 101, name: "Swamp", count: 20 },
      ],
      sideboard: [],
    };

    const extracted = mapping!.extract(deckData);
    expect(extracted.deck).toEqual(deckData.cards);
  });
});
