import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { poeAdapter } from "../../plugins/poe/adapter";
import characterFixture from "../../plugins/poe/testdata/ggg-character-full.json";
import { AdapterError, type FetchParams, type GameCredentials } from "../src/adapters/adapter";
import { ensureGggAccessToken } from "../src/adapters/ggg";
import { storePush } from "../src/store";
import type { Env } from "../src/types";

import { mockFetch } from "./helpers";
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
    persistCredentials: () => Promise.resolve(),
    ...overrides,
  };
}

/** Hand-written capture for the persistCredentials callback. */
function credentialSink(): {
  persisted: GameCredentials[];
  persist: (creds: GameCredentials) => Promise<void>;
} {
  const persisted: GameCredentials[] = [];
  return {
    persisted,
    persist: (creds: GameCredentials) => {
      persisted.push(creds);
      return Promise.resolve();
    },
  };
}

describe("ensureGggAccessToken", () => {
  afterEach(() => {
    mockFetch.deactivate();
  });

  it("passes through a still-valid token without a refresh call", async () => {
    const sink = credentialSink();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const accessToken = await ensureGggAccessToken(
      { accessToken: "tok", refreshToken: "rt", expiresAt: future },
      {} as unknown as Env,
      sink.persist,
    );
    expect(accessToken).toBe("tok");
    expect(sink.persisted).toEqual([]);
  });

  it("refreshes an expired token and persists the rotated credentials before returning", async () => {
    mockFetch.activate();
    mockFetch
      .get(GGG_OAUTH)
      .intercept({ path: "/oauth/token", method: "POST" })
      .reply(
        200,
        JSON.stringify({ access_token: "new-acc", refresh_token: "new-ref", expires_in: 3600 }),
        { headers: { "content-type": "application/json" } },
      );
    const sink = credentialSink();
    const accessToken = await ensureGggAccessToken(
      { accessToken: "old", refreshToken: "rt", expiresAt: "2000-01-01T00:00:00Z" },
      { GGG_CLIENT_ID: "c", GGG_CLIENT_SECRET: "s" } as unknown as Env,
      sink.persist,
    );
    expect(accessToken).toBe("new-acc");
    // GGG invalidated the old refresh token the moment the exchange
    // succeeded — the rotated pair must be persisted before return.
    expect(sink.persisted).toEqual([
      { accessToken: "new-acc", refreshToken: "new-ref", expiresAt: expect.any(String) },
    ]);
  });

  it("keeps the old refresh token when the exchange response omits one", async () => {
    mockFetch.activate();
    mockFetch
      .get(GGG_OAUTH)
      .intercept({ path: "/oauth/token", method: "POST" })
      .reply(200, JSON.stringify({ access_token: "new-acc", expires_in: 3600 }), {
        headers: { "content-type": "application/json" },
      });
    const sink = credentialSink();
    await ensureGggAccessToken(
      { accessToken: "old", refreshToken: "rt", expiresAt: "2000-01-01T00:00:00Z" },
      { GGG_CLIENT_ID: "c", GGG_CLIENT_SECRET: "s" } as unknown as Env,
      sink.persist,
    );
    expect(sink.persisted[0]!.refreshToken).toBe("rt");
  });

  it("throws api_unavailable when a refresh is needed but GGG credentials are unset", async () => {
    await expect(
      ensureGggAccessToken(
        { accessToken: "old", refreshToken: "rt", expiresAt: "2000-01-01T00:00:00Z" },
        {} as unknown as Env,
        () => Promise.resolve(),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AdapterError && error.code === "api_unavailable",
    );
  });

  it("throws token_expired when expired with no refresh token", async () => {
    await expect(
      ensureGggAccessToken(
        { accessToken: "old", expiresAt: "2000-01-01T00:00:00Z" },
        {} as unknown as Env,
        () => Promise.resolve(),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AdapterError && error.code === "token_expired",
    );
  });

  it("throws token_expired when the refresh request fails", async () => {
    mockFetch.activate();
    mockFetch.get(GGG_OAUTH).intercept({ path: "/oauth/token", method: "POST" }).reply(400, "bad");
    const sink = credentialSink();
    await expect(
      ensureGggAccessToken(
        { accessToken: "old", refreshToken: "rt", expiresAt: "2000-01-01T00:00:00Z" },
        { GGG_CLIENT_ID: "c", GGG_CLIENT_SECRET: "s" } as unknown as Env,
        sink.persist,
      ),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AdapterError && error.code === "token_expired",
    );
    expect(sink.persisted).toEqual([]);
  });
});

describe("poeAdapter.fetchState", () => {
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
    // GGG's GET /character/<name> wraps the character in a
    // { "character": {...} } envelope (verified live). The fixture file
    // is the bare inner character (shared with the section-mapper unit
    // tests); the HTTP mock must wrap it to mirror the real API.
    mockFetch
      .get(GGG_API)
      .intercept({ path: "/character/BoneShatterJugg", method: "GET" })
      .reply(200, JSON.stringify({ character: characterFixture }), {
        headers: { "content-type": "application/json" },
      });
  }

  it("maps sections, attaches pob_build, and stashes snapshot data in identity.extra", async () => {
    mockGgg();
    mockFetch
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
    // Regression guard: an unwrapped envelope yields an all-undefined
    // character whose mappers still produce structurally-valid but
    // EMPTY sections. Assert the real character actually flowed through.
    expect(state.sections.character_overview!.data.name).toBe("BoneShatterJugg");
    expect((state.sections.gear!.data.items as unknown[]).length).toBeGreaterThan(0);
    expect((state.sections.jewels!.data.jewels as unknown[]).length).toBeGreaterThan(0);
    expect(state.sections.passives!.data.allocated as number).toBeGreaterThan(0);
    expect(state.sections.character_overview).toBeTruthy();
    expect(state.sections.pob_build!.data.build_id).toBe("deadbeefcafe");
    expect(state.sections.pob_build!.data.Life).toBe(5200);
    expect(state.identity.extra!.pobBuildId).toBe("deadbeefcafe");
    expect(state.identity.extra!.pobXml).toBe("<PathOfBuilding>snapshot</PathOfBuilding>");
    // Raw XML must never appear in a section payload.
    expect(JSON.stringify(state.sections)).not.toContain("<PathOfBuilding>");
  });

  it('sends game:"poe" in the pob-server /import request body', async () => {
    mockGgg();
    mockFetch
      .get(POB)
      .intercept({ path: "/import", method: "POST" })
      .reply(
        200,
        JSON.stringify({
          buildId: "deadbeefcafe",
          data: { summary: {} },
          xml: "<PathOfBuilding>snapshot</PathOfBuilding>",
        }),
        { headers: { "content-type": "application/json" } },
      );

    // mockFetch.activate() (inside mockGgg()) already installed its own
    // globalThis.fetch replacement; spy on top of it so requests still
    // resolve via the mock while we capture the actual call args — the
    // shared MockFetch helper has no built-in body-capture support.
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await poeAdapter.fetchState(params(), { ...env, POB_URL: POB } as unknown as Env);

    const importCall = fetchSpy.mock.calls.find(([input]) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.includes("/import");
    });
    expect(importCall).toBeDefined();
    const [, init] = importCall!;
    const body = JSON.parse(init!.body as string) as { game?: string; character?: unknown };
    expect(body.game).toBe("poe");
    expect(body.character).toBeTruthy();

    fetchSpy.mockRestore();
  });

  it("partial_failure: pob-server down → raw sections kept, no pob_build, no throw", async () => {
    mockGgg();
    mockFetch.get(POB).intercept({ path: "/import", method: "POST" }).reply(503, "unavailable");

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

  it("ignores a stale refreshedCreds-shaped extra key — credentials persist only via persistCredentials", async () => {
    const sourceUuid = await seedSave();
    await env.DB.prepare(
      `INSERT INTO provider_credentials (user_uuid, provider, access_token, refresh_token, expires_at)
       VALUES ('poe-user', 'ggg', 'old-acc', 'old-ref', '2000-01-01T00:00:00Z')`,
    ).run();

    // Rotated tokens are persisted at refresh time through
    // FetchParams.persistCredentials, never post-push — a GameState
    // smuggling the legacy extra key must not touch provider_credentials.
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
          accessToken: "smuggled-acc",
          refreshToken: "smuggled-ref",
          expiresAt: "2099-01-01T00:00:00Z",
        },
      },
    );

    const cred = await env.DB.prepare(
      "SELECT access_token, refresh_token FROM provider_credentials WHERE user_uuid = 'poe-user' AND provider = 'ggg'",
    ).first<{ access_token: string; refresh_token: string }>();
    expect(cred!.access_token).toBe("old-acc");
    expect(cred!.refresh_token).toBe("old-ref");
  });
});
