import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { modSearchModule } from "../../plugins/poe/reference/mod-search";
import { registerNativeModule } from "../src/reference/registry";

import { cleanAll } from "./helpers";

describe("mod_search native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("poe", modSearchModule);
  });

  async function seedMods(): Promise<void> {
    await env.DB.batch([
      // Physical damage prefix — 3 tiers
      env.DB.prepare(
        `INSERT INTO poe_mods (mod_id, mod_name, generation_type, mod_type, domain, item_class_spawns, stat_ids, stat_ranges, tiers)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "LocalPhysicalDamagePercent|item|prefix",
        "% increased Physical Damage",
        "prefix",
        "explicit",
        "item",
        '{"weapon":50}',
        '["local_physical_damage_+%"]',
        "[]",
        JSON.stringify([
          {
            tier: 1,
            name: "Merciless",
            level: 83,
            stats: [{ text: "170% increased Physical Damage", min: 170, max: 179 }],
            weight: 25,
          },
          {
            tier: 2,
            name: "Tyrannical",
            level: 73,
            stats: [{ text: "155% increased Physical Damage", min: 155, max: 169 }],
            weight: 50,
          },
          {
            tier: 3,
            name: "Cruel",
            level: 60,
            stats: [{ text: "135% increased Physical Damage", min: 135, max: 154 }],
            weight: 100,
          },
        ]),
      ),
      // Fire resistance suffix
      env.DB.prepare(
        `INSERT INTO poe_mods (mod_id, mod_name, generation_type, mod_type, domain, item_class_spawns, stat_ids, stat_ranges, tiers)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FireResist|item|suffix",
        "% to Fire Resistance",
        "suffix",
        "explicit",
        "item",
        '{"ring":100,"amulet":100,"helmet":100}',
        '["base_fire_damage_resistance_%"]',
        "[]",
        JSON.stringify([
          {
            tier: 1,
            name: "of the Furnace",
            level: 72,
            stats: [{ text: "+46% to Fire Resistance", min: 46, max: 48 }],
            weight: 50,
          },
          {
            tier: 2,
            name: "of the Magma",
            level: 60,
            stats: [{ text: "+36% to Fire Resistance", min: 36, max: 41 }],
            weight: 100,
          },
        ]),
      ),
      // Flask duration prefix
      env.DB.prepare(
        `INSERT INTO poe_mods (mod_id, mod_name, generation_type, mod_type, domain, item_class_spawns, stat_ids, stat_ranges, tiers)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FlaskDuration|flask|prefix",
        "% increased Duration",
        "prefix",
        "explicit",
        "flask",
        '{"flask":200}',
        '["local_flask_duration_+%"]',
        "[]",
        JSON.stringify([
          {
            tier: 1,
            name: "Enduring",
            level: 55,
            stats: [{ text: "+30% increased Duration", min: 30, max: 40 }],
            weight: 100,
          },
        ]),
      ),
      // FTS5 rows
      env.DB.prepare("INSERT INTO poe_mods_fts (mod_id, mod_name) VALUES (?, ?)").bind(
        "LocalPhysicalDamagePercent|item|prefix",
        "% increased Physical Damage",
      ),
      env.DB.prepare("INSERT INTO poe_mods_fts (mod_id, mod_name) VALUES (?, ?)").bind(
        "FireResist|item|suffix",
        "% to Fire Resistance",
      ),
      env.DB.prepare("INSERT INTO poe_mods_fts (mod_id, mod_name) VALUES (?, ?)").bind(
        "FlaskDuration|flask|prefix",
        "% increased Duration",
      ),
    ]);
  }

  // Strip AI + Vectorize so tests don't hit the network
  const ftsEnv = { ...env, AI: undefined, POE_INDEX: undefined } as unknown as typeof env;

  it("returns help text without query", async () => {
    await seedMods();

    const result = await modSearchModule.execute({}, ftsEnv);
    expect(result.type).toBe("text");
  });

  it("returns empty-data message when table is empty", async () => {
    const result = await modSearchModule.execute({ query: "physical" }, ftsEnv);
    expect(result.type).toBe("text");
  });

  it("searches by mod name via FTS5", async () => {
    await seedMods();

    const result = await modSearchModule.execute({ query: "physical damage" }, ftsEnv);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const mods = result.data.mods as Record<string, unknown>[];
    expect(mods.length).toBe(1);
    expect(mods[0]!.mod_name).toBe("% increased Physical Damage");
    expect(mods[0]!.generation_type).toBe("prefix");

    const tiers = mods[0]!.tiers as Record<string, unknown>[];
    expect(tiers.length).toBe(3);
    expect(tiers[0]).toMatchObject({ tier: 1, name: "Merciless", level: 83 });
  });

  it("searches fire resistance", async () => {
    await seedMods();

    const result = await modSearchModule.execute({ query: "fire resistance" }, ftsEnv);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const mods = result.data.mods as Record<string, unknown>[];
    expect(mods.length).toBe(1);
    expect(mods[0]!.mod_name).toBe("% to Fire Resistance");
    expect(mods[0]!.generation_type).toBe("suffix");
  });

  it("filters by generation_type", async () => {
    await seedMods();

    const result = await modSearchModule.execute(
      { query: "increased", generation_type: "prefix" },
      ftsEnv,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const mods = result.data.mods as Record<string, unknown>[];
    // "% increased Physical Damage" and "% increased Duration" are both prefixes
    // that match "increased"
    expect(mods.length).toBe(2);
    for (const mod of mods) {
      expect(mod.generation_type).toBe("prefix");
    }
  });

  it("filters by domain", async () => {
    await seedMods();

    const result = await modSearchModule.execute({ query: "increased", domain: "flask" }, ftsEnv);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const mods = result.data.mods as Record<string, unknown>[];
    expect(mods.length).toBe(1);
    expect(mods[0]!.domain).toBe("flask");
  });

  it("filters by item_class (spawn weight tag)", async () => {
    await seedMods();

    const result = await modSearchModule.execute(
      { query: "fire resistance", item_class: "ring" },
      ftsEnv,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const mods = result.data.mods as Record<string, unknown>[];
    expect(mods.length).toBe(1);
    expect(mods[0]!.mod_name).toBe("% to Fire Resistance");
  });

  it("item_class filter excludes non-matching mods", async () => {
    await seedMods();

    // Physical damage only spawns on "weapon", not "ring"
    const result = await modSearchModule.execute(
      { query: "physical damage", item_class: "ring" },
      ftsEnv,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const mods = result.data.mods as Record<string, unknown>[];
    expect(mods.length).toBe(0);
  });

  it("returns empty results for non-matching query", async () => {
    await seedMods();

    const result = await modSearchModule.execute({ query: "nonexistent mod xyz" }, ftsEnv);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    expect(result.data.mods).toEqual([]);
    expect(result.data.count).toBe(0);
  });
});
