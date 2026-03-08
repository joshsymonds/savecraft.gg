import { describe, expect, it } from "vitest";

import {
  mapCharacterOverview,
  mapCharacterStats,
  mapEquippedGear,
  mapMythicPlus,
  mapProfessions,
  mapRaidProgression,
  mapTalents,
} from "../../plugins/wow/adapter/sections";
import type {
  BlizzardEquipment,
  BlizzardMythicKeystoneSeason,
  BlizzardProfessions,
  BlizzardProfile,
  BlizzardRaids,
  BlizzardSpecializations,
  BlizzardStatistics,
  RaiderioProfile,
} from "../../plugins/wow/adapter/types";
import equipmentFixture from "../../plugins/wow/testdata/blizzard-equipment.json";
import mythicKeystoneSeasonFixture from "../../plugins/wow/testdata/blizzard-mythic-keystone-season.json";
import professionsFixture from "../../plugins/wow/testdata/blizzard-professions.json";
// Import fixture data — real API responses from Dratnos (Tichondrius-US)
import profileFixture from "../../plugins/wow/testdata/blizzard-profile.json";
import raidsFixture from "../../plugins/wow/testdata/blizzard-raids.json";
import specializationsFixture from "../../plugins/wow/testdata/blizzard-specializations.json";
import statisticsFixture from "../../plugins/wow/testdata/blizzard-statistics.json";
import raiderioFixture from "../../plugins/wow/testdata/raiderio-profile.json";

// Cast fixtures to typed interfaces
const profile = profileFixture as unknown as BlizzardProfile;
const equipment = equipmentFixture as unknown as BlizzardEquipment;
const statistics = statisticsFixture as unknown as BlizzardStatistics;
const specializations = specializationsFixture as unknown as BlizzardSpecializations;
const mythicKeystoneSeason = mythicKeystoneSeasonFixture as unknown as BlizzardMythicKeystoneSeason;
const raids = raidsFixture as unknown as BlizzardRaids;
const professions = professionsFixture as unknown as BlizzardProfessions;
const raiderio = raiderioFixture as unknown as RaiderioProfile;

