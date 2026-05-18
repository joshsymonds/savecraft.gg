import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { poeAdapter } from "../../plugins/poe/adapter";
import { ensureGggAccessToken } from "../../plugins/poe/adapter/ggg-api";
import characterFixture from "../../plugins/poe/testdata/ggg-character-full.json";
import { AdapterError, type FetchParams } from "../src/adapters/adapter";
import { storePush } from "../src/store";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const POB = "https://pob.savecraft.gg";
const GGG_API = "https://api.pathofexile.com";
const GGG_OAUTH = "https://www.pathofexile.com";

function params(overrides: Partial<FetchParams> = {}): FetchParams {
  return {
    characterId: "ggg-id-1",
    characterName: "BoneShatterJugg",
    region: "pc",
    metadata: {},
    credentials: { accessToken: "valid-token" },
    ...overrides,
  };
}

describe("ensureGggAccessToken", () => {
  afterEach(() => {
    fetchMock.deactivate();
  });

  it("passes through a still-valid token without a refresh call", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const r = await ensureGggAccessToken(
      { accessToken: "tok", refreshToken: "rt", expiresAt: future },
      {} as unknown as Env,
    );
    expect(r.accessToken).toBe("tok");
    expect(r.refreshed).toBeUndefined();
  });

  it("refreshes an expired token and returns the new tokens", async () => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get(GGG_OAUTH)
      .intercept({ path: "/oauth/token", method: "POST" })
      .reply(
        200,
        JSON.stringify({ access_token: "new-acc", refresh_token: "new-ref", expires_in: 3600 }),
        { headers: { "content-type": "application/json" } },
      );
    const r = await ensureGggAccessToken(
      { accessToken: "old", refreshToken: "rt", expiresAt: "2000-01-01T00:00:00Z" },
      { GGG_CLIENT_ID: "c", GGG_CLIENT_SECRET: "s" } as unknown as Env,
    );
    expect(r.accessToken).toBe("new-acc");
    expect(r.refreshed).toEqual({
      accessToken: "new-acc",
      refreshToken: "new-ref",
      expiresAt: expect.any(String),
    });
  });

  it("throws token_expired when expired with no refresh token", async () => {
    await expect(
      ensureGggAccessToken(
        { accessToken: "old", expiresAt: "2000-01-01T00:00:00Z" },
        {} as unknown as Env,
      ),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AdapterError && error.code === "token_expired",
    );
  });

  it("throws token_expired when the refresh request fails", async () => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock.get(GGG_OAUTH).intercept({ path: "/oauth/token", method: "POST" }).reply(400, "bad");
    await expect(
      ensureGggAccessToken(
        { accessToken: "old", refreshToken: "rt", expiresAt: "2000-01-01T00:00:00Z" },
        { GGG_CLIENT_ID: "c", GGG_CLIENT_SECRET: "s" } as unknown as Env,
      ),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AdapterError && error.code === "token_expired",
    );
  });
});

describe("poeAdapter.fetchState", () => {
  beforeEach(cleanAll);
  afterEach(() => {
    fetchMock.deactivate();
  });

  function mockGgg(): void {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get(GGG_API)
      .intercept({ path: "/profile", method: "GET" })
      .reply(200, JSON.stringify({ name: "AccountName" }), {
        headers: { "content-type": "application/json" },
      });
    fetchMock
      .get(GGG_API)
      .intercept({ path: "/character/BoneShatterJugg", method: "GET" })
      .reply(200, JSON.stringify(characterFixture), {
        headers: { "content-type": "application/json" },
      });
  }

  it("maps sections, attaches pob_build, and stashes snapshot data in identity.extra", async () => {
    mockGgg();
    fetchMock
      .get(POB)
      .intercept({ path: "/import", method: "POST" })
      .reply(
        200,
        JSON.stringify({
          buildId: "deadbeefcafe",
          data: { summary: { Life: 5200, CombinedDPS: 1_000_000 } },
          xml: "<PathOfBuilding>snapshot</PathOfBuilding>",
        }),
        { headers: { "content-type": "application/json" } },
      );

    const state = await poeAdapter.fetchState(params(), { ...env, POB_URL: POB } as unknown as Env);

    expect(state.identity.saveName).toBe("BoneShatterJugg");
    expect(state.summary).toContain("Level 92");
    expect(state.sections.character_overview).toBeTruthy();
    expect(state.sections.pob_build!.data.build_id).toBe("deadbeefcafe");
    expect(state.sections.pob_build!.data.Life).toBe(5200);
    expect(state.identity.extra!.pobBuildId).toBe("deadbeefcafe");
    expect(state.identity.extra!.pobXml).toBe("<PathOfBuilding>snapshot</PathOfBuilding>");
    // Raw XML must never appear in a section payload.
    expect(JSON.stringify(state.sections)).not.toContain("<PathOfBuilding>");
  });

  it("partial_failure: pob-server down → raw sections kept, no pob_build, no throw", async () => {
    mockGgg();
    fetchMock.get(POB).intercept({ path: "/import", method: "POST" }).reply(503, "unavailable");

    const state = await poeAdapter.fetchState(params(), { ...env, POB_URL: POB } as unknown as Env);

    expect(state.sections.character_overview).toBeTruthy();
    expect(state.sections.gear).toBeTruthy();
    expect(state.sections.pob_build).toBeUndefined();
    expect(state.identity.extra?.pobXml).toBeUndefined();
    const enrich = state.sections.character_overview!.enrichment;
    expect(enrich?.[0]?.source).toBe("path-of-building");
    expect(enrich?.[0]?.available).toBe(false);
  });
});

