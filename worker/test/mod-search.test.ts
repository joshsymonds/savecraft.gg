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
      // Physical damage prefix — 3 tiers (same group)
      env.DB.prepare(
        `INSERT INTO poe_mods (mod_id, mod_text, affix, generation_type, level, group_name, item_classes, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "PhysDmg1",
        "(170-179)% increased Physical Damage",
        "Merciless",
        "prefix",
        83,
        "IncreasedPhysicalDamagePercent",
        '["weapon"]',
        '["physical_damage"]',
      ),
      env.DB.prepare(
        `INSERT INTO poe_mods (mod_id, mod_text, affix, generation_type, level, group_name, item_classes, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "PhysDmg2",
        "(155-169)% increased Physical Damage",
        "Tyrannical",
        "prefix",
        73,
        "IncreasedPhysicalDamagePercent",
        '["weapon"]',
        '["physical_damage"]',
      ),
      env.DB.prepare(
        `INSERT INTO poe_mods (mod_id, mod_text, affix, generation_type, level, group_name, item_classes, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "PhysDmg3",
        "(135-154)% increased Physical Damage",
        "Cruel",
        "prefix",
        60,
        "IncreasedPhysicalDamagePercent",
        '["weapon"]',
        '["physical_damage"]',
      ),
      // Fire resistance suffix — 2 tiers
      env.DB.prepare(
        `INSERT INTO poe_mods (mod_id, mod_text, affix, generation_type, level, group_name, item_classes, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FireRes1",
        "+46% to Fire Resistance",
        "of the Furnace",
        "suffix",
        72,
        "FireResistance",
        '["ring","amulet","helmet"]',
        '["elemental","fire","resistance"]',
      ),
      env.DB.prepare(
        `INSERT INTO poe_mods (mod_id, mod_text, affix, generation_type, level, group_name, item_classes, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FireRes2",
        "+36% to Fire Resistance",
        "of the Magma",
        "suffix",
        60,
        "FireResistance",
        '["ring","amulet","helmet"]',
        '["elemental","fire","resistance"]',
      ),
      // Flask duration prefix — 1 tier
      env.DB.prepare(
        `INSERT INTO poe_mods (mod_id, mod_text, affix, generation_type, level, group_name, item_classes, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "FlaskDur1",
        "+30% increased Duration",
        "Enduring",
        "prefix",
        55,
        "FlaskDuration",
        '["flask"]',
        '["flask"]',
      ),
      // FTS5 rows
      env.DB.prepare("INSERT INTO poe_mods_fts (mod_id, mod_text) VALUES (?, ?)").bind(
        "PhysDmg1",
        "(170-179)% increased Physical Damage",
      ),
      env.DB.prepare("INSERT INTO poe_mods_fts (mod_id, mod_text) VALUES (?, ?)").bind(
        "PhysDmg2",
        "(155-169)% increased Physical Damage",
      ),
      env.DB.prepare("INSERT INTO poe_mods_fts (mod_id, mod_text) VALUES (?, ?)").bind(
        "PhysDmg3",
        "(135-154)% increased Physical Damage",
      ),
      env.DB.prepare("INSERT INTO poe_mods_fts (mod_id, mod_text) VALUES (?, ?)").bind(
        "FireRes1",
        "+46% to Fire Resistance",
      ),
      env.DB.prepare("INSERT INTO poe_mods_fts (mod_id, mod_text) VALUES (?, ?)").bind(
        "FireRes2",
        "+36% to Fire Resistance",
      ),
      env.DB.prepare("INSERT INTO poe_mods_fts (mod_id, mod_text) VALUES (?, ?)").bind(
        "FlaskDur1",
        "+30% increased Duration",
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

  it("searches by mod text via FTS5 and groups by group_name", async () => {
    await seedMods();

    const result = await modSearchModule.execute({ query: "physical damage" }, ftsEnv);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const mods = result.data.mods as {
      mod_name: string;
      generation_type: string;
      tiers: { tier: number; name: string; level: number; text: string }[];
    }[];
    // 3 tiers grouped into 1 mod group
    expect(mods.length).toBe(1);
    expect(mods[0]!.mod_name).toContain("Physical Damage");
    expect(mods[0]!.generation_type).toBe("prefix");

    const tiers = mods[0]!.tiers;
    expect(tiers.length).toBe(3);
    // Tiers sorted by level desc (T1 = highest)
    expect(tiers[0]).toMatchObject({ tier: 1, name: "Merciless", level: 83 });
    expect(tiers[1]).toMatchObject({ tier: 2, name: "Tyrannical", level: 73 });
    expect(tiers[2]).toMatchObject({ tier: 3, name: "Cruel", level: 60 });
  });

  it("searches fire resistance", async () => {
    await seedMods();

    const result = await modSearchModule.execute({ query: "fire resistance" }, ftsEnv);
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const mods = result.data.mods as { mod_name: string; generation_type: string }[];
    expect(mods.length).toBe(1);
    expect(mods[0]!.mod_name).toContain("Fire Resistance");
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

    const mods = result.data.mods as { generation_type: string }[];
    // "increased Physical Damage" (3 tiers → 1 group) and "increased Duration" (1 tier → 1 group)
    expect(mods.length).toBe(2);
    for (const mod of mods) {
      expect(mod.generation_type).toBe("prefix");
    }
  });

  it("filters by item_class", async () => {
    await seedMods();

    const result = await modSearchModule.execute(
      { query: "fire resistance", item_class: "ring" },
      ftsEnv,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");

    const mods = result.data.mods as { mod_name: string }[];
    expect(mods.length).toBe(1);
    expect(mods[0]!.mod_name).toContain("Fire Resistance");
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

    const mods = result.data.mods as unknown[];
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
