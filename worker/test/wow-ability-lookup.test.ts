import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { abilityLookupModule } from "../../plugins/wow/reference/ability-lookup";

import { cleanAll } from "./helpers";

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

interface SpellSeed {
  spell_id: number;
  name: string;
  description: string;
  icon?: string;
  class_id?: number;
  class_name?: string;
  spec_id?: number;
  spec_name?: string;
}

async function seedSpells(spells: SpellSeed[]): Promise<void> {
  const stmts = spells.flatMap((s) => [
    env.DB.prepare(
      `INSERT INTO wow_spells (spell_id, name, description, icon, class_id, class_name, spec_id, spec_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      s.spell_id,
      s.name,
      s.description,
      s.icon ?? null,
      s.class_id ?? null,
      s.class_name ?? null,
      s.spec_id ?? null,
      s.spec_name ?? null,
    ),
    env.DB.prepare(
      `INSERT INTO wow_spells_fts (spell_id, name, description) VALUES (?, ?, ?)`,
    ).bind(s.spell_id, s.name, s.description),
  ]);
  await env.DB.batch(stmts);
}

const SHIELD_OF_THE_RIGHTEOUS: SpellSeed = {
  spell_id: 53_600,
  name: "Shield of the Righteous",
  description: "Slams enemies in front of you with your shield, causing 2,345 Holy damage.",
  class_id: 2,
  class_name: "Paladin",
  spec_id: 66,
  spec_name: "Protection",
};

const AVENGERS_SHIELD: SpellSeed = {
  spell_id: 31_935,
  name: "Avenger's Shield",
  description: "Hurls your shield at an enemy target, dealing 1,234 Holy damage.",
  class_id: 2,
  class_name: "Paladin",
  spec_id: 66,
  spec_name: "Protection",
};

const FLASH_OF_LIGHT: SpellSeed = {
  spell_id: 19_750,
  name: "Flash of Light",
  description: "A quick heal that restores 5,678 health to the target.",
  class_id: 2,
  class_name: "Paladin",
  spec_id: 65,
  spec_name: "Holy",
};

const ICEBOUND_FORTITUDE: SpellSeed = {
  spell_id: 48_792,
  name: "Icebound Fortitude",
  description: "Your blood freezes, granting immunity to stun effects for 8 sec.",
  class_id: 6,
  class_name: "Death Knight",
  spec_id: 250,
  spec_name: "Blood",
};

// Multi-spec spell: Judgment exists for all 3 Paladin specs
const JUDGMENT_HOLY: SpellSeed = {
  spell_id: 275_773,
  name: "Judgment",
  description: "Judges the target, dealing 465 Holy damage.",
  class_id: 2,
  class_name: "Paladin",
  spec_id: 65,
  spec_name: "Holy",
};

const JUDGMENT_PROTECTION: SpellSeed = {
  spell_id: 275_773,
  name: "Judgment",
  description: "Judges the target, dealing 465 Holy damage.",
  class_id: 2,
  class_name: "Paladin",
  spec_id: 66,
  spec_name: "Protection",
};

const JUDGMENT_RETRIBUTION: SpellSeed = {
  spell_id: 275_773,
  name: "Judgment",
  description: "Judges the target, dealing 465 Holy damage.",
  class_id: 2,
  class_name: "Paladin",
  spec_id: 70,
  spec_name: "Retribution",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ability_lookup reference module", () => {
  beforeEach(cleanAll);

  it("searches spells by name via FTS5", async () => {
    await seedSpells([
      SHIELD_OF_THE_RIGHTEOUS,
      AVENGERS_SHIELD,
      FLASH_OF_LIGHT,
      ICEBOUND_FORTITUDE,
    ]);

    const result = await abilityLookupModule.execute({ name: "Shield" }, env);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const spells = data.spells as Record<string, unknown>[];
    expect(spells.length).toBe(2);
    const names = spells.map((s) => s.name);
    expect(names).toContain("Shield of the Righteous");
    expect(names).toContain("Avenger's Shield");
  });

  it("filters by class", async () => {
    await seedSpells([SHIELD_OF_THE_RIGHTEOUS, ICEBOUND_FORTITUDE]);

    const result = await abilityLookupModule.execute(
      { name: "Fortitude", class: "Death Knight" },
      env,
    );

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const spells = data.spells as Record<string, unknown>[];
    expect(spells.length).toBe(1);
    expect(spells[0]!.name).toBe("Icebound Fortitude");
    expect(spells[0]!.class_name).toBe("Death Knight");
  });

  it("filters by spec", async () => {
    await seedSpells([SHIELD_OF_THE_RIGHTEOUS, FLASH_OF_LIGHT]);

    const result = await abilityLookupModule.execute({ name: "Light", spec: "Holy" }, env);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const spells = data.spells as Record<string, unknown>[];
    expect(spells.length).toBe(1);
    expect(spells[0]!.name).toBe("Flash of Light");
    expect(spells[0]!.spec_name).toBe("Holy");
  });

  it("returns exactly N results for a spell shared by N specs (no cartesian product)", async () => {
    await seedSpells([JUDGMENT_HOLY, JUDGMENT_PROTECTION, JUDGMENT_RETRIBUTION]);

    const result = await abilityLookupModule.execute({ name: "Judgment" }, env);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const spells = data.spells as Record<string, unknown>[];
    // Must be exactly 3 (one per spec), NOT 9 (cartesian product of 3×3)
    expect(spells.length).toBe(3);
    const specNames = spells.map((s) => s.spec_name);
    expect(specNames).toContain("Holy");
    expect(specNames).toContain("Protection");
    expect(specNames).toContain("Retribution");
  });

  it("looks up by spell_id directly", async () => {
    await seedSpells([SHIELD_OF_THE_RIGHTEOUS, FLASH_OF_LIGHT]);

    const result = await abilityLookupModule.execute({ spell_id: 53_600 }, env);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const spells = data.spells as Record<string, unknown>[];
    expect(spells.length).toBe(1);
    expect(spells[0]!.name).toBe("Shield of the Righteous");
  });

  it("returns empty array when no matches", async () => {
    await seedSpells([SHIELD_OF_THE_RIGHTEOUS]);

    const result = await abilityLookupModule.execute({ name: "Fireball" }, env);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const spells = data.spells as Record<string, unknown>[];
    expect(spells.length).toBe(0);
  });

  it("returns error text when no query params provided", async () => {
    const result = await abilityLookupModule.execute({}, env);

    expect(result.type).toBe("text");
    expect((result as { type: "text"; content: string }).content).toMatch(/name.*spell_id/i);
  });

  it("has correct module metadata", () => {
    expect(abilityLookupModule.id).toBe("ability_lookup");
    expect(abilityLookupModule.name).toBe("Ability Lookup");
    expect(abilityLookupModule.parameters).toBeDefined();
  });
});
