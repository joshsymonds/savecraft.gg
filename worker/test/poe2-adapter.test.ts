import { afterEach, describe, expect, it } from "vitest";

import { poe2Adapter } from "../../plugins/poe2/adapter";
import {
  mapCharacterOverview,
  mapGear,
  mapPassives,
  mapSkills,
} from "../../plugins/poe2/adapter/sections";
import type { Poe2Character } from "../../plugins/poe2/adapter/types";
import characterFixture from "../../plugins/poe2/testdata/ggg-poe2-character-full.json";
import characterListFixture from "../../plugins/poe2/testdata/ggg-poe2-character-list.json";
import { AdapterError } from "../src/adapters/adapter";
import { adapters } from "../src/adapters/registry";
import type { Env } from "../src/types";

import { mockFetch } from "./helpers";

const char = characterFixture as unknown as Poe2Character;
const env = { GGG_CLIENT_ID: "test-client" } as unknown as Env;

describe("PoE2 adapter identity", () => {
  it("is registered as 'poe2' and implements ApiAdapter identity", () => {
    expect(adapters.poe2).toBe(poe2Adapter);
    expect(poe2Adapter.gameId).toBe("poe2");
    expect(poe2Adapter.gameName).toBe("Path of Exile 2");
  });

  it("getOAuthConfig returns the shared GGG endpoints, both scopes, and the env clientId", () => {
    const cfg = poe2Adapter.getOAuthConfig("poe2", env);
    expect(cfg.authorizeUrl).toBe("https://www.pathofexile.com/oauth/authorize");
    expect(cfg.tokenUrl).toBe("https://www.pathofexile.com/oauth/token");
    expect(cfg.scopes).toEqual(["account:characters", "account:profile"]);
    expect(cfg.clientId).toBe("test-client");
    expect(cfg.userAgent).toBe("OAuth savecraft/1.0 (contact: oauth@savecraft.gg)");
  });

  it("getOAuthConfig clientId is empty string when env var is unset", () => {
    const cfg = poe2Adapter.getOAuthConfig("poe2", {} as unknown as Env);
    expect(cfg.clientId).toBe("");
  });
});

