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
    const result = await manaBaseModule.execute({ deck: [{ name: "Lightning Bolt", count: 4 }] }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    expect(result.data.deck_size).toBe(60);
    const reqs = result.data.requirements as { color: string; color_name: string; sources_needed: number; most_demanding: string }[];
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.color).toBe("R");
    expect(reqs[0]!.color_name).toBe("Red");
    expect(reqs[0]!.most_demanding).toBe("Lightning Bolt");
    expect(reqs[0]!.sources_needed).toBeGreaterThan(0);
    expect(result).toHaveProperty("presentation");
  });

  it("handles multicolor cards with gold adjustment", async () => {
    await seedCards();
    const result = await manaBaseModule.execute({ deck: [{ name: "Baleful Strix", count: 4 }] }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const reqs = result.data.requirements as { color: string; color_name: string; is_gold_adjusted: boolean }[];
    const colors = reqs.map((r) => r.color_name);
    expect(colors).toContain("Blue");
    expect(colors).toContain("Black");
    expect(reqs.every((r) => r.is_gold_adjusted)).toBe(true);
  });

  it("handles unknown cards gracefully", async () => {
    await seedCards();
    const result = await manaBaseModule.execute({ deck: [{ name: "Nonexistent Card", count: 4 }] }, env);
    expect(result.type).toBe("formatted");
    if (result.type !== "formatted") throw new Error("unexpected type");
    expect(result.content).toContain("No spells with mana costs found");
  });

  it("respects deck_size parameter", async () => {
    await seedCards();
    const result = await manaBaseModule.execute({ deck: [{ name: "Lightning Bolt", count: 4 }], deck_size: 40 }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    expect(result.data.deck_size).toBe(40);
  });

  it("analyzes multiple colors correctly", async () => {
    await seedCards();
    const result = await manaBaseModule.execute({
      deck: [
        { name: "Sheoldred, the Apocalypse", count: 4 },
        { name: "Lightning Bolt", count: 4 },
      ],
    }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const reqs = result.data.requirements as { color: string; color_name: string; most_demanding: string }[];
    const colors = reqs.map((r) => r.color_name);
    expect(colors).toContain("Black");
    expect(colors).toContain("Red");
    const black = reqs.find((r) => r.color === "B");
    expect(black!.most_demanding).toBe("Sheoldred, the Apocalypse");
  });

  it("reports unresolved cards in output", async () => {
    await seedCards();
    const result = await manaBaseModule.execute({
      deck: [
        { name: "Lightning Bolt", count: 4 },
        { name: "Counterspell", count: 4 },
        { name: "Force of Will", count: 4 },
      ],
    }, env);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const unresolved = result.data.unresolved_cards as string[];
    expect(unresolved).toContain("Counterspell");
    expect(unresolved).toContain("Force of Will");
    const reqs = result.data.requirements as { color: string }[];
    expect(reqs.some((r) => r.color === "R")).toBe(true);
  });
});
