import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { sha256Hex } from "../src/auth";

import { mockFetch } from "./helpers";
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
      expect(new URL(body.url).searchParams.get("client_id")).toBe("test-battlenet-client");

      // State holds only intent; no pre-created source (#22).
      const url = new URL(body.url);
      const state = url.searchParams.get("state")!;
      const stored = await env.OAUTH_KV.get(`battlenet-oauth-state:${state}`);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored) as {
        userUuid: string;
        region: string;
        sourceUuid?: string;
      };
      expect(parsed.userUuid).toBe(USER_UUID);
      expect(parsed.region).toBe("us");
      expect(parsed.sourceUuid).toBeUndefined();
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
      const parsed = JSON.parse(stored) as { returnUrl: string };
      expect(parsed.returnUrl).toBe("");
    });

    it("persists no source and no DO game status at authorize (#22)", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/oauth/battlenet/authorize?region=us", {
          method: "GET",
          headers: { Authorization: `Bearer ${USER_UUID}` },
        }),
      );
      expect(resp.status).toBe(200);

      const sourceCount = await env.DB.prepare("SELECT COUNT(*) c FROM sources WHERE user_uuid = ?")
        .bind(USER_UUID)
        .first<{ c: number }>();
      expect(sourceCount!.c).toBe(0);

      const events = await env.DB.prepare(
        "SELECT COUNT(*) c FROM source_events WHERE event_type = 'oauthStarted'",
      ).first<{ c: number }>();
      expect(events!.c).toBe(0);
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
      const location = new URL(resp.headers.get("Location"));
      expect(location.searchParams.get("game_id")).toBe("wow");
      expect(location.searchParams.get("error")).toBe("token_failed");
      expect(location.searchParams.get("error_detail")).toBeTruthy();
    });

    it("a failed token exchange leaves no source, event, or credential (#22)", async () => {
      const stateKey = crypto.randomUUID();
      await env.OAUTH_KV.put(
        `battlenet-oauth-state:${stateKey}`,
        JSON.stringify({ userUuid: USER_UUID, region: "us", returnUrl: "" }),
        { expirationTtl: 600 },
      );

      const resp = await SELF.fetch(
        new Request(`https://test-host/oauth/battlenet/callback?code=fake-code&state=${stateKey}`, {
          method: "GET",
          redirect: "manual",
        }),
      );

      expect(resp.status).toBe(302);
      expect(new URL(resp.headers.get("Location")).searchParams.get("error")).toBe("token_failed");

      const sourceCount = await env.DB.prepare("SELECT COUNT(*) c FROM sources WHERE user_uuid = ?")
        .bind(USER_UUID)
        .first<{ c: number }>();
      expect(sourceCount!.c).toBe(0);

      const cred = await env.DB.prepare(
        "SELECT COUNT(*) c FROM provider_credentials WHERE user_uuid = ?",
      )
        .bind(USER_UUID)
        .first<{ c: number }>();
      expect(cred!.c).toBe(0);
    });
  });

  // Characterization of the callback SUCCESS path — uncovered before the
  // provider-parameterized OAuth refactor. These pin the exact behavior
  // the generalization must preserve: credential row keyed by the OAuth
  // provider, discover+reconcile creating saves, and the connected
  // redirect. They must stay green verbatim post-refactor.
  describe("GET /oauth/battlenet/callback (success path) [characterization]", () => {
    function mockBattlenetSuccess(): void {
      mockFetch.activate();
      mockFetch
        .get("https://oauth.battle.net")
        .intercept({ path: "/token", method: "POST" })
        .reply(
          200,
          JSON.stringify({
            access_token: "char-access-token",
            refresh_token: "char-refresh-token",
            expires_in: 86_400,
          }),
          { headers: { "content-type": "application/json" } },
        );
      mockFetch
        .get("https://us.api.blizzard.com")
        .intercept({ path: /\/profile\/user\/wow/, method: "GET" })
        .reply(
          200,
          JSON.stringify({
            wow_accounts: [
              {
                characters: [
                  {
                    id: 7_654_321,
                    name: "Charpin",
                    realm: { slug: "tichondrius", name: "Tichondrius" },
                    level: 80,
                    playable_class: { name: "Rogue" },
                    playable_race: { name: "Troll" },
                    faction: { name: "Horde" },
                    gender: { name: "Male" },
                  },
                ],
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
    }

    it("stores credentials, reconciles saves, and redirects connected=true", async () => {
      const sourceUuid = await seedAdapterSource(USER_UUID);
      const stateKey = crypto.randomUUID();
      await env.OAUTH_KV.put(
        `battlenet-oauth-state:${stateKey}`,
        JSON.stringify({ userUuid: USER_UUID, region: "us", returnUrl: "", sourceUuid }),
        { expirationTtl: 600 },
      );

      try {
        mockBattlenetSuccess();
        const resp = await SELF.fetch(
          new Request(
            `https://test-host/oauth/battlenet/callback?code=good-code&state=${stateKey}`,
            { method: "GET", redirect: "manual" },
          ),
        );

        expect(resp.status).toBe(302);
        const location = new URL(resp.headers.get("Location"));
        expect(location.searchParams.get("game_id")).toBe("wow");
        expect(location.searchParams.get("connected")).toBe("true");
        expect(location.searchParams.get("error")).toBeNull();
      } finally {
        mockFetch.deactivate();
      }

      // Credential row keyed by the OAuth provider ("battlenet"), not
      // the adapter's game_id ("wow") — provider_credentials is shared
      // across every game backed by the same provider.
      const cred = await env.DB.prepare(
        "SELECT provider, access_token, refresh_token FROM provider_credentials WHERE user_uuid = ? AND provider = 'battlenet'",
      )
        .bind(USER_UUID)
        .first<{ provider: string; access_token: string; refresh_token: string }>();
      expect(cred).toBeTruthy();
      expect(cred!.provider).toBe("battlenet");
      expect(cred!.access_token).toBe("char-access-token");
      expect(cred!.refresh_token).toBe("char-refresh-token");

      // Discover + reconcile created a save for the discovered character.
      const save = await env.DB.prepare(
        "SELECT game_id, save_name FROM saves WHERE user_uuid = ? AND game_id = 'wow'",
      )
        .bind(USER_UUID)
        .first<{ game_id: string; save_name: string }>();
      expect(save).toBeTruthy();
      expect(save!.save_name).toBe("Charpin-tichondrius-US");

      // characterDiscovery event logged.
      const events = await env.DB.prepare(
        "SELECT event_type FROM source_events WHERE source_uuid = ? ORDER BY id",
      )
        .bind(sourceUuid)
        .all<{ event_type: string }>();
      expect(events.results.some((logged) => logged.event_type === "characterDiscovery")).toBe(
        true,
      );
    });
  });
});
