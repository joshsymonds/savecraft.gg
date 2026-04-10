/**
 * Tests for MTGA reference module card resolution bugs:
 *
 * 1. DFC cards: Modules using `name` instead of `front_face_name` fail to
 *    resolve double-faced cards (e.g., "Kavaero, Mind-Bitten" stored as
 *    "Kavaero, Mind-Bitten // Kavaero, the Burning Sky").
 *
 * 2. Lands in deckbuilding mana analysis: Lands have empty mana_cost but
 *    should still be resolved and counted as colored sources via produced_mana.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { collectionDiffModule } from "../../plugins/mtga/reference/collection-diff";
import { deckbuildingModule } from "../../plugins/mtga/reference/deckbuilding";
import { playAdvisorModule } from "../../plugins/mtga/reference/play-advisor";

import { cleanAll } from "./helpers";

// ── Seed data ────────────────────────────────────────────────

/** Insert a card into magic_cards with sensible defaults. */
async function seedCard(overrides: {
  arena_id: number;
  name: string;
  front_face_name?: string;
  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  rarity?: string;
  produced_mana?: string[];
  is_default?: number;
  type_line?: string;
}): Promise<void> {
  const {
    arena_id,
    name,
    front_face_name = name,
    mana_cost = "",
    cmc = 0,
    colors = [],
    rarity = "common",
    produced_mana = [],
    is_default = 1,
    type_line = "",
  } = overrides;

  await env.DB.prepare(
    `INSERT INTO magic_cards
      (scryfall_id, arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line,
       colors, rarity, is_default, produced_mana)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `scry-${String(arena_id)}`,
      arena_id,
      `oracle-${String(arena_id)}`,
      name,
      front_face_name,
      mana_cost,
      cmc,
      type_line,
      JSON.stringify(colors),
      rarity,
      is_default,
      JSON.stringify(produced_mana),
    )
    .run();
}

// ── deckbuilding mana analysis ───────────────────────────────

describe("deckbuilding mana card resolution", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  it("resolves lands (empty mana_cost) instead of marking them unresolved", async () => {
    await seedCard({
      arena_id: 1,
      name: "Swamp",
      mana_cost: "",
      colors: [],
      produced_mana: ["B"],
      type_line: "Basic Land — Swamp",
    });
    await seedCard({
      arena_id: 2,
      name: "Murder",
      mana_cost: "{1}{B}{B}",
      colors: ["B"],
      type_line: "Instant",
    });

    const result = await deckbuildingModule.execute(
      {
        mode: "constructed",
        deck: [
          { name: "Swamp", count: 10 },
          { name: "Murder", count: 4 },
        ],
      },
      env,
    );

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.unresolved_cards ?? []).not.toContain("Swamp");
  });

  it("resolves dual lands without marking them unresolved", async () => {
    await seedCard({
      arena_id: 10,
      name: "Breeding Pool",
      mana_cost: "",
      colors: [],
      produced_mana: ["G", "U"],
      type_line: "Land — Forest Island",
    });
    await seedCard({
      arena_id: 11,
      name: "Growth Spiral",
      mana_cost: "{G}{U}",
      colors: ["G", "U"],
      type_line: "Instant",
    });

    const result = await deckbuildingModule.execute(
      {
        mode: "constructed",
        deck: [
          { name: "Breeding Pool", count: 4 },
          { name: "Growth Spiral", count: 4 },
        ],
      },
      env,
    );

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.unresolved_cards ?? []).not.toContain("Breeding Pool");
  });

  it("resolves DFC cards by front_face_name", async () => {
    await seedCard({
      arena_id: 100,
      name: "Kavaero, Mind-Bitten // Kavaero, the Burning Sky",
      front_face_name: "Kavaero, Mind-Bitten",
      mana_cost: "{2}{U}{B}",
      colors: ["U", "B"],
      rarity: "mythic",
    });

    const result = await deckbuildingModule.execute(
      {
        mode: "constructed",
        deck: [{ name: "Kavaero, Mind-Bitten", count: 1 }],
      },
      env,
    );

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.unresolved_cards ?? []).not.toContain("Kavaero, Mind-Bitten");
    // Should have mana analysis with colored pips
    const mana = data.mana as { pip_distribution: Record<string, number> };
    expect(Object.keys(mana.pip_distribution).length).toBeGreaterThan(0);
  });

  it("computes needs-vs-has for Blue and Black with UB lands", async () => {
    await seedCard({
      arena_id: 1,
      name: "Island",
      mana_cost: "",
      colors: [],
      produced_mana: ["U"],
      type_line: "Basic Land — Island",
    });
    await seedCard({
      arena_id: 2,
      name: "Swamp",
      mana_cost: "",
      colors: [],
      produced_mana: ["B"],
      type_line: "Basic Land — Swamp",
    });
    await seedCard({
      arena_id: 3,
      name: "Watery Grave",
      mana_cost: "",
      colors: [],
      produced_mana: ["U", "B"],
      type_line: "Land — Island Swamp",
    });
    await seedCard({
      arena_id: 100,
      name: "Counterspell",
      mana_cost: "{U}{U}",
      colors: ["U"],
      type_line: "Instant",
    });
    await seedCard({
      arena_id: 101,
      name: "Murder",
      mana_cost: "{1}{B}{B}",
      colors: ["B"],
      type_line: "Instant",
    });

    const result = await deckbuildingModule.execute(
      {
        mode: "constructed",
        deck: [
          { name: "Island", count: 8 },
          { name: "Swamp", count: 8 },
          { name: "Watery Grave", count: 4 },
          { name: "Counterspell", count: 4 },
          { name: "Murder", count: 4 },
        ],
      },
      env,
    );

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;

    // Lands should NOT be unresolved
    const unresolved = (data.unresolved_cards ?? []) as string[];
    expect(unresolved).not.toContain("Island");
    expect(unresolved).not.toContain("Swamp");
    expect(unresolved).not.toContain("Watery Grave");

    // Both Blue and Black should have sources_needed > 0 and sources_actual > 0
    const mana = data.mana as {
      colors: { color: string; sources_needed: number; sources_actual: number }[];
    };
    const blue = mana.colors.find((c) => c.color === "U");
    const black = mana.colors.find((c) => c.color === "B");
    expect(blue).toBeDefined();
    expect(blue!.sources_needed).toBeGreaterThan(0);
    expect(blue!.sources_actual).toBe(12); // 8 Islands + 4 Watery Grave
    expect(black).toBeDefined();
    expect(black!.sources_needed).toBeGreaterThan(0);
    expect(black!.sources_actual).toBe(12); // 8 Swamps + 4 Watery Grave
  });
});

// ── collection_diff ──────────────────────────────────────────

describe("collection_diff card resolution", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  it("resolves DFC cards by front_face_name for rarity lookup", async () => {
    await seedCard({
      arena_id: 100,
      name: "Kavaero, Mind-Bitten // Kavaero, the Burning Sky",
      front_face_name: "Kavaero, Mind-Bitten",
      mana_cost: "{2}{U}{B}",
      colors: ["U", "B"],
      rarity: "mythic",
    });

    const result = await collectionDiffModule.execute(
      {
        deck: [{ name: "Kavaero, Mind-Bitten", count: 1 }],
        collection: [],
      },
      env,
    );

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;

    // Should resolve — not be in unresolvedCards
    const unresolved = data.unresolvedCards as string[];
    expect(unresolved).not.toContain("Kavaero, Mind-Bitten");

    // Should know it's mythic
    const missing = data.missing as { name: string; rarity: string }[];
    const kavaero = missing.find((m) => m.name === "Kavaero, Mind-Bitten");
    expect(kavaero).toBeDefined();
    expect(kavaero!.rarity).toBe("mythic");
  });

  it("resolves DFC cards owned in collection by arena_id", async () => {
    // This path uses arena_id lookup — should work regardless of name column
    await seedCard({
      arena_id: 100,
      name: "Kavaero, Mind-Bitten // Kavaero, the Burning Sky",
      front_face_name: "Kavaero, Mind-Bitten",
      mana_cost: "{2}{U}{B}",
      colors: ["U", "B"],
      rarity: "mythic",
    });

    const result = await collectionDiffModule.execute(
      {
        deck: [{ name: "Kavaero, Mind-Bitten", count: 1 }],
        collection: [{ arenaId: 100, count: 4 }],
      },
      env,
    );

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;

    // Player owns 4, needs 1 — should not be missing
    const missing = data.missing as { name: string }[];
    expect(missing.find((m) => m.name === "Kavaero, Mind-Bitten")).toBeUndefined();
  });
});

// ── play_advisor ─────────────────────────────────────────────

describe("play_advisor card resolution", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  it("resolves DFC cards in mulligan hand by front_face_name", async () => {
    // DFC creature — stored with full " // " name, but MTGA hand uses front face
    await seedCard({
      arena_id: 200,
      name: "Kavaero, Mind-Bitten // Kavaero, the Burning Sky",
      front_face_name: "Kavaero, Mind-Bitten",
      mana_cost: "{2}{U}{B}",
      cmc: 4,
      colors: ["U", "B"],
      rarity: "mythic",
      type_line: "Legendary Creature — Human Wizard",
    });
    // A basic land (should resolve as a land)
    await seedCard({
      arena_id: 201,
      name: "Island",
      mana_cost: "",
      colors: [],
      produced_mana: ["U"],
      type_line: "Basic Land — Island",
    });

    // Seed mulligan data for this exact hand composition
    await env.DB.prepare(
      `INSERT INTO mtga_play_mulligan (set_code, archetype, on_play, land_count, nonland_cmc_bucket, num_mulligans, games_won, total_games)
       VALUES ('test', 'ALL', 1, 1, 'high', 0, 50, 100)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO mtga_play_mulligan (set_code, archetype, on_play, land_count, nonland_cmc_bucket, num_mulligans, games_won, total_games)
       VALUES ('test', 'ALL', 1, 0, 'mid', 0, 50, 100)`,
    ).run();

    const result = await playAdvisorModule.execute(
      {
        mode: "mulligan",
        set: "test",
        on_play: true,
        hand: ["Kavaero, Mind-Bitten", "Island"],
      },
      env,
    );

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;

    // Island is a land → land_count should be 1.
    // If DFC bug: Island resolves (name matches), Kavaero doesn't (name mismatch),
    // Kavaero gets default cmc 2.5 → avg_cmc = 2.5 → "mid" bucket.
    // If fixed: Island resolves, Kavaero resolves with cmc ~4 → avg_cmc = 4 → "high" bucket.
    expect(data.land_count).toBe(1);
    expect(data.cmc_bucket).toBe("high"); // Kavaero CMC 4 → high bucket
  });
});
