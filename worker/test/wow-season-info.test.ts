import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSeasonCache, seasonInfoModule } from "../../plugins/wow/reference/season-info";
import { resetTokenCache } from "../../plugins/wow/shared/blizzard-api";

// ---------------------------------------------------------------------------
// Fake Blizzard API responses
// ---------------------------------------------------------------------------

const FAKE_TOKEN_RESPONSE = {
  access_token: "fake-season-token",
  expires_in: 86_400,
};

const FAKE_SEASON_INDEX = {
  seasons: [
    {
      key: {
        href: "https://us.api.blizzard.com/data/wow/mythic-keystone/season/17?namespace=dynamic-us",
      },
      id: 17,
    },
    {
      key: {
        href: "https://us.api.blizzard.com/data/wow/mythic-keystone/season/14?namespace=dynamic-us",
      },
      id: 14,
    },
  ],
  current_season: {
    key: {
      href: "https://us.api.blizzard.com/data/wow/mythic-keystone/season/17?namespace=dynamic-us",
    },
    id: 17,
  },
};

const FAKE_SEASON_DETAIL = {
  id: 17,
  season_name: "Mythic+ Dungeons (Midnight Season 1)",
  periods: [],
};

const FAKE_DUNGEON_INDEX = {
  dungeons: [
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/161" },
      name: "Skyreach",
      id: 161,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/239" },
      name: "Seat of the Triumvirate",
      id: 239,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/402" },
      name: "Algeth'ar Academy",
      id: 402,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/525" },
      name: "Operation: Floodgate",
      id: 525,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/556" },
      name: "Pit of Saron",
      id: 556,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/557" },
      name: "Windrunner Spire",
      id: 557,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/558" },
      name: "Magisters' Terrace",
      id: 558,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/559" },
      name: "Nexus-Point Xenas",
      id: 559,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/560" },
      name: "Maisara Caverns",
      id: 560,
    },
  ],
};

// Dungeon detail responses — tracked = current season pool
const FAKE_DUNGEON_DETAILS: Record<number, { id: number; name: string; is_tracked: boolean }> = {
  161: { id: 161, name: "Skyreach", is_tracked: true },
  239: { id: 239, name: "Seat of the Triumvirate", is_tracked: true },
  402: { id: 402, name: "Algeth'ar Academy", is_tracked: true },
  525: { id: 525, name: "Operation: Floodgate", is_tracked: false },
  556: { id: 556, name: "Pit of Saron", is_tracked: true },
  557: { id: 557, name: "Windrunner Spire", is_tracked: true },
  558: { id: 558, name: "Magisters' Terrace", is_tracked: true },
  559: { id: 559, name: "Nexus-Point Xenas", is_tracked: true },
  560: { id: 560, name: "Maisara Caverns", is_tracked: true },
};

// Based on real API responses
const FAKE_EXPANSION_INDEX = {
  tiers: [
    {
      key: { href: "https://us.api.blizzard.com/data/wow/journal-expansion/503" },
      name: "Dragonflight",
      id: 503,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/journal-expansion/516" },
      name: "Midnight",
      id: 516,
    },
  ],
};

const FAKE_EXPANSION_DETAIL = {
  id: 516,
  name: "Midnight",
  raids: [
    {
      key: { href: "https://us.api.blizzard.com/data/wow/journal-instance/1312" },
      name: "Midnight",
      id: 1312,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/journal-instance/1308" },
      name: "March on Quel'Dans",
      id: 1308,
    },
  ],
};

type FetchInput = string | URL | Request;

