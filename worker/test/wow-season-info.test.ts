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
        href: "https://us.api.blizzard.com/data/wow/mythic-keystone/season/14?namespace=dynamic-us",
      },
      id: 14,
    },
    {
      key: {
        href: "https://us.api.blizzard.com/data/wow/mythic-keystone/season/13?namespace=dynamic-us",
      },
      id: 13,
    },
  ],
  current_season: {
    key: {
      href: "https://us.api.blizzard.com/data/wow/mythic-keystone/season/14?namespace=dynamic-us",
    },
    id: 14,
  },
};

const FAKE_SEASON_DETAIL = {
  id: 14,
  season_name: { en_US: "Season 2" },
  periods: [],
  dungeons: [
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/500" },
      name: { en_US: "Ara-Kara, City of Echoes" },
      id: 500,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/504" },
      name: { en_US: "Cinderbrew Meadery" },
      id: 504,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/525" },
      name: { en_US: "Darkflame Cleft" },
      id: 525,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/dungeon/370" },
      name: { en_US: "Operation: Mechagon - Workshop" },
      id: 370,
    },
  ],
};

const FAKE_EXPANSION_INDEX = {
  tiers: [
    { key: { href: "https://us.api.blizzard.com/data/wow/journal-expansion/395" }, name: "The War Within", id: 395 },
    { key: { href: "https://us.api.blizzard.com/data/wow/journal-expansion/503" }, name: "Midnight", id: 503 },
  ],
};

const FAKE_EXPANSION_DETAIL = {
  id: 503,
  name: "Midnight",
  raids: [
    {
      key: { href: "https://us.api.blizzard.com/data/wow/journal-instance/1296" },
      name: "Priory of the Sacred Flame",
      id: 1296,
    },
    {
      key: { href: "https://us.api.blizzard.com/data/wow/journal-instance/1304" },
      name: "Tomb of Sargeras",
      id: 1304,
    },
  ],
  dungeons: [
    {
      key: { href: "https://us.api.blizzard.com/data/wow/journal-instance/1297" },
      name: "Ara-Kara, City of Echoes",
      id: 1297,
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
    if (url.includes("mythic-keystone/season?") || url.includes("mythic-keystone/season/index")) {
      return Promise.resolve(Response.json(FAKE_SEASON_INDEX, { status: 200 }));
    }
    if (url.includes("mythic-keystone/season/14")) {
      return Promise.resolve(Response.json(FAKE_SEASON_DETAIL, { status: 200 }));
    }
    if (url.includes("journal-expansion/index") || url.includes("journal-expansion?")) {
      return Promise.resolve(Response.json(FAKE_EXPANSION_INDEX, { status: 200 }));
    }
    if (url.includes("journal-expansion/503")) {
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
    expect(data.season_id).toBe(14);
    const dungeons = data.dungeons as Record<string, unknown>[];
    expect(dungeons.length).toBe(4);
    expect(dungeons[0]!.name).toBe("Ara-Kara, City of Echoes");
    expect(dungeons[1]!.name).toBe("Cinderbrew Meadery");
  });

  it("returns overview with season info for type=overview", async () => {
    const result = await seasonInfoModule.execute({ type: "overview" }, testEnv);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.current_season_id).toBe(14);
    expect(data.mythic_plus).toBeDefined();
    const mp = data.mythic_plus as Record<string, unknown>;
    expect((mp.dungeons as unknown[]).length).toBe(4);
  });

  it("defaults to overview when no type is provided", async () => {
    const result = await seasonInfoModule.execute({}, testEnv);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.current_season_id).toBe(14);
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
    const raids = data.raids as Array<Record<string, unknown>>;
    expect(raids.length).toBe(2);
    expect(raids[0]!.name).toBe("Priory of the Sacred Flame");
    expect(raids[1]!.name).toBe("Tomb of Sargeras");
    expect(data.current_raid).toBe("Tomb of Sargeras");
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
    expect(raids.current_raid).toBe("Tomb of Sargeras");
  });

  it("has correct module metadata", () => {
    expect(seasonInfoModule.id).toBe("season_info");
    expect(seasonInfoModule.name).toBe("Season Info");
    expect(seasonInfoModule.parameters).toBeDefined();
  });
});
