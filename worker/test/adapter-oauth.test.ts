import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { sha256Hex } from "../src/auth";
import { GameStatusEnum } from "../src/proto/savecraft/v1/protocol";

import { cleanAll } from "./helpers";

const USER_UUID = "adapter-oauth-user";

/** Read SourceHub debug state for a given source. */
async function getSourceHubState(sourceUuid: string): Promise<{
  sourceState: {
    sources: {
      sourceId: string;
      online: boolean;
      games: { gameId: string; gameName: string; status: number }[];
    }[];
  };
}> {
  const doId = env.SOURCE_HUB.idFromName(sourceUuid);
  const doStub = env.SOURCE_HUB.get(doId);
  const resp = await doStub.fetch(new Request("https://do/debug/state"));
  return resp.json();
}

/** Seed an adapter source pre-linked to the user. */
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

describe("Adapter OAuth", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  describe("GET /oauth/battlenet/authorize", () => {
    it("returns 401 without auth", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/oauth/battlenet/authorize?region=us", { method: "GET" }),
      );
      expect(resp.status).toBe(401);
    });

    it("returns Battle.net authorize URL with correct params", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/oauth/battlenet/authorize?region=us", {
          method: "GET",
          headers: { Authorization: `Bearer ${USER_UUID}` },
        }),
      );
      expect(resp.status).toBe(200);
      const body = await resp.json<{ url: string }>();
      expect(body.url).toContain("oauth.battle.net/authorize");
      expect(body.url).toContain("response_type=code");
      expect(body.url).toContain("scope=wow.profile");
      expect(body.url).toContain("state=");

      // Verify state was stored in KV with sourceUuid
      const url = new URL(body.url);
      const state = url.searchParams.get("state")!;
      const stored = await env.OAUTH_KV.get(`battlenet-oauth-state:${state}`);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!) as {
        userUuid: string;
        region: string;
        sourceUuid: string;
      };
      expect(parsed.userUuid).toBe(USER_UUID);
      expect(parsed.region).toBe("us");
      expect(parsed.sourceUuid).toBeTruthy();
    });

    it("uses EU OAuth URLs for region=eu", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/oauth/battlenet/authorize?region=eu", {
          method: "GET",
          headers: { Authorization: `Bearer ${USER_UUID}` },
        }),
      );
      expect(resp.status).toBe(200);
      const body = await resp.json<{ url: string }>();
      expect(body.url).toContain("oauth.battle.net/authorize");
    });

    it("defaults to US when no region specified", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/oauth/battlenet/authorize", {
          method: "GET",
          headers: { Authorization: `Bearer ${USER_UUID}` },
        }),
      );
      expect(resp.status).toBe(200);
      const body = await resp.json<{ url: string }>();
      expect(body.url).toContain("oauth.battle.net/authorize");
    });

    it("strips external return_url to prevent open redirect", async () => {
      const resp = await SELF.fetch(
        new Request(
          "https://test-host/oauth/battlenet/authorize?region=us&return_url=https://evil.com/phish",
          {
            method: "GET",
            headers: { Authorization: `Bearer ${USER_UUID}` },
          },
        ),
      );
      expect(resp.status).toBe(200);
      const body = await resp.json<{ url: string }>();

      // Verify the stored state has the return_url stripped
      const authorizeUrl = new URL(body.url);
      const stateKey = authorizeUrl.searchParams.get("state")!;
      const stored = await env.OAUTH_KV.get(`battlenet-oauth-state:${stateKey}`);
      const parsed = JSON.parse(stored!) as { returnUrl: string };
      expect(parsed.returnUrl).toBe("");
    });

    it("pushes WATCHING game state to SourceHub after source creation", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/oauth/battlenet/authorize?region=us", {
          method: "GET",
          headers: { Authorization: `Bearer ${USER_UUID}` },
        }),
      );
      expect(resp.status).toBe(200);

      // Extract sourceUuid from KV state
      const body = await resp.json<{ url: string }>();
      const authorizeUrl = new URL(body.url);
      const stateKey = authorizeUrl.searchParams.get("state")!;
      const stored = await env.OAUTH_KV.get(`battlenet-oauth-state:${stateKey}`);
      const parsed = JSON.parse(stored!) as { sourceUuid: string };

      // Verify SourceHub has the game with WATCHING status
      const debug = await getSourceHubState(parsed.sourceUuid);
      expect(debug.sourceState.sources).toHaveLength(1);
      const source = debug.sourceState.sources[0]!;
      expect(source.games).toHaveLength(1);
      expect(source.games[0]!.gameId).toBe("wow");
      expect(source.games[0]!.gameName).toBe("World of Warcraft");
      expect(source.games[0]!.status).toBe(GameStatusEnum.GAME_STATUS_ENUM_WATCHING);
    });
  });

  describe("GET /oauth/battlenet/callback", () => {
    it("returns 400 without code or state", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/oauth/battlenet/callback", {
          method: "GET",
        }),
      );
      expect(resp.status).toBe(400);
    });

    it("returns 400 for invalid/expired state", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/oauth/battlenet/callback?code=test-code&state=bad-state", {
          method: "GET",
        }),
      );
      expect(resp.status).toBe(400);
      const body = await resp.json<{ error: string }>();
      expect(body.error).toContain("state");
    });

    it("redirects with error params when token exchange fails", async () => {
      const sourceUuid = await seedAdapterSource(USER_UUID);
      const stateKey = crypto.randomUUID();
      await env.OAUTH_KV.put(
        `battlenet-oauth-state:${stateKey}`,
        JSON.stringify({
          userUuid: USER_UUID,
          region: "us",
          returnUrl: "",
          sourceUuid,
        }),
        { expirationTtl: 600 },
      );

      const resp = await SELF.fetch(
        new Request(`https://test-host/oauth/battlenet/callback?code=fake-code&state=${stateKey}`, {
          method: "GET",
          redirect: "manual",
        }),
      );

      expect(resp.status).toBe(302);
      const location = new URL(resp.headers.get("Location")!);
      expect(location.searchParams.get("game_id")).toBe("wow");
      expect(location.searchParams.get("error")).toBe("token_failed");
      expect(location.searchParams.get("error_detail")).toBeTruthy();
    });

    it("logs oauthTokenFailed event when token exchange fails", async () => {
      const sourceUuid = await seedAdapterSource(USER_UUID);
      const stateKey = crypto.randomUUID();
      await env.OAUTH_KV.put(
        `battlenet-oauth-state:${stateKey}`,
        JSON.stringify({
          userUuid: USER_UUID,
          region: "us",
          returnUrl: "",
          sourceUuid,
        }),
        { expirationTtl: 600 },
      );

      await SELF.fetch(
        new Request(`https://test-host/oauth/battlenet/callback?code=fake-code&state=${stateKey}`, {
          method: "GET",
          redirect: "manual",
        }),
      );

      const events = await env.DB.prepare(
        "SELECT event_type, event_data FROM source_events WHERE source_uuid = ? ORDER BY id",
      )
        .bind(sourceUuid)
        .all<{ event_type: string; event_data: string }>();

      const tokenFailed = events.results.find((event) => event.event_type === "oauthTokenFailed");
      expect(tokenFailed).toBeTruthy();
    });

    it("pushes ERROR state to SourceHub when token exchange fails", async () => {
      const sourceUuid = await seedAdapterSource(USER_UUID);
      const stateKey = crypto.randomUUID();
      await env.OAUTH_KV.put(
        `battlenet-oauth-state:${stateKey}`,
        JSON.stringify({
          userUuid: USER_UUID,
          region: "us",
          returnUrl: "",
          sourceUuid,
        }),
        { expirationTtl: 600 },
      );

      await SELF.fetch(
        new Request(`https://test-host/oauth/battlenet/callback?code=fake-code&state=${stateKey}`, {
          method: "GET",
          redirect: "manual",
        }),
      );

      const debug = await getSourceHubState(sourceUuid);
      expect(debug.sourceState.sources).toHaveLength(1);
      expect(debug.sourceState.sources[0]!.games).toHaveLength(1);
      expect(debug.sourceState.sources[0]!.games[0]!.gameId).toBe("wow");
      expect(debug.sourceState.sources[0]!.games[0]!.status).toBe(
        GameStatusEnum.GAME_STATUS_ENUM_ERROR,
      );
    });
  });
});
