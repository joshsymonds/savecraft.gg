import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { deckbuildingModule } from "../../plugins/magic/reference/deckbuilding";
import { registerNativeModule } from "../src/reference/registry";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

/**
 * Seeds a minimal set of magic_cards entries covering the test decks:
 *  - Atraxa (Phyrexian commander, color identity WUBG) — legal commander
 *  - Sol Ring (colorless artifact) — legal in commander
 *  - Cyclonic Rift (instant, blue) — legal in commander
 *  - Birds of Paradise (creature, green) — legal in commander
 *  - Lightning Bolt (instant, red) — legal but NOT in Atraxa's color identity
 *  - Forest / Plains (basic lands)
 *  - Black Lotus (banned in commander)
 */
async function seedCards(): Promise<void> {
  const rows: [string, string, string, string, string, string, string, string, string][] = [
    // [scryfall_id, name, front_face_name, type_line, cmc, mana_cost, colors, color_identity, legalities]
    [
      "atraxa-scryfall",
      "Atraxa, Praetors' Voice",
      "Atraxa, Praetors' Voice",
      "Legendary Creature — Phyrexian Angel Horror",
      "4",
      "{G}{W}{U}{B}",
      '["W","U","B","G"]',
      '["W","U","B","G"]',
      '{"commander":"legal","standard":"not_legal"}',
    ],
    [
      "sol-ring-id",
      "Sol Ring",
      "Sol Ring",
      "Artifact",
      "1",
      "{1}",
      "[]",
      "[]",
      '{"commander":"legal"}',
    ],
    [
      "cyclonic-rift-id",
      "Cyclonic Rift",
      "Cyclonic Rift",
      "Instant",
      "2",
      "{1}{U}",
      '["U"]',
      '["U"]',
      '{"commander":"legal"}',
    ],
    [
      "birds-id",
      "Birds of Paradise",
      "Birds of Paradise",
      "Creature — Bird",
      "1",
      "{G}",
      '["G"]',
      '["G"]',
      '{"commander":"legal"}',
    ],
    [
      "bolt-id",
      "Lightning Bolt",
      "Lightning Bolt",
      "Instant",
      "1",
      "{R}",
      '["R"]',
      '["R"]',
      '{"commander":"legal"}',
    ],
    [
      "forest-id",
      "Forest",
      "Forest",
      "Basic Land — Forest",
      "0",
      "",
      "[]",
      '["G"]',
      '{"commander":"legal"}',
    ],
    [
      "plains-id",
      "Plains",
      "Plains",
      "Basic Land — Plains",
      "0",
      "",
      "[]",
      '["W"]',
      '{"commander":"legal"}',
    ],
    [
      "island-id",
      "Island",
      "Island",
      "Basic Land — Island",
      "0",
      "",
      "[]",
      '["U"]',
      '{"commander":"legal"}',
    ],
    [
      "swamp-id",
      "Swamp",
      "Swamp",
      "Basic Land — Swamp",
      "0",
      "",
      "[]",
      '["B"]',
      '{"commander":"legal"}',
    ],
    [
      "black-lotus-id",
      "Black Lotus",
      "Black Lotus",
      "Artifact",
      "0",
      "{0}",
      "[]",
      "[]",
      '{"commander":"banned"}',
    ],
  ];

  for (const r of rows) {
    await env.DB.prepare(
      `INSERT INTO magic_cards
         (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text,
          colors, color_identity, legalities, rarity, set_code, keywords, is_default, front_face_name)
       VALUES (?, NULL, ?, ?, ?, ?, ?, '', ?, ?, ?, 'mythic', 'TST', '[]', 1, ?)`,
    )
      .bind(r[0], r[0], r[1], r[5], Number(r[4]), r[3], r[6], r[7], r[8], r[2])
      .run();
  }
}

/** Build a 99-card basic-land deck, returning 99 Forest + 1 commander. */
function buildValidAtraxaDeck(): { name: string; count: number }[] {
  // 99 Forest + commander is obviously unplayable but satisfies structure checks.
  return [
    { name: "Atraxa, Praetors' Voice", count: 1 },
    { name: "Forest", count: 99 },
  ];
}

