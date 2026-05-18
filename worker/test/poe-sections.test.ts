import { describe, expect, it } from "vitest";

import {
  buildPobSection,
  mapCharacterOverview,
  mapGear,
  mapJewels,
  mapPassives,
  mapSkills,
} from "../../plugins/poe/adapter/sections";
import type { GggCharacter } from "../../plugins/poe/adapter/types";
import characterFixture from "../../plugins/poe/testdata/ggg-character-full.json";

const char = characterFixture as unknown as GggCharacter;

describe("PoE section mappers", () => {
  it("mapCharacterOverview", () => {
    const s = mapCharacterOverview(char);
    expect(s.description).toBeTruthy();
    expect(s.data.name).toBe("BoneShatterJugg");
    expect(s.data.class).toBe("Juggernaut");
    expect(s.data.league).toBe("Standard");
    expect(s.data.level).toBe(92);
  });

  it("mapGear lists equipped items by slot", () => {
    const s = mapGear(char);
    const items = s.data.items as Record<string, unknown>[];
    expect(items.length).toBe(2);
    const weapon = items.find((it) => it.slot === "Weapon");
    expect(weapon).toBeTruthy();
    expect(weapon!.name).toBe("Brutal Reckoning");
    expect(weapon!.base).toBe("Karui Maul");
  });

  it("mapPassives summarizes the tree without raw hashes", () => {
    const s = mapPassives(char);
    expect(s.data.allocated).toBe(8); // passives.hashes.length
    // Raw hash list must NOT be surfaced verbatim.
    expect(JSON.stringify(s.data)).not.toContain("50459");
  });

  it("mapSkills extracts socket groups with gems", () => {
    const s = mapSkills(char);
    const groups = s.data.groups as Record<string, unknown>[];
    expect(groups.length).toBeGreaterThanOrEqual(1);
    const gems = groups[0]!.gems as Record<string, unknown>[];
    const boneshatter = gems.find((g) => g.name === "Boneshatter");
    expect(boneshatter).toBeTruthy();
    expect(boneshatter!.level).toBe(20);
    expect(boneshatter!.support).toBe(false);
    expect(gems.some((g) => g.support === true)).toBe(true);
  });

  it("mapJewels lists socketed jewels", () => {
    const s = mapJewels(char);
    const jewels = s.data.jewels as Record<string, unknown>[];
    expect(jewels.length).toBe(1);
    expect(jewels[0]!.name).toBe("Brutal Restraint");
  });

  it("buildPobSection exposes build_id + summary, never XML", () => {
    const s = buildPobSection("abc123def456", {
      Life: 5200,
      CombinedDPS: 1_250_000,
    });
    expect(s.data.build_id).toBe("abc123def456");
    expect(s.data.Life).toBe(5200);
    expect(s.data.CombinedDPS).toBe(1_250_000);
    const serialized = JSON.stringify(s).toLowerCase();
    expect(serialized).not.toContain("<pathofbuilding");
    expect(serialized).not.toContain("pob_xml");
    expect(serialized).not.toContain('"xml"');
  });

  it("handles a minimal character without throwing", () => {
    const minimal = { name: "Empty", class: "Scion", league: "Standard", level: 1 } as GggCharacter;
    expect(() => mapCharacterOverview(minimal)).not.toThrow();
    expect((mapGear(minimal).data.items as unknown[]).length).toBe(0);
    expect((mapJewels(minimal).data.jewels as unknown[]).length).toBe(0);
    expect((mapSkills(minimal).data.groups as unknown[]).length).toBe(0);
    expect(mapPassives(minimal).data.allocated).toBe(0);
  });
});
