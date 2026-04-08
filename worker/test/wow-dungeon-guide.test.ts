import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { dungeonGuideModule } from "../../plugins/wow/reference/dungeon-guide";

import { cleanAll } from "./helpers";

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

interface EncounterSeed {
  encounter_id: number;
  encounter_name: string;
  instance_id: number;
  instance_name: string;
  abilities: { name: string; description: string }[];
}

async function seedEncounters(encounters: EncounterSeed[]): Promise<void> {
  const stmts = encounters.flatMap((encounter) => {
    const encounterStmts = [
      env.DB.prepare(
        `INSERT INTO wow_encounters (encounter_id, encounter_name, instance_id, instance_name)
         VALUES (?, ?, ?, ?)`,
      ).bind(
        encounter.encounter_id,
        encounter.encounter_name,
        encounter.instance_id,
        encounter.instance_name,
      ),
      env.DB.prepare(
        `INSERT INTO wow_encounters_fts (encounter_id, encounter_name, instance_name)
         VALUES (?, ?, ?)`,
      ).bind(encounter.encounter_id, encounter.encounter_name, encounter.instance_name),
    ];
    const abilityStmts = encounter.abilities.map((a) =>
      env.DB.prepare(
        `INSERT INTO wow_encounter_abilities (encounter_id, ability_name, ability_description)
         VALUES (?, ?, ?)`,
      ).bind(encounter.encounter_id, a.name, a.description),
    );
    return [...encounterStmts, ...abilityStmts];
  });
  await env.DB.batch(stmts);
}

const FIRST_BOSS: EncounterSeed = {
  encounter_id: 2900,
  encounter_name: "Nal'thar the Rimebinder",
  instance_id: 1299,
  instance_name: "Windrunner Spire",
  abilities: [
    {
      name: "Frost Bolt Volley",
      description: "Hurls bolts of frost at all players, dealing 5,000 Frost damage.",
    },
    { name: "Encasing Ice", description: "Encases a player in ice, stunning them for 6 sec." },
  ],
};

const SECOND_BOSS: EncounterSeed = {
  encounter_id: 2901,
  encounter_name: "Alleria Windrunner",
  instance_id: 1299,
  instance_name: "Windrunner Spire",
  abilities: [
    { name: "Void Barrage", description: "Fires a barrage of void bolts at random players." },
  ],
};

const OTHER_DUNGEON_BOSS: EncounterSeed = {
  encounter_id: 2910,
  encounter_name: "Magistrix Sena",
  instance_id: 1300,
  instance_name: "Magisters' Terrace",
  abilities: [
    {
      name: "Arcane Explosion",
      description: "Releases a burst of arcane energy, dealing damage to all nearby players.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dungeon_guide reference module", () => {
  beforeEach(cleanAll);

  it("searches encounters by name via FTS5", async () => {
    await seedEncounters([FIRST_BOSS, SECOND_BOSS, OTHER_DUNGEON_BOSS]);

    const result = await dungeonGuideModule.execute({ name: "Rimebinder" }, env);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const encounters = data.encounters as Record<string, unknown>[];
    expect(encounters.length).toBe(1);
    expect(encounters[0]!.encounter_name).toBe("Nal'thar the Rimebinder");
    expect(encounters[0]!.instance_name).toBe("Windrunner Spire");
    // Should include abilities
    const abilities = encounters[0]!.abilities as Record<string, unknown>[];
    expect(abilities.length).toBe(2);
    expect(abilities[0]!.ability_name).toBe("Frost Bolt Volley");
  });

  it("filters by instance name", async () => {
    await seedEncounters([FIRST_BOSS, SECOND_BOSS, OTHER_DUNGEON_BOSS]);

    const result = await dungeonGuideModule.execute(
      { name: "Windrunner", instance: "Windrunner Spire" },
      env,
    );

    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const encounters = data.encounters as Record<string, unknown>[];
    // Both bosses from Windrunner Spire match "Windrunner" in FTS5
    // (instance_name is indexed in FTS5)
    expect(encounters.length).toBeGreaterThanOrEqual(1);
    for (const entry of encounters) {
      expect(entry.instance_name).toBe("Windrunner Spire");
    }
  });

  it("looks up by encounter_id directly", async () => {
    await seedEncounters([FIRST_BOSS, SECOND_BOSS]);

    const result = await dungeonGuideModule.execute({ encounter_id: 2901 }, env);

    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const encounters = data.encounters as Record<string, unknown>[];
    expect(encounters.length).toBe(1);
    expect(encounters[0]!.encounter_name).toBe("Alleria Windrunner");
    const abilities = encounters[0]!.abilities as Record<string, unknown>[];
    expect(abilities.length).toBe(1);
    expect(abilities[0]!.ability_name).toBe("Void Barrage");
  });

  it("returns empty array when no matches", async () => {
    await seedEncounters([FIRST_BOSS]);

    const result = await dungeonGuideModule.execute({ name: "Nonexistent" }, env);

    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const encounters = data.encounters as Record<string, unknown>[];
    expect(encounters.length).toBe(0);
  });

  it("returns error text when no params provided", async () => {
    const result = await dungeonGuideModule.execute({}, env);
    expect(result.type).toBe("text");
    expect((result as { type: "text"; content: string }).content).toMatch(/name.*encounter_id/i);
  });

  it("has correct module metadata", () => {
    expect(dungeonGuideModule.id).toBe("dungeon_guide");
    expect(dungeonGuideModule.name).toBe("Dungeon Guide");
    expect(dungeonGuideModule.parameters).toBeDefined();
  });
});