function resolveInputUrl(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function makeFetchResponder(): (input: FetchInput, init?: RequestInit) => Promise<Response> {
  return (input: FetchInput) => {
    const url = resolveInputUrl(input);

    if (url.includes("oauth.battle.net/token")) {
      return Promise.resolve(Response.json(FAKE_TOKEN_RESPONSE, { status: 200 }));
    }
    if (url.includes("mythic-keystone/season/index")) {
      return Promise.resolve(Response.json(FAKE_SEASON_INDEX, { status: 200 }));
    }
    if (url.includes("mythic-keystone/season/17")) {
      return Promise.resolve(Response.json(FAKE_SEASON_DETAIL, { status: 200 }));
    }
    if (url.includes("mythic-keystone/dungeon/index")) {
      return Promise.resolve(Response.json(FAKE_DUNGEON_INDEX, { status: 200 }));
    }
    // Individual dungeon detail
    const dungeonMatch = /mythic-keystone\/dungeon\/(\d+)/.exec(url);
    if (dungeonMatch) {
      const id = Number(dungeonMatch[1]);
      const detail = FAKE_DUNGEON_DETAILS[id];
      if (detail) {
        return Promise.resolve(Response.json(detail, { status: 200 }));
      }
    }
    if (url.includes("journal-expansion/index")) {
      return Promise.resolve(Response.json(FAKE_EXPANSION_INDEX, { status: 200 }));
    }
    if (url.includes("journal-expansion/516")) {
      return Promise.resolve(Response.json(FAKE_EXPANSION_DETAIL, { status: 200 }));
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("season_info reference module", () => {
  beforeEach(() => {
    resetTokenCache();
    resetSeasonCache();
    vi.stubGlobal("fetch", vi.fn(makeFetchResponder()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Provide minimal env with Battle.net credentials
  const testEnv = {
    ...env,
    BATTLENET_CLIENT_ID: "test-id",
    BATTLENET_CLIENT_SECRET: "test-secret",
    BATTLENET_REGION: "us",
  };

  it("returns current M+ dungeon pool for type=mythic_plus", async () => {
    const result = await seasonInfoModule.execute({ type: "mythic_plus" }, testEnv);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.season_id).toBe(17);
    expect(data.season_name).toBe("Mythic+ Dungeons (Midnight Season 1)");
    const dungeons = data.dungeons as Record<string, unknown>[];
    // 8 tracked, 1 untracked (Operation: Floodgate)
    expect(dungeons.length).toBe(8);
    expect(dungeons.map((d) => d.name)).toContain("Windrunner Spire");
    expect(dungeons.map((d) => d.name)).toContain("Pit of Saron");
    expect(dungeons.map((d) => d.name)).not.toContain("Operation: Floodgate");
  });

  it("returns overview with season info for type=overview", async () => {
    const result = await seasonInfoModule.execute({ type: "overview" }, testEnv);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.current_season_id).toBe(17);
    expect(data.season_name).toBe("Mythic+ Dungeons (Midnight Season 1)");
    expect(data.mythic_plus).toBeDefined();
    const mp = data.mythic_plus as Record<string, unknown>;
    expect((mp.dungeons as unknown[]).length).toBe(8);
  });

  it("defaults to overview when no type is provided", async () => {
    const result = await seasonInfoModule.execute({}, testEnv);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.current_season_id).toBe(17);
  });

  it("caches season data across calls", async () => {
    const mockFetch = vi.fn(makeFetchResponder());
    vi.stubGlobal("fetch", mockFetch);

    await seasonInfoModule.execute({ type: "mythic_plus" }, testEnv);
    const firstCallCount = mockFetch.mock.calls.length;

    await seasonInfoModule.execute({ type: "mythic_plus" }, testEnv);
    // Should not make additional API calls (cached)
    expect(mockFetch.mock.calls.length).toBe(firstCallCount);
  });

  it("returns current raid tier for type=raids", async () => {
    const result = await seasonInfoModule.execute({ type: "raids" }, testEnv);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.expansion).toBe("Midnight");
    const raids = data.raids as Record<string, unknown>[];
    expect(raids.length).toBe(2);
    expect(raids[0]!.name).toBe("Midnight");
    expect(raids[1]!.name).toBe("March on Quel'Dans");
    // Current raid = last in the array (most recently added)
    expect(data.current_raid).toBe("March on Quel'Dans");
  });

  it("overview includes both M+ and raid data", async () => {
    const result = await seasonInfoModule.execute({ type: "overview" }, testEnv);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    // M+ data present
    expect(data.mythic_plus).toBeDefined();
    // Raid data present
    expect(data.raids).toBeDefined();
    const raids = data.raids as Record<string, unknown>;
    expect(raids.expansion).toBe("Midnight");
    expect((raids.raids as unknown[]).length).toBe(2);
  });

  it("filters out untracked dungeons from previous seasons", async () => {
    const result = await seasonInfoModule.execute({ type: "mythic_plus" }, testEnv);

    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const dungeons = data.dungeons as { id: number; name: string }[];
    // Operation: Floodgate (id 525) is is_tracked: false
    expect(dungeons.find((d) => d.id === 525)).toBeUndefined();
    // All tracked dungeons are present
    expect(dungeons.find((d) => d.id === 557)).toBeDefined();
  });

  it("has correct module metadata", () => {
    expect(seasonInfoModule.id).toBe("season_info");
    expect(seasonInfoModule.name).toBe("Season Info");
    expect(seasonInfoModule.parameters).toBeDefined();
  });
});