describe("PoE2 discoverSaves", () => {
  afterEach(() => {
    mockFetch.deactivate();
  });

  function mockCharacterList(): void {
    mockFetch.activate();
    mockFetch
      .get("https://api.pathofexile.com")
      .intercept({ path: "/character/poe2", method: "GET" })
      .reply(200, JSON.stringify(characterListFixture), {
        headers: { "content-type": "application/json" },
      });
  }

  it("maps non-deleted characters and drops deleted ones", async () => {
    mockCharacterList();
    const saves = await poe2Adapter.discoverSaves("tok", "poe2");

    expect(saves).toHaveLength(2);
    const char1 = saves.find((s) => s.displayName === "InfernalConcoction")!;
    expect(char1).toBeTruthy();
    expect(char1.characterId).toBe(
      "1111111111111111111111111111111111111111111111111111111111111111",
    );
    expect(char1.saveName).toBe("InfernalConcoction");
    expect(char1.metadata.class).toBe("Chronomancer");
    expect(char1.metadata.league).toBe("Standard");
    expect(char1.metadata.level).toBe(87);
    expect(char1.metadata.realm).toBe("poe2");
    expect(saves.some((s) => s.displayName === "DeletedAlt")).toBe(false);
  });

  it("maps 401 to token_expired", async () => {
    mockFetch.activate();
    mockFetch
      .get("https://api.pathofexile.com")
      .intercept({ path: "/character/poe2", method: "GET" })
      .reply(401, "Unauthorized");

    await expect(poe2Adapter.discoverSaves("bad", "poe2")).rejects.toSatisfy(
      (error: unknown) => error instanceof AdapterError && error.code === "token_expired",
    );
  });

  it("maps 429 to rate_limited with Retry-After", async () => {
    mockFetch.activate();
    mockFetch
      .get("https://api.pathofexile.com")
      .intercept({ path: "/character/poe2", method: "GET" })
      .reply(429, "Too Many Requests", { headers: { "Retry-After": "12" } });

    await expect(poe2Adapter.discoverSaves("tok", "poe2")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AdapterError && error.code === "rate_limited" && error.retryAfter === 12,
    );
  });

  it("falls back to the fixed poe2 realm when GGG omits realm, regardless of caller region", async () => {
    mockFetch.activate();
    mockFetch
      .get("https://api.pathofexile.com")
      .intercept({ path: "/character/poe2", method: "GET" })
      .reply(
        200,
        JSON.stringify({
          characters: [
            {
              id: "4444444444444444444444444444444444444444444444444444444444444444",
              name: "NoRealmChar",
              class: "Witch",
              league: "Standard",
              level: 10,
              expired: false,
              deleted: false,
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );

    // A poe-card connect passes region="pc" (GGG's default region) into
    // poe2's discoverSaves — the realm must still resolve to poe2's fixed
    // realm, never the caller's region.
    const saves = await poe2Adapter.discoverSaves("tok", "pc");
    expect(saves).toHaveLength(1);
    expect(saves[0]!.metadata.realm).toBe("poe2");
  });
});

describe("PoE2 section mappers", () => {
  it("mapCharacterOverview", () => {
    const s = mapCharacterOverview(char);
    expect(s.description).toBeTruthy();
    expect(s.data.name).toBe("InfernalConcoction");
    expect(s.data.class).toBe("Chronomancer");
    expect(s.data.league).toBe("Standard");
    expect(s.data.level).toBe(87);
    expect(s.data.realm).toBe("poe2");
  });

  it("mapGear surfaces socket types and rune mods", () => {
    const s = mapGear(char);
    const items = s.data.items as Record<string, unknown>[];
    expect(items.length).toBe(4);

    const weapon = items.find((it) => it.slot === "Weapon")!;
    expect(weapon).toBeTruthy();
    expect(weapon.name).toBe("Timeless Warden");
    expect(weapon.base).toBe("Expert Bone Sabre");
    const weaponSockets = weapon.sockets as Record<string, unknown>[];
    expect(weaponSockets.length).toBe(2);
    expect(weaponSockets[0]!.type).toBe("rune");
    expect(weaponSockets[0]!.item).toBe("rune");
    expect(weapon.runeMods).toEqual([
      "+16 to Strength",
      "Gain 5% of Physical Damage as Extra Lightning Damage",
    ]);

    const body = items.find((it) => it.slot === "BodyArmour")!;
    expect(body).toBeTruthy();
    const bodySockets = body.sockets as Record<string, unknown>[];
    expect(bodySockets.length).toBe(1);
    expect(bodySockets[0]!.type).toBe("jewel");
    expect(bodySockets[0]!.item).toBe("ruby");
    expect(body.runeMods).toEqual([]);

    const gloves = items.find((it) => it.slot === "Gloves")!;
    expect(gloves).toBeTruthy();
    expect((gloves.sockets as unknown[]).length).toBe(0);
  });

  it("mapGear surfaces desecrated/bonded/enchant/fractured/crafted/mutated mods for an item whose implicit/explicit arrays are empty", () => {
    // Regression fixture: a production rare helmet ("Grinning Mask", Wrath
    // Crown base) whose implicit/explicit arrays are empty but which
    // carries mods in the previously-unread GGG fields.
    const s = mapGear(char);
    const items = s.data.items as Record<string, unknown>[];

    const helm = items.find((it) => it.slot === "Helmet")!;
    expect(helm).toBeTruthy();
    expect(helm.name).toBe("Grinning Mask");
    expect(helm.implicits).toEqual([]);
    expect(helm.explicits).toEqual([]);
    expect(helm.desecratedMods).toEqual([
      "+1 to Level of all Minion Skills",
      "Nearby Enemies have -9% to Chaos Resistance",
    ]);
    expect(helm.bondedMods).toEqual(["Bonded: +40% increased Spirit"]);
    expect(helm.enchantMods).toEqual(["Grants Skill: Rejuvenation Totem"]);
    expect(helm.fracturedMods).toEqual(["+62 to maximum Energy Shield"]);
    expect(helm.craftedMods).toEqual(["+15% to Chaos Resistance"]);
    expect(helm.mutatedMods).toEqual(["Vaal Unique: 30% increased Effect of Non-Damaging Ailments"]);
  });

  it("mapGear omits mod-array keys that are empty (only present when non-empty)", () => {
    const s = mapGear(char);
    const items = s.data.items as Record<string, unknown>[];

    // The weapon has runeMods (existing precedent: always present, even
    // empty) but no desecrated/bonded/enchant/fractured/crafted/mutated
    // mods — those new keys must be omitted entirely, not emitted empty.
    const weapon = items.find((it) => it.slot === "Weapon")!;
    expect(weapon.runeMods).toEqual([
      "+16 to Strength",
      "Gain 5% of Physical Damage as Extra Lightning Damage",
    ]);
    expect(weapon).not.toHaveProperty("desecratedMods");
    expect(weapon).not.toHaveProperty("bondedMods");
    expect(weapon).not.toHaveProperty("enchantMods");
    expect(weapon).not.toHaveProperty("fracturedMods");
    expect(weapon).not.toHaveProperty("craftedMods");
    expect(weapon).not.toHaveProperty("mutatedMods");
  });

  it("mapSkills surfaces gem/skill names from gemTabs + gemSockets", () => {
    const s = mapSkills(char);
    const bindings = s.data.bindings as Record<string, unknown>[];
    expect(bindings.length).toBe(2);

    const concoction = bindings.find((b) => b.skill === "Explosive Concoction")!;
    expect(concoction).toBeTruthy();
    expect(concoction.gemSockets).toBe(2);
    const tabs = concoction.tabs as Record<string, unknown>[];
    expect(tabs[0]!.name).toBe("Loadout 1");
    expect(tabs[0]!.pages).toEqual(["Explosive Concoction"]);
    expect(concoction.supports).toEqual([{ name: "Volatility Support", level: "18" }]);

    const bell = bindings.find((b) => b.skill === "Tempest Bell")!;
    expect(bell).toBeTruthy();
    expect(bell.gemSockets).toBe(1);
    expect(bell.supports).toEqual([]);
  });

  it("mapSkills surfaces gem level/quality from the item's properties", () => {
    const s = mapSkills(char);
    const bindings = s.data.bindings as Record<string, unknown>[];

    const concoction = bindings.find((b) => b.skill === "Explosive Concoction")!;
    expect(concoction.level).toBe("18");
    expect(concoction.quality).toBe("+14%");

    const bell = bindings.find((b) => b.skill === "Tempest Bell")!;
    expect(bell.level).toBe("12");
    expect(bell.quality).toBeUndefined();
  });

  it("mapSkills derives gemSockets as a count from the GGG string-array shape", () => {
    const s = mapSkills(char);
    const bindings = s.data.bindings as Record<string, unknown>[];

    // Fixture encodes gemSockets as GGG's documented ?array of string
    // (each entry always "W"), not a number — the section still emits a
    // numeric count under the same "gemSockets" key.
    const concoction = bindings.find((b) => b.skill === "Explosive Concoction")!;
    expect(concoction.gemSockets).toBe(2);

    const bell = bindings.find((b) => b.skill === "Tempest Bell")!;
    expect(bell.gemSockets).toBe(1);
  });

  it("mapSkills surfaces grantedSkills as name/values pairs", () => {
    const s = mapSkills(char);
    const bindings = s.data.bindings as Record<string, unknown>[];

    const concoction = bindings.find((b) => b.skill === "Explosive Concoction")!;
    expect(concoction.grantedSkills).toEqual([
      { name: "Grants Skill: Flammability", values: ["Level 12"] },
    ]);

    const bell = bindings.find((b) => b.skill === "Tempest Bell")!;
    expect(bell.grantedSkills).toEqual([]);
  });

  it("mapPassives surfaces specialisation sets and allocated count from hashes", () => {
    const s = mapPassives(char);
    expect(s.data.allocated).toBe(10); // passives.hashes.length
    expect(s.data.specialisations).toEqual({ set1: 3, set2: 2 });
  });

  it("mapPassives surfaces the allocated node hashes and per-specialisation hash arrays, not just counts", () => {
    const s = mapPassives(char);
    expect(s.data.hashes).toEqual([1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010]);
    expect(s.data.specialisationHashes).toEqual({
      set1: [2001, 2002, 2003],
      set2: [2101, 2102],
    });
    // Counts are still present alongside the hash arrays.
    expect(s.data.allocated).toBe(10);
    expect(s.data.specialisations).toEqual({ set1: 3, set2: 2 });
  });

  it("mapPassives description does not reference the nonexistent build_planner module", () => {
    const s = mapPassives(char);
    expect(s.description).not.toContain("build_planner");
  });

  it("handles a minimal character without throwing", () => {
    const minimal = {
      name: "Empty",
      class: "Witch",
      league: "Standard",
      level: 1,
    } as Poe2Character;
    expect(() => mapCharacterOverview(minimal)).not.toThrow();
    expect((mapGear(minimal).data.items as unknown[]).length).toBe(0);
    expect((mapSkills(minimal).data.bindings as unknown[]).length).toBe(0);
    expect(mapPassives(minimal).data.allocated).toBe(0);
    expect(mapPassives(minimal).data.specialisations).toEqual({});
  });
});
