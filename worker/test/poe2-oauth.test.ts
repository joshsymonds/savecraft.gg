import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import poe2CharacterListFixture from "../../plugins/poe2/testdata/ggg-poe2-character-list.json";
import characterListFixture from "../../plugins/poe/testdata/ggg-character-list.json";
import { sha256Hex } from "../src/auth";

import { cleanAll, mockFetch } from "./helpers";

const USER_UUID = "poe2-oauth-user";
const GGG_API = "https://api.pathofexile.com";
const GGG_OAUTH = "https://www.pathofexile.com";

async function seedAdapterSource(userUuid: string): Promise<string> {
  const sourceUuid = crypto.randomUUID();
  const tokenHash = await sha256Hex(`sct_adapter_${sourceUuid}`);
  await env.DB.prepare(
    `INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind, can_rescan, can_receive_config)
     VALUES (?, ?, ?, 'adapter', 0, 0)`,
  )
    .bind(sourceUuid, userUuid, tokenHash)
    .run();
  return sourceUuid;
}

async function seedGgGState(userUuid: string, sourceUuid: string): Promise<string> {
  const stateKey = crypto.randomUUID();
  await env.OAUTH_KV.put(
    `ggg-oauth-state:${stateKey}`,
    JSON.stringify({
      userUuid,
      region: "pc",
      returnUrl: "",
      sourceUuid,
      codeVerifier: "test-verifier-1234567890-abcdefghijklmnop",
    }),
    { expirationTtl: 600 },
  );
  return stateKey;
}

function mockTokenExchange(): void {
  mockFetch
    .get(GGG_OAUTH)
    .intercept({ path: "/oauth/token", method: "POST" })
    .reply(
      200,
      JSON.stringify({
        access_token: "ggg-access",
        refresh_token: "ggg-refresh",
        expires_in: 2_419_200,
      }),
      { headers: { "content-type": "application/json" } },
    );
}