describe("deckbuilding commander format validation", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("magic", deckbuildingModule);
    await seedCards();
  });

  it("accepts a valid 100-card Commander deck", async () => {
    const result = await deckbuildingModule.execute(
      {
        mode: "constructed",
        format: "commander",
        commander: "Atraxa, Praetors' Voice",
        deck: buildValidAtraxaDeck(),
      },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as {
      mode: string;
      format: string;
      commander: { name: string; color_identity: string[] };
      deck_size: number;
      singleton_violations: unknown[];
      color_identity_violations: unknown[];
      banned_cards: unknown[];
      errors: string[];
    };
    expect(data.mode).toBe("constructed");
    expect(data.format).toBe("commander");
    expect(data.commander.name).toBe("Atraxa, Praetors' Voice");
    expect(data.commander.color_identity).toEqual(["W", "U", "B", "G"]);
    expect(data.deck_size).toBe(100);
    expect(data.singleton_violations).toEqual([]);
    expect(data.color_identity_violations).toEqual([]);
    expect(data.banned_cards).toEqual([]);
    expect(data.errors).toEqual([]);
  });

  it("flags singleton violations (non-basic duplicates)", async () => {
    const result = await deckbuildingModule.execute(
      {
        mode: "constructed",
        format: "commander",
        commander: "Atraxa, Praetors' Voice",
        deck: [
          { name: "Atraxa, Praetors' Voice", count: 1 },
          { name: "Sol Ring", count: 2 }, // ← singleton violation
          { name: "Cyclonic Rift", count: 3 }, // ← singleton violation
          { name: "Forest", count: 96 }, // basic, allowed multi-copy
        ],
      },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as {
      singleton_violations: { card_name: string; count: number }[];
    };
    const names = data.singleton_violations.map((v) => v.card_name);
    expect(names).toContain("Sol Ring");
    expect(names).toContain("Cyclonic Rift");
    expect(names).not.toContain("Forest");
    expect(names).not.toContain("Atraxa, Praetors' Voice");
  });

  it("flags color identity violations", async () => {
    const result = await deckbuildingModule.execute(
      {
        mode: "constructed",
        format: "commander",
        commander: "Atraxa, Praetors' Voice",
        deck: [
          { name: "Atraxa, Praetors' Voice", count: 1 },
          // Lightning Bolt is red — NOT in Atraxa's WUBG color identity
          { name: "Lightning Bolt", count: 1 },
          { name: "Forest", count: 98 },
        ],
      },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as {
      color_identity_violations: { card_name: string; card_colors: string[] }[];
    };
    const names = data.color_identity_violations.map((v) => v.card_name);
    expect(names).toEqual(["Lightning Bolt"]);
    expect(data.color_identity_violations[0]?.card_colors).toEqual(["R"]);
  });

  it("flags wrong deck size", async () => {
    const result = await deckbuildingModule.execute(
      {
        mode: "constructed",
        format: "commander",
        commander: "Atraxa, Praetors' Voice",
        deck: [
          { name: "Atraxa, Praetors' Voice", count: 1 },
          { name: "Forest", count: 50 }, // only 51 total — too small
        ],
      },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { deck_size: number; errors: string[] };
    expect(data.deck_size).toBe(51);
    expect(data.errors.some((error) => error.includes("100"))).toBe(true);
  });

  it("flags banned cards", async () => {
    const result = await deckbuildingModule.execute(
      {
        mode: "constructed",
        format: "commander",
        commander: "Atraxa, Praetors' Voice",
        deck: [
          { name: "Atraxa, Praetors' Voice", count: 1 },
          { name: "Black Lotus", count: 1 }, // banned
          { name: "Forest", count: 98 },
        ],
      },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { banned_cards: { card_name: string }[] };
    expect(data.banned_cards.map((b) => b.card_name)).toEqual(["Black Lotus"]);
  });

  it("errors when commander parameter is missing", async () => {
    const result = await deckbuildingModule.execute(
      {
        mode: "constructed",
        format: "commander",
        deck: buildValidAtraxaDeck(),
      },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { errors?: string[]; error?: string };
    const errText = data.error ?? data.errors?.join(" ") ?? "";
    expect(errText).toMatch(/commander/i);
  });

  it("errors when commander card not found", async () => {
    const result = await deckbuildingModule.execute(
      {
        mode: "constructed",
        format: "commander",
        commander: "Fake Commander",
        deck: buildValidAtraxaDeck(),
      },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;
    const data = result.data as { errors?: string[]; error?: string };
    const errText = data.error ?? data.errors?.join(" ") ?? "";
    expect(errText).toMatch(/not found|unknown/i);
  });
});
