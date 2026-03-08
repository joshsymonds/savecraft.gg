import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { sha256Hex } from "../src/auth";

import { cleanAll } from "./helpers";

const USER_UUID = "adapter-oauth-user";

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

/** Seed game_credentials for the user. */
async function seedGameCredentials(
  userUuid: string,
  gameId: string,
  accessToken: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO game_credentials (user_uuid, game_id, access_token, refresh_token, expires_at)
     VALUES (?, ?, ?, NULL, NULL)`,
  )
    .bind(userUuid, gameId, accessToken)
    .run();
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
        new Request(
          `https://test-host/oauth/battlenet/callback?code=fake-code&state=${stateKey}`,
          { method: "GET", redirect: "manual" },
        ),
      );

      expect(resp.status).toBe(302);
      const location = new URL(resp.headers.get("Location")!);
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
        new Request(
          `https://test-host/oauth/battlenet/callback?code=fake-code&state=${stateKey}`,
          { method: "GET", redirect: "manual" },
        ),
      );

      const events = await env.DB.prepare(
        "SELECT event_type, event_data FROM source_events WHERE source_uuid = ? ORDER BY id",
      )
        .bind(sourceUuid)
        .all<{ event_type: string; event_data: string }>();

      const tokenFailed = events.results.find((e) => e.event_type === "oauthTokenFailed");
      expect(tokenFailed).toBeTruthy();
    });
  });

  describe("POST /api/v1/adapters/{gameId}/characters", () => {
    it("returns 401 without auth", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/adapters/wow/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ character_ids: ["123"] }),
        }),
      );
      expect(resp.status).toBe(401);
    });

    it("returns 404 for unknown adapter", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/adapters/unknown-game/characters", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${USER_UUID}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ character_ids: ["123"] }),
        }),
      );
      expect(resp.status).toBe(404);
    });

    it("returns 400 when no credentials found", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/adapters/wow/characters", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${USER_UUID}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            characters: [
              {
                character_id: "12345",
                save_name: "Thrall-thrall-US",
                display_name: "Thrall",
                metadata: { realm_slug: "thrall", region: "us", class: "Shaman", level: 80 },
              },
            ],
          }),
        }),
      );
      expect(resp.status).toBe(400);
      const body = await resp.json<{ error: string }>();
      expect(body.error).toContain("credentials");
    });

    it("creates source and linked characters from selection", async () => {
      // Seed credentials (as if callback already ran)
      await seedGameCredentials(USER_UUID, "wow", "test-access-token");

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/adapters/wow/characters", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${USER_UUID}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            characters: [
              {
                character_id: "12345",
                save_name: "Thrall-thrall-US",
                display_name: "Thrall",
                metadata: { realm_slug: "thrall", region: "us", class: "Shaman", level: 80 },
              },
              {
                character_id: "67890",
                save_name: "Jaina-proudmoore-US",
                display_name: "Jaina",
                metadata: { realm_slug: "proudmoore", region: "us", class: "Mage", level: 80 },
              },
            ],
          }),
        }),
      );
      expect(resp.status).toBe(200);
      const body = await resp.json<{
        source_uuid: string;
        characters: { character_id: string; save_uuid: string }[];
      }>();

      expect(body.source_uuid).toBeTruthy();
      expect(body.characters).toHaveLength(2);

      // Verify source was created in D1
      const source = await env.DB.prepare(
        "SELECT source_kind, user_uuid FROM sources WHERE source_uuid = ?",
      )
        .bind(body.source_uuid)
        .first<{ source_kind: string; user_uuid: string }>();
      expect(source?.source_kind).toBe("adapter");
      expect(source?.user_uuid).toBe(USER_UUID);

      // Verify linked_characters were created
      const chars = await env.DB.prepare(
        "SELECT character_id, character_name, active FROM linked_characters WHERE user_uuid = ? AND game_id = ?",
      )
        .bind(USER_UUID, "wow")
        .all<{ character_id: string; character_name: string; active: number }>();
      expect(chars.results).toHaveLength(2);
      expect(
        chars.results.map((c) => c.character_id).toSorted((a, b) => a.localeCompare(b)),
      ).toEqual(["12345", "67890"]);

      // Verify saves were created
      const saves = await env.DB.prepare(
        "SELECT save_name FROM saves WHERE user_uuid = ? AND game_id = ?",
      )
        .bind(USER_UUID, "wow")
        .all<{ save_name: string }>();
      expect(saves.results).toHaveLength(2);
    });

    it("reuses existing adapter source on re-selection", async () => {
      await seedGameCredentials(USER_UUID, "wow", "test-access-token");
      const existingSourceUuid = await seedAdapterSource(USER_UUID);

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/adapters/wow/characters", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${USER_UUID}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            characters: [
              {
                character_id: "12345",
                save_name: "Thrall-thrall-US",
                display_name: "Thrall",
                metadata: { realm_slug: "thrall", region: "us" },
              },
            ],
          }),
        }),
      );
      expect(resp.status).toBe(200);
      const body = await resp.json<{ source_uuid: string }>();
      // Should reuse the existing adapter source
      expect(body.source_uuid).toBe(existingSourceUuid);
    });
  });
});
