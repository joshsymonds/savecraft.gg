import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seasonInfoModule } from "../../plugins/wow/reference/season-info";
import { resetTokenCache } from "../../plugins/wow/shared/blizzard-api";

// ---------------------------------------------------------------------------
// Fake Blizzard API responses
// ---------------------------------------------------------------------------

const FAKE_TOKEN_RESPONSE = {
  access_token: "fake-season-token",
  expires_in: 86400,
};

const FAKE_SEASON_INDEX = {
  seasons: [
    { key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/season/14?namespace=dynamic-us" }, id: 14 },
    { key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/season/13?namespace=dynamic-us" }, id: 13 },
  ],
  current_season: {
    key: { href: "https://us.api.blizzard.com/data/wow/mythic-keystone/season/14?namespace=dynamic-us" },
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

function makeFetchResponder(): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("oauth.battle.net/token")) {
      return new Response(JSON.stringify(FAKE_TOKEN_RESPONSE), { status: 200 });
    }
    if (url.includes("mythic-keystone/season/index") || url.match(/mythic-keystone\/season\?/)) {
      return new Response(JSON.stringify(FAKE_SEASON_INDEX), { status: 200 });
    }
    if (url.includes("mythic-keystone/season/14")) {
      return new Response(JSON.stringify(FAKE_SEASON_DETAIL), { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("season_info reference module", () => {
  beforeEach(() => {
    resetTokenCache();
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
    const dungeons = data.dungeons as Array<Record<string, unknown>>;
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

  it("has correct module metadata", () => {
    expect(seasonInfoModule.id).toBe("season_info");
    expect(seasonInfoModule.name).toBe("Season Info");
    expect(seasonInfoModule.parameters).toBeDefined();
  });
});
