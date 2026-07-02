import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { poe2Adapter } from "../../plugins/poe2/adapter";
import characterFixture from "../../plugins/poe2/testdata/ggg-poe2-character-full.json";
import type { FetchParams } from "../src/adapters/adapter";
import type { Env } from "../src/types";

import { cleanAll, mockFetch } from "./helpers";

const GGG_API = "https://api.pathofexile.com";

function params(overrides: Partial<FetchParams> = {}): FetchParams {
  return {
    characterId: "1111111111111111111111111111111111111111111111111111111111111111",
    characterName: "InfernalConcoction",
    region: "poe2",
    metadata: {},
    credentials: { accessToken: "valid-token" },
    ...overrides,
  };
}

describe("poe2Adapter.fetchState", () => {
  beforeEach(cleanAll);
  afterEach(() => {
    mockFetch.deactivate();
  });

  function mockGgg(): void {
    mockFetch.activate();
    mockFetch
      .get(GGG_API)
      .intercept({ path: "/profile", method: "GET" })
      .reply(200, JSON.stringify({ name: "AccountName" }), {
        headers: { "content-type": "application/json" },
      });
    // GGG's GET /character/poe2/<name> wraps the character in a
    // { "character": {...} } envelope, same as PoE1's /character/<name>.
    // The fixture file is the bare inner character; the HTTP mock wraps
    // it to mirror the real API response shape.
    mockFetch
      .get(GGG_API)
      .intercept({ path: "/character/poe2/InfernalConcoction", method: "GET" })
      .reply(200, JSON.stringify({ character: characterFixture }), {
        headers: { "content-type": "application/json" },
      });
  }

  it("maps all four sections with real values, and produces the correct summary", async () => {
    mockGgg();

    const state = await poe2Adapter.fetchState(params(), env as unknown as Env);

    expect(state.identity.saveName).toBe("InfernalConcoction");
    expect(state.identity.gameId).toBe("poe2");
    expect(state.summary).toBe("InfernalConcoction, Level 87 Chronomancer");

    // Regression guard: an unwrapped envelope yields an all-undefined
    // character whose mappers still produce structurally-valid but EMPTY
    // sections. Assert the real character actually flowed through.
    expect(state.sections.character_overview!.data.name).toBe("InfernalConcoction");
    expect(state.sections.character_overview!.data.class).toBe("Chronomancer");

    const gearItems = state.sections.gear!.data.items as Record<string, unknown>[];
    expect(gearItems.length).toBeGreaterThan(0);
    expect(gearItems.some((item) => item.name === "Timeless Warden")).toBe(true);

    const bindings = state.sections.skills!.data.bindings as Record<string, unknown>[];
    expect(bindings.length).toBeGreaterThan(0);
    expect(bindings.some((b) => b.skill === "Explosive Concoction")).toBe(true);

    expect(state.sections.passives!.data.allocated as number).toBeGreaterThan(0);
    expect(state.sections.passives!.data.specialisations).toEqual({ set1: 3, set2: 2 });

    // Epic anti-pattern guards: no inventory (GGG doesn't return it for
    // PoE2), no pob_build (PoB2 enrichment is a separate future epic).
    expect(state.sections.inventory).toBeUndefined();
    expect(state.sections.pob_build).toBeUndefined();
    expect(Object.keys(state.sections).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "character_overview",
      "gear",
      "passives",
      "skills",
    ]);
  });

  it("returns refreshed GGG creds in identity.extra when the token was expired (persistence deferred)", async () => {
    // mockGgg() calls mockFetch.activate() (which clears any queued
    // replies) — queue the token-refresh reply AFTER it, not before.
    mockGgg();
    mockFetch
      .get("https://www.pathofexile.com")
      .intercept({ path: "/oauth/token", method: "POST" })
      .reply(
        200,
        JSON.stringify({ access_token: "new-acc", refresh_token: "new-ref", expires_in: 3600 }),
        { headers: { "content-type": "application/json" } },
      );

    const state = await poe2Adapter.fetchState(
      params({
        credentials: {
          accessToken: "old",
          refreshToken: "rt",
          expiresAt: "2000-01-01T00:00:00Z",
        },
      }),
      { ...env, GGG_CLIENT_ID: "c", GGG_CLIENT_SECRET: "s" } as unknown as Env,
    );

    // fetchState surfaces refreshed creds in identity.extra exactly like
    // poe's does. Unlike poe, storePush's postPushHooks only persists
    // this for gameId === "poe" (see worker/src/store.ts) — poe2's
    // provider_credentials persistence is deferred to the next task, once
    // poe2 is wired into providerForGame/OAUTH_PROVIDERS for multi-game
    // ggg discovery. This assertion only covers what fetchState returns.
    expect(state.identity.extra?.refreshedCreds).toEqual({
      accessToken: "new-acc",
      refreshToken: "new-ref",
      expiresAt: expect.any(String),
    });
  });
});
