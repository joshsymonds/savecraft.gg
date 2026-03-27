import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { NativeReferenceModule, ReferenceResult } from "../src/reference/types";
import { registerNativeModule } from "../src/reference/registry";
import { resolveSectionParams } from "../src/reference/section-resolution";

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
    async execute(query): Promise<ReferenceResult> {
      return { type: "structured", data: { ...query } };
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
    const saveId = await seedSaveWithData(USER_A, "mtga", "TestDeck");
    const deckData = {
      id: "deck-uuid",
      name: "Mono Black",
      format: "Standard",
      cards: [
        { arenaId: 87521, name: "Sheoldred, the Apocalypse", count: 4 },
      ],
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

    await expect(
      resolveSectionParams(env.DB, USER_A, module, query),
    ).rejects.toThrow("save_id is required");
  });

  it("rejects cross-user section access", async () => {
    const saveId = await seedSaveWithData(USER_A, "mtga", "TestDeck");
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
    await expect(
      resolveSectionParams(env.DB, USER_B, module, query),
    ).rejects.toThrow("Save not found");
  });

  it("rejects when inline data conflicts with section reference", async () => {
    const saveId = await seedSaveWithData(USER_A, "mtga", "TestDeck");
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
      deck: [{ name: "Lightning Bolt", count: 4 }], // inline conflict!
    };

    await expect(
      resolveSectionParams(env.DB, USER_A, module, query),
    ).rejects.toThrow("conflicts with section reference");
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
    const saveId = await seedSaveWithData(USER_A, "mtga", "TestDeck");

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

    await expect(
      resolveSectionParams(env.DB, USER_A, module, query),
    ).rejects.toThrow("Section not found");
  });
});