describe("storePush poe snapshot persistence", () => {
  beforeEach(cleanAll);

  async function seedSave(): Promise<string> {
    const sourceUuid = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind, can_rescan, can_receive_config) VALUES (?, ?, ?, 'adapter', 0, 0)",
    )
      .bind(sourceUuid, "poe-user", `h-${sourceUuid}`)
      .run();
    return sourceUuid;
  }

  it("upserts poe_build_snapshot and keeps XML out of sections/FTS", async () => {
    const sourceUuid = await seedSave();
    const { saveUuid } = await storePush(
      env,
      "poe-user",
      sourceUuid,
      "poe",
      "BoneShatterJugg",
      "BoneShatterJugg, Level 92 Juggernaut",
      new Date().toISOString(),
      { pob_build: { description: "PoB", data: { build_id: "bid1" } } },
      undefined,
      { pobBuildId: "bid1", pobXml: "<PathOfBuilding>x</PathOfBuilding>" },
    );

    const snap = await env.DB.prepare(
      "SELECT pob_build_id, pob_xml FROM poe_build_snapshot WHERE save_uuid = ?",
    )
      .bind(saveUuid)
      .first<{ pob_build_id: string; pob_xml: string }>();
    expect(snap!.pob_build_id).toBe("bid1");
    expect(snap!.pob_xml).toBe("<PathOfBuilding>x</PathOfBuilding>");

    const secs = await env.DB.prepare("SELECT data FROM sections WHERE save_uuid = ?")
      .bind(saveUuid)
      .all<{ data: string }>();
    for (const row of secs.results) {
      expect(row.data).not.toContain("<PathOfBuilding>");
    }
    const fts = await env.DB.prepare("SELECT content FROM search_index WHERE save_id = ?")
      .bind(saveUuid)
      .all<{ content: string }>();
    for (const row of fts.results) {
      expect(row.content).not.toContain("<PathOfBuilding>");
    }
  });

  it("persists refreshed GGG credentials", async () => {
    const sourceUuid = await seedSave();
    await env.DB.prepare(
      `INSERT INTO game_credentials (user_uuid, game_id, access_token, refresh_token, expires_at)
       VALUES ('poe-user', 'poe', 'old-acc', 'old-ref', '2000-01-01T00:00:00Z')`,
    ).run();

    await storePush(
      env,
      "poe-user",
      sourceUuid,
      "poe",
      "Char2",
      "summary",
      new Date().toISOString(),
      { character_overview: { description: "o", data: {} } },
      undefined,
      {
        refreshedCreds: {
          accessToken: "fresh-acc",
          refreshToken: "fresh-ref",
          expiresAt: "2099-01-01T00:00:00Z",
        },
      },
    );

    const cred = await env.DB.prepare(
      "SELECT access_token, refresh_token FROM game_credentials WHERE user_uuid = 'poe-user' AND game_id = 'poe'",
    ).first<{ access_token: string; refresh_token: string }>();
    expect(cred!.access_token).toBe("fresh-acc");
    expect(cred!.refresh_token).toBe("fresh-ref");
  });
});
