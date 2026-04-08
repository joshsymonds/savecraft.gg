/**
 * Integration tests for WoW reference modules.
 *
 * Verifies modules are properly registered, discoverable via the native
 * module registry, and produce correct results with real fixture data.
 */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { abilityLookupModule } from "../../plugins/wow/reference/ability-lookup";
import { dungeonGuideModule } from "../../plugins/wow/reference/dungeon-guide";
import { gearAuditModule } from "../../plugins/wow/reference/gear-audit";
import { registerNativeModule } from "../src/reference/registry";
import { seasonInfoModule } from "../../plugins/wow/reference/season-info";
import { getNativeModules } from "../src/reference/registry";
import { cleanAll } from "./helpers";

// Real fixture data from Blizzard API (plugins/wow/testdata/)
import backstabFixture from "../../plugins/wow/testdata/blizzard-spell-53.json";

/** Re-register WoW modules after cleanAll wipes the native registry. */
function registerWowModules(): void {
  registerNativeModule("wow", abilityLookupModule);
  registerNativeModule("wow", dungeonGuideModule);
  registerNativeModule("wow", gearAuditModule);
  registerNativeModule("wow", seasonInfoModule);
}

describe("WoW reference module integration", () => {
  beforeEach(() => {
    cleanAll();
    registerWowModules();
  });

  // ── Registration ──────────────────────────────────────────

  it("registers all WoW modules via getNativeModules", () => {
    const modules = getNativeModules("wow");
    const ids = modules.map((m) => m.id);
    expect(ids).toContain("ability_lookup");
    expect(ids).toContain("dungeon_guide");
    expect(ids).toContain("gear_audit");
    expect(ids).toContain("season_info");
  });

  it("ability_lookup has correct metadata shape for list_games", () => {
    const modules = getNativeModules("wow");
    const abilityLookup = modules.find((m) => m.id === "ability_lookup");
    expect(abilityLookup).toBeDefined();
    expect(abilityLookup!.name).toBe("Ability Lookup");
    expect(abilityLookup!.description).toContain("USE PROACTIVELY");
    expect(abilityLookup!.parameters).toBeDefined();
    expect(abilityLookup!.parameters!.name).toBeDefined();
    expect(abilityLookup!.parameters!.spell_id).toBeDefined();
    expect(abilityLookup!.parameters!.class).toBeDefined();
    expect(abilityLookup!.parameters!.spec).toBeDefined();
  });

  it("season_info has correct metadata shape for list_games", () => {
    const modules = getNativeModules("wow");
    const seasonInfo = modules.find((m) => m.id === "season_info");
    expect(seasonInfo).toBeDefined();
    expect(seasonInfo!.name).toBe("Season Info");
    expect(seasonInfo!.description).toContain("USE PROACTIVELY");
    expect(seasonInfo!.parameters).toBeDefined();
    expect(seasonInfo!.parameters!.type).toBeDefined();
  });

  // ── Real fixture data ─────────────────────────────────────

  it("ability_lookup finds Backstab (real Blizzard API fixture) for Rogue specs", async () => {
    // Seed from real fixture: Backstab (spell 53) — a Rogue base ability
    const spell = backstabFixture as { id: number; name: string; description: string };

    // Insert for 3 Rogue specs (simulating pipeline output)
    const rogueSpecs = [
      { spec_id: 259, spec_name: "Assassination" },
      { spec_id: 260, spec_name: "Outlaw" },
      { spec_id: 261, spec_name: "Subtlety" },
    ];

    const stmts = rogueSpecs.flatMap((s) => [
      env.DB.prepare(
        `INSERT INTO wow_spells (spell_id, name, description, source, class_id, class_name, spec_id, spec_name)
         VALUES (?, ?, ?, 'blizzard_api', 4, 'Rogue', ?, ?)`,
      ).bind(spell.id, spell.name, spell.description, s.spec_id, s.spec_name),
    ]);
    // One FTS5 row (deduplicated — one per unique spell)
    stmts.push(
      env.DB.prepare(
        `INSERT INTO wow_spells_fts (spell_id, name, description) VALUES (?, ?, ?)`,
      ).bind(spell.id, spell.name, spell.description),
    );
    await env.DB.batch(stmts);

    // Query via the actual module
    const result = await abilityLookupModule.execute({ name: "Backstab" }, env);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const spells = data.spells as Array<Record<string, unknown>>;

    // Should find exactly 3 results (one per Rogue spec), NOT 3×1=3 cartesian
    expect(spells.length).toBe(3);
    // All should be Rogue
    for (const s of spells) {
      expect(s.class_name).toBe("Rogue");
      expect(s.name).toBe("Backstab");
      expect(s.source).toBe("blizzard_api");
    }
    // Real description from fixture — resolved numbers, not placeholders
    expect(spells[0]!.description).toContain("Physical damage");
    // Verify spec assignment
    const specNames = spells.map((s) => s.spec_name).sort();
    expect(specNames).toEqual(["Assassination", "Outlaw", "Subtlety"]);
  });

  it("ability_lookup returns source field for provenance tracking", async () => {
    // Seed a spell with talent_tree source (no Blizzard API description)
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO wow_spells (spell_id, name, description, source, class_id, class_name, spec_id, spec_name)
         VALUES (99999, 'Test Ability', '', 'talent_tree', 1, 'Warrior', 71, 'Arms')`,
      ),
      env.DB.prepare(
        `INSERT INTO wow_spells_fts (spell_id, name, description) VALUES (99999, 'Test Ability', '')`,
      ),
    ]);

    const result = await abilityLookupModule.execute({ name: "Test Ability" }, env);
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const spells = data.spells as Array<Record<string, unknown>>;

    expect(spells.length).toBe(1);
    expect(spells[0]!.source).toBe("talent_tree");
  });
});
