import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { manaBaseModule } from "../../plugins/mtga/reference/mana-base";
import { registerNativeModule } from "../src/reference/registry";

import { cleanAll } from "./helpers";

describe("mana_base native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("mtga", manaBaseModule);
  });

  async function seedCards(): Promise<void> {
    await env.DB.batch([
      // Mono-black: {2}{B}{B} = 2 generic + 2 black pips
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, colors, rarity, set_code, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(87_521, "abc", "Sheoldred, the Apocalypse", "{2}{B}{B}", 4, '["B"]', "mythic", "DMU"),
      // Mono-red: {R}
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, colors, rarity, set_code, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(1, "def", "Lightning Bolt", "{R}", 1, '["R"]', "common", "STA"),
      // Multicolor gold card (blue-black)
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, colors, rarity, set_code, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(3, "jkl", "Baleful Strix", "{U}{B}", 2, '["U","B"]', "rare", "STA"),
      // Green: {G}
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, colors, rarity, set_code, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(2, "ghi", "Llanowar Elves", "{G}", 1, '["G"]', "common", "DAR"),
    ]);
  }

  it("computes land recommendations for a mono-color deck", async () => {
    await seedCards();

    const result = await manaBaseModule.execute(
      {
        deck: [{ name: "Lightning Bolt", count: 4 }],
      },
      env,
    );

    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("Mana Base Analysis");
    expect(result.content).toContain("Red");
    expect(result.content).toContain("Lightning Bolt");
    expect(result.content).toContain("Karsten");
  });

  it("handles multicolor cards with gold adjustment", async () => {
    await seedCards();

    const result = await manaBaseModule.execute(
      {
        deck: [{ name: "Baleful Strix", count: 4 }],
      },
      env,
    );

    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    // Should have both Blue and Black requirements
    expect(result.content).toContain("Blue");
    expect(result.content).toContain("Black");
    // Gold adjustment
    expect(result.content).toContain("+1 gold");
  });

  it("handles unknown cards gracefully", async () => {
    await seedCards();

    const result = await manaBaseModule.execute(
      {
        deck: [{ name: "Nonexistent Card", count: 4 }],
      },
      env,
    );

    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("No spells with mana costs found");
  });

  it("respects deck_size parameter", async () => {
    await seedCards();

    const result = await manaBaseModule.execute(
      {
        deck: [{ name: "Lightning Bolt", count: 4 }],
        deck_size: 40,
      },
      env,
    );

    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    expect(result.content).toContain("40-card deck");
  });

  it("analyzes multiple colors correctly", async () => {
    await seedCards();

    const result = await manaBaseModule.execute(
      {
        deck: [
          { name: "Sheoldred, the Apocalypse", count: 4 },
          { name: "Lightning Bolt", count: 4 },
        ],
      },
      env,
    );

    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    // Should have both Black and Red requirements
    expect(result.content).toContain("Black");
    expect(result.content).toContain("Red");
    // Sheoldred has BB (2 pips) — most demanding for black
    expect(result.content).toContain("Sheoldred");
  });

  it("reports unresolved cards in output", async () => {
    await seedCards();

    const result = await manaBaseModule.execute(
      {
        deck: [
          { name: "Lightning Bolt", count: 4 },
          { name: "Counterspell", count: 4 },
          { name: "Force of Will", count: 4 },
        ],
      },
      env,
    );

    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");

    // Should mention the unresolved cards
    expect(result.content).toContain("Counterspell");
    expect(result.content).toContain("Force of Will");
    expect(result.content).toContain("not found");
    // Should still analyze Lightning Bolt (the only resolved card)
    expect(result.content).toContain("Red");
  });
});
