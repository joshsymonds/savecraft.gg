/**
 * Tests for MTGA reference module card resolution bugs:
 *
 * 1. DFC cards: Modules using `name` instead of `front_face_name` fail to
 *    resolve double-faced cards (e.g., "Kavaero, Mind-Bitten" stored as
 *    "Kavaero, Mind-Bitten // Kavaero, the Burning Sky").
 *
 * 2. Lands in mana_base: Lands have empty mana_cost, so the `!row.mana_cost`
 *    check rejects them. The module also doesn't query `produced_mana`, so it
 *    can't count mana sources from lands.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { manaBaseModule } from "../../plugins/mtga/reference/mana-base";
import { collectionDiffModule } from "../../plugins/mtga/reference/collection-diff";
import { playAdvisorModule } from "../../plugins/mtga/reference/play-advisor";
import { cleanAll } from "./helpers";

// ── Seed data ────────────────────────────────────────────────

/** Insert a card into mtga_cards with sensible defaults. */
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
    `INSERT INTO mtga_cards
      (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line,
       oracle_text, colors, color_identity, legalities, rarity, set_code,
       keywords, is_default, produced_mana)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '', ?8, '[]', '{}', ?9, 'test', '[]', ?10, ?11)`,
  )
    .bind(
      arena_id,
      `oracle-${arena_id}`,
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

// ── mana_base ────────────────────────────────────────────────

describe("mana_base card resolution", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  it("resolves lands (empty mana_cost) instead of marking them unresolved", async () => {
    // Seed a basic land and a spell
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

    const result = await manaBaseModule.execute(
      {
        deck: [
          { name: "Swamp", count: 10 },
          { name: "Murder", count: 4 },
        ],
        deck_size: 60,
      },
      env,
    );

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;

    // Swamp should NOT be in unresolved_cards
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

    const result = await manaBaseModule.execute(
      {
        deck: [
          { name: "Breeding Pool", count: 4 },
          { name: "Growth Spiral", count: 4 },
        ],
        deck_size: 60,
      },
      env,
    );

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.unresolved_cards ?? []).not.toContain("Breeding Pool");
  });

  it("resolves DFC cards by front_face_name", async () => {
    // Scryfall stores DFCs with full " // " name, but MTGA uses front face only
    await seedCard({
      arena_id: 100,
      name: "Kavaero, Mind-Bitten // Kavaero, the Burning Sky",
      front_face_name: "Kavaero, Mind-Bitten",
      mana_cost: "{2}{U}{B}",
      colors: ["U", "B"],
      rarity: "mythic",
    });

    const result = await manaBaseModule.execute(
      {
        deck: [{ name: "Kavaero, Mind-Bitten", count: 1 }],
        deck_size: 60,
      },
      env,
    );

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.unresolved_cards ?? []).not.toContain("Kavaero, Mind-Bitten");
    // Should have found a spell with colored pips
    expect(data.spell_count).toBeGreaterThan(0);
  });

  it("calculates sources_needed for Blue and Black when UB lands are in deck", async () => {
    // Seed lands + a demanding UB spell
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

    const result = await manaBaseModule.execute(
      {
        deck: [
          { name: "Island", count: 8 },
          { name: "Swamp", count: 8 },
          { name: "Watery Grave", count: 4 },
          { name: "Counterspell", count: 4 },
          { name: "Murder", count: 4 },
        ],
        deck_size: 60,
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

    // Both Blue and Black should have sources_needed > 0
    const requirements = data.requirements as Array<{ color: string; sources_needed: number }>;
    const blue = requirements.find((r) => r.color === "U");
    const black = requirements.find((r) => r.color === "B");
    expect(blue).toBeDefined();
    expect(blue!.sources_needed).toBeGreaterThan(0);
    expect(black).toBeDefined();
    expect(black!.sources_needed).toBeGreaterThan(0);
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
    const missing = data.missing as Array<{ name: string; rarity: string }>;
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
    const missing = data.missing as Array<{ name: string }>;
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