function mockPoeCharacters(body: unknown = characterListFixture): void {
  mockFetch
    .get(GGG_API)
    .intercept({ path: "/character", method: "GET" })
    .reply(200, JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
}

function mockPoe2Characters(body: unknown = poe2CharacterListFixture): void {
  mockFetch
    .get(GGG_API)
    .intercept({ path: "/character/poe2", method: "GET" })
    .reply(200, JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
}

function callback(stateKey: string): Promise<Response> {
  return SELF.fetch(
    new Request(`https://test-host/oauth/ggg/callback?code=good&state=${stateKey}`, {
      method: "GET",
      redirect: "manual",
    }),
  );
}

describe("GGG OAuth callback discovers + reconciles poe AND poe2 from one grant", () => {
  beforeEach(cleanAll);
  afterEach(() => {
    mockFetch.deactivate();
  });

  it("one callback yields ONE source, saves for both games, and ONE ggg credential row", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    const stateKey = await seedGgGState(USER_UUID, sourceUuid);

    mockFetch.activate();
    mockTokenExchange();
    mockPoeCharacters();
    mockPoe2Characters();

    const resp = await callback(stateKey);

    expect(resp.status).toBe(302);
    const location = new URL(resp.headers.get("Location"));
    expect(location.searchParams.get("connected")).toBe("true");
    expect(location.searchParams.get("error")).toBeNull();

    // One source for both games.
    const sources = await env.DB.prepare(
      "SELECT COUNT(*) c FROM sources WHERE user_uuid = ? AND source_kind = 'adapter'",
    )
      .bind(USER_UUID)
      .first<{ c: number }>();
    expect(sources!.c).toBe(1);

    // One shared ggg credential row.
    const creds = await env.DB.prepare(
      "SELECT COUNT(*) c FROM provider_credentials WHERE user_uuid = ? AND provider = 'ggg'",
    )
      .bind(USER_UUID)
      .first<{ c: number }>();
    expect(creds!.c).toBe(1);

    // Saves for both games under the same source.
    const poeSaves = await env.DB.prepare(
      "SELECT save_name FROM saves WHERE user_uuid = ? AND game_id = 'poe' ORDER BY save_name",
    )
      .bind(USER_UUID)
      .all<{ save_name: string }>();
    expect(poeSaves.results.map((r) => r.save_name)).toEqual([
      "BoneShatterJugg",
      "LeagueStarterRF",
    ]);

    const poe2Saves = await env.DB.prepare(
      "SELECT save_name FROM saves WHERE user_uuid = ? AND game_id = 'poe2' ORDER BY save_name",
    )
      .bind(USER_UUID)
      .all<{ save_name: string }>();
    expect(poe2Saves.results.map((r) => r.save_name)).toEqual([
      "InfernalConcoction",
      "LeagueStarterMonk",
    ]);
  });

  it("poe2's character list empty → poe saves created, zero errors", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    const stateKey = await seedGgGState(USER_UUID, sourceUuid);

    mockFetch.activate();
    mockTokenExchange();
    mockPoeCharacters();
    mockPoe2Characters({ characters: [] });

    const resp = await callback(stateKey);

    expect(resp.status).toBe(302);
    const location = new URL(resp.headers.get("Location"));
    expect(location.searchParams.get("connected")).toBe("true");
    expect(location.searchParams.get("error")).toBeNull();

    const poeSaves = await env.DB.prepare(
      "SELECT COUNT(*) c FROM saves WHERE user_uuid = ? AND game_id = 'poe'",
    )
      .bind(USER_UUID)
      .first<{ c: number }>();
    expect(poeSaves!.c).toBe(2);

    const poe2Saves = await env.DB.prepare(
      "SELECT COUNT(*) c FROM saves WHERE user_uuid = ? AND game_id = 'poe2'",
    )
      .bind(USER_UUID)
      .first<{ c: number }>();
    expect(poe2Saves!.c).toBe(0);

    // An empty list is a normal success — no discovery-failure event for poe2.
    const failedEvents = await env.DB.prepare(
      "SELECT COUNT(*) c FROM source_events WHERE source_uuid = ? AND event_type = 'characterDiscoveryFailed'",
    )
      .bind(sourceUuid)
      .first<{ c: number }>();
    expect(failedEvents!.c).toBe(0);
  });

  it("poe's character list empty → poe2 saves created, zero errors (mirror case)", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    const stateKey = await seedGgGState(USER_UUID, sourceUuid);

    mockFetch.activate();
    mockTokenExchange();
    mockPoeCharacters({ characters: [] });
    mockPoe2Characters();

    const resp = await callback(stateKey);

    expect(resp.status).toBe(302);
    const location = new URL(resp.headers.get("Location"));
    expect(location.searchParams.get("connected")).toBe("true");
    expect(location.searchParams.get("error")).toBeNull();

    const poeSaves = await env.DB.prepare(
      "SELECT COUNT(*) c FROM saves WHERE user_uuid = ? AND game_id = 'poe'",
    )
      .bind(USER_UUID)
      .first<{ c: number }>();
    expect(poeSaves!.c).toBe(0);

    const poe2Saves = await env.DB.prepare(
      "SELECT COUNT(*) c FROM saves WHERE user_uuid = ? AND game_id = 'poe2'",
    )
      .bind(USER_UUID)
      .first<{ c: number }>();
    expect(poe2Saves!.c).toBe(2);

    const failedEvents = await env.DB.prepare(
      "SELECT COUNT(*) c FROM source_events WHERE source_uuid = ? AND event_type = 'characterDiscoveryFailed'",
    )
      .bind(sourceUuid)
      .first<{ c: number }>();
    expect(failedEvents!.c).toBe(0);
  });

  it("poe2 discovery throws (429) → poe's saves still reconciled, connect still succeeds", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    const stateKey = await seedGgGState(USER_UUID, sourceUuid);

    mockFetch.activate();
    mockTokenExchange();
    mockPoeCharacters();
    mockFetch
      .get(GGG_API)
      .intercept({ path: "/character/poe2", method: "GET" })
      .reply(429, "Too Many Requests", { headers: { "Retry-After": "30" } });

    const resp = await callback(stateKey);

    expect(resp.status).toBe(302);
    const location = new URL(resp.headers.get("Location"));
    // Connect still succeeds — poe discovered fine, only poe2 failed.
    expect(location.searchParams.get("connected")).toBe("true");
    expect(location.searchParams.get("error")).toBeNull();

    const poeSaves = await env.DB.prepare(
      "SELECT COUNT(*) c FROM saves WHERE user_uuid = ? AND game_id = 'poe'",
    )
      .bind(USER_UUID)
      .first<{ c: number }>();
    expect(poeSaves!.c).toBe(2);

    // The failure IS surfaced — via a characterDiscoveryFailed event and
    // an "error" SourceHub game status for poe2 specifically — even
    // though the overall connect succeeded.
    const failedEvent = await env.DB.prepare(
      `SELECT event_data FROM source_events
       WHERE source_uuid = ? AND event_type = 'characterDiscoveryFailed'`,
    )
      .bind(sourceUuid)
      .first<{ event_data: string }>();
    expect(failedEvent).toBeTruthy();
    const parsed = JSON.parse(failedEvent!.event_data) as {
      characterDiscoveryFailed: { gameId: string };
    };
    expect(parsed.characterDiscoveryFailed.gameId).toBe("poe2");

    // The shared credential row still persisted (token exchange succeeded).
    const cred = await env.DB.prepare(
      "SELECT COUNT(*) c FROM provider_credentials WHERE user_uuid = ? AND provider = 'ggg'",
    )
      .bind(USER_UUID)
      .first<{ c: number }>();
    expect(cred!.c).toBe(1);
  });

  it("both poe and poe2 discovery throw → connect fails (as single-game failure does today)", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    const stateKey = await seedGgGState(USER_UUID, sourceUuid);

    mockFetch.activate();
    mockTokenExchange();
    mockFetch
      .get(GGG_API)
      .intercept({ path: "/character", method: "GET" })
      .reply(500, "Internal Server Error");
    mockFetch
      .get(GGG_API)
      .intercept({ path: "/character/poe2", method: "GET" })
      .reply(500, "Internal Server Error");

    const resp = await callback(stateKey);

    expect(resp.status).toBe(302);
    const location = new URL(resp.headers.get("Location"));
    expect(location.searchParams.get("connected")).toBe("true");
    expect(location.searchParams.get("error")).toBe("discovery_failed");

    const poeSaves = await env.DB.prepare(
      "SELECT COUNT(*) c FROM saves WHERE user_uuid = ? AND game_id IN ('poe', 'poe2')",
    )
      .bind(USER_UUID)
      .first<{ c: number }>();
    expect(poeSaves!.c).toBe(0);

    // The credential row still persisted — the token exchange itself
    // succeeded; only the subsequent discovery calls failed.
    const cred = await env.DB.prepare(
      "SELECT COUNT(*) c FROM provider_credentials WHERE user_uuid = ? AND provider = 'ggg'",
    )
      .bind(USER_UUID)
      .first<{ c: number }>();
    expect(cred!.c).toBe(1);
  });
});
