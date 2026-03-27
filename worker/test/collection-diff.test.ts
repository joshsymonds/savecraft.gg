import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { collectionDiffModule } from "../../plugins/mtga/reference/collection-diff";
import { registerNativeModule } from "../src/reference/registry";

import { cleanAll } from "./helpers";

describe("collection_diff native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("mtga", collectionDiffModule);
  });

  async function seedCards(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, rarity, set_code, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      ).bind(
        87_521,
        "abc",
        "Sheoldred, the Apocalypse",
        "Sheoldred, the Apocalypse",
        "mythic",
        "DMU",
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, rarity, set_code, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      ).bind(1, "def", "Lightning Bolt", "Lightning Bolt", "common", "STA"),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, rarity, set_code, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      ).bind(2, "ghi", "Thoughtseize", "Thoughtseize", "rare", "AKR"),
    ]);
  }

  it("computes wildcard costs for missing cards", async () => {
    await seedCards();

    const result = await collectionDiffModule.execute(
      {
        deck: [
          { name: "Sheoldred, the Apocalypse", count: 4 },
          { name: "Lightning Bolt", count: 4 },
          { name: "Thoughtseize", count: 4 },
        ],
        collection: [
          { arenaId: 87_521, count: 1 }, // Own 1 Sheoldred
          { arenaId: 1, count: 4 }, // Own 4 Lightning Bolt
          // Own 0 Thoughtseize
        ],
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const data = result.data;
    const missing = data.missing as { name: string; count: number; rarity: string }[];
    const cost = data.wildcardCost as Record<string, number>;

    // Need 3 Sheoldred (mythic), 0 Lightning Bolt, 4 Thoughtseize (rare)
    expect(missing.length).toBe(2);
    const sheoldred = missing.find((m) => m.name === "Sheoldred, the Apocalypse");
    expect(sheoldred).toBeDefined();
    expect(sheoldred!.count).toBe(3);
    expect(sheoldred!.rarity).toBe("mythic");

    const thoughtseize = missing.find((m) => m.name === "Thoughtseize");
    expect(thoughtseize).toBeDefined();
    expect(thoughtseize!.count).toBe(4);
    expect(thoughtseize!.rarity).toBe("rare");

    expect(cost.mythic).toBe(3);
    expect(cost.rare).toBe(4);
    expect(cost.common).toBe(0);
    expect(cost.total).toBe(7);
  });

  it("returns empty missing when collection is complete", async () => {
    await seedCards();

    const result = await collectionDiffModule.execute(
      {
        deck: [{ name: "Lightning Bolt", count: 4 }],
        collection: [{ arenaId: 1, count: 4 }],
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const missing = result.data.missing as unknown[];
    expect(missing.length).toBe(0);
    expect((result.data.wildcardCost as Record<string, number>).total).toBe(0);
  });

  it("handles unknown cards gracefully", async () => {
    await seedCards();

    const result = await collectionDiffModule.execute(
      {
        deck: [
          { name: "Nonexistent Card", count: 4 },
          { name: "Lightning Bolt", count: 4 },
        ],
        collection: [],
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const missing = result.data.missing as { name: string; rarity: string }[];
    // Unknown card should still appear but with "unknown" rarity
    const unknown = missing.find((m) => m.name === "Nonexistent Card");
    expect(unknown).toBeDefined();
    expect(unknown!.rarity).toBe("unknown");
  });

  it("wildcard total matches rarity breakdown including unknown", async () => {
    await seedCards();

    const result = await collectionDiffModule.execute(
      {
        deck: [
          { name: "Sheoldred, the Apocalypse", count: 4 },
          { name: "Nonexistent Card", count: 4 },
        ],
        collection: [],
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const cost = result.data.wildcardCost as Record<string, number>;
    // 4 mythic (Sheoldred) + 4 unknown (Nonexistent)
    expect(cost.mythic).toBe(4);
    expect(cost.unknown).toBe(4);
    expect(cost.total).toBe(
      (cost.common ?? 0) +
        (cost.uncommon ?? 0) +
        (cost.rare ?? 0) +
        (cost.mythic ?? 0) +
        (cost.unknown ?? 0),
    );
  });

  it("includes unresolved card names in response", async () => {
    await seedCards();

    const result = await collectionDiffModule.execute(
      {
        deck: [
          { name: "Nonexistent Card", count: 4 },
          { name: "Lightning Bolt", count: 4 },
        ],
        collection: [],
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const unresolved = result.data.unresolvedCards as string[];
    expect(unresolved).toContain("Nonexistent Card");
    expect(unresolved).not.toContain("Lightning Bolt");
  });
});