describe("WoW Section Mappers", () => {
  describe("mapCharacterOverview", () => {
    it("produces valid section from Blizzard profile", () => {
      const section = mapCharacterOverview(profile);
      const d = section.data;

      expect(section.description).toBeTruthy();
      expect(d.name).toBe("Dratnos");
      expect(d.level).toBe(80);
      expect(d.race).toBe("Troll");
      expect(d.class).toBe("Rogue");
      expect(d.active_spec).toBe("Assassination");
      expect(d.faction).toBe("Horde");
      expect(d.realm).toBe("Tichondrius");
      expect(d.guild).toBe("poptart corndoG");
      expect(d.equipped_item_level).toBe(116);
      expect(d.character_id).toBe(198_030_797);
    });

    it("includes Raider.io enrichment when provided", () => {
      const section = mapCharacterOverview(profile, raiderio);
      const d = section.data;

      expect(d.raiderio_score).toBeDefined();
      expect(d.raiderio_url).toBe("https://raider.io/characters/us/tichondrius/Dratnos");
      expect(section.enrichment?.[0]?.source).toBe("raiderio");
      expect(section.enrichment?.[0]?.available).toBe(true);
      expect(section.enrichment?.[0]?.crawledAt).toBeTruthy();
    });

    it("marks Raider.io unavailable when absent", () => {
      const section = mapCharacterOverview(profile);

      expect(section.enrichment?.[0]?.source).toBe("raiderio");
      expect(section.enrichment?.[0]?.available).toBe(false);
    });
  });

  describe("mapEquippedGear", () => {
    it("produces valid section with all equipped items", () => {
      const section = mapEquippedGear(equipment);
      const d = section.data as { items: Record<string, unknown>[] };

      expect(d.items.length).toBeGreaterThan(0);

      // Check first item (Head slot based on fixture)
      const head = d.items.find((index) => index.slot === "Head")!;
      expect(head).toBeTruthy();
      expect(head.name).toBe("High Altitude Turban");
      expect(head.item_level).toBe(124);
      expect(head.quality).toBe("Epic");
    });

    it("includes enchantments and gems", () => {
      const section = mapEquippedGear(equipment);
      const d = section.data as { items: Record<string, unknown>[] };
      const head = d.items.find((index) => index.slot === "Head")!;

      const enchantments = head.enchantments as { description: string }[];
      expect(enchantments.length).toBeGreaterThan(0);

      const sockets = head.sockets as { gem: string }[];
      expect(sockets.length).toBeGreaterThan(0);
      expect(sockets[0]?.gem).toBe("Deadly Onyx");
    });

    it("filters out negated stats", () => {
      const section = mapEquippedGear(equipment);
      const d = section.data as { items: Record<string, unknown>[] };
      const head = d.items.find((index) => index.slot === "Head")!;

      // Intellect is negated on the head piece (is_negated: true)
      const stats = head.stats as { type: string }[];
      const intellect = stats.find((s) => s.type === "Intellect");
      expect(intellect).toBeUndefined();
    });
  });

  describe("mapCharacterStats", () => {
    it("produces valid section with all stat categories", () => {
      const section = mapCharacterStats(statistics);
      const d = section.data;

      expect(d.health).toBe(77_760);
      expect(d.power_type).toBe("Energy");

      const primary = d.primary as Record<string, number>;
      expect(primary.agility).toBe(524);

      const secondary = d.secondary as Record<string, Record<string, number> | undefined>;
      expect(secondary.crit?.percent).toBeCloseTo(36.4, 0);
      expect(secondary.mastery?.percent).toBeCloseTo(69.7, 0);

      const offense = d.offense as Record<string, number>;
      expect(offense.attack_power).toBe(524);
    });
  });

  describe("mapTalents", () => {
    it("produces valid section with active loadout", () => {
      const section = mapTalents(specializations);
      const d = section.data;

      expect(d.spec_name).toBe("Assassination");
      expect(d.loadout_code).toBeTruthy();

      const classTalents = d.class_talents as { name: string }[];
      expect(classTalents.length).toBeGreaterThan(0);
      // Shiv should be in class talents
      expect(classTalents.some((t) => t.name === "Shiv")).toBe(true);

      const pvpTalents = d.pvp_talents as { name: string }[];
      expect(pvpTalents.length).toBeGreaterThan(0);
    });
  });

  describe("mapMythicPlus", () => {
    it("produces valid section from Blizzard M+ season data", () => {
      const section = mapMythicPlus(mythicKeystoneSeason);
      const d = section.data as { best_runs: Record<string, unknown>[] };

      expect(d.best_runs.length).toBeGreaterThan(0);

      const firstRun = d.best_runs[0]!;
      expect(firstRun.dungeon).toBeTruthy();
      expect(firstRun.keystone_level).toBeGreaterThan(0);
      expect(firstRun.rating).toBeGreaterThan(0);
      expect(firstRun.completed_at).toBeTruthy();
    });

    it("includes Raider.io scores when provided", () => {
      const section = mapMythicPlus(mythicKeystoneSeason, raiderio);
      const d = section.data;

      expect(d.raiderio_score).toBeDefined();
      expect(section.enrichment?.[0]?.available).toBe(true);
    });

    it("works without M+ season data", () => {
      const section = mapMythicPlus();
      const d = section.data as { best_runs: unknown[] };

      expect(d.best_runs).toEqual([]);
      expect(section.enrichment?.[0]?.available).toBe(false);
    });
  });

  describe("mapRaidProgression", () => {
    it("produces valid section with raid data", () => {
      const section = mapRaidProgression(raids);
      const d = section.data as {
        expansions: {
          expansion: string;
          instances: { name: string; modes: unknown[] }[];
        }[];
      };

      expect(d.expansions.length).toBeGreaterThan(0);
      // Most recent expansion should be first (reversed)
      const firstExpansion = d.expansions[0]!;
      expect(firstExpansion.expansion).toBeTruthy();
      expect(firstExpansion.instances.length).toBeGreaterThan(0);

      const firstInstance = firstExpansion.instances[0]!;
      expect(firstInstance.name).toBeTruthy();
      expect(firstInstance.modes.length).toBeGreaterThan(0);
    });

    it("includes Raider.io progression when provided", () => {
      const section = mapRaidProgression(raids, raiderio);
      const d = section.data;

      expect(d.raiderio_progression).toBeDefined();
      const prog = d.raiderio_progression as {
        raid: string;
        summary: string;
        total_bosses: number;
      }[];
      expect(prog.length).toBeGreaterThan(0);
      expect(prog[0]!.raid).toBeTruthy();
      expect(prog[0]!.total_bosses).toBeGreaterThan(0);
    });
  });

  describe("mapProfessions", () => {
    it("produces valid section with profession data", () => {
      const section = mapProfessions(professions);
      const d = section.data as {
        primaries: {
          name: string;
          tiers: { name: string; skill_points: number }[];
        }[];
      };

      expect(d.primaries.length).toBeGreaterThan(0);
      const firstProf = d.primaries[0]!;
      expect(firstProf.name).toBeTruthy();
      expect(firstProf.tiers.length).toBeGreaterThan(0);
      expect(firstProf.tiers[0]!.skill_points).toBeGreaterThan(0);
    });
  });
});
