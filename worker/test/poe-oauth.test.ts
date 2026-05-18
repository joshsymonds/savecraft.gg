import { env, fetchMock, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { poeAdapter } from "../../plugins/poe/adapter";
import characterListFixture from "../../plugins/poe/testdata/ggg-character-list.json";
import { AdapterError } from "../src/adapters/adapter";
import { sha256Hex } from "../src/auth";

import { cleanAll } from "./helpers";

const USER_UUID = "poe-oauth-user";

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

describe("PoE GGG OAuth + discoverSaves", () => {
  beforeEach(() => {
    cleanAll();
  });
  afterEach(() => {
    fetchMock.deactivate();
  });

  describe("discoverSaves", () => {
    function mockCharacterList(): void {
      fetchMock.activate();
      fetchMock.disableNetConnect();
      fetchMock
        .get("https://api.pathofexile.com")
        .intercept({ path: "/character", method: "GET" })
        .reply(200, JSON.stringify(characterListFixture), {
          headers: { "content-type": "application/json" },
        });
    }

    it("maps non-deleted characters and drops deleted ones", async () => {
      mockCharacterList();
      const saves = await poeAdapter.discoverSaves("tok", "pc");

      expect(saves).toHaveLength(2);
      const jugg = saves.find((s) => s.displayName === "BoneShatterJugg")!;
      expect(jugg).toBeTruthy();
      expect(jugg.characterId).toBe(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      );
      expect(jugg.saveName).toBe("BoneShatterJugg");
      expect(jugg.metadata.class).toBe("Juggernaut");
      expect(jugg.metadata.league).toBe("Standard");
      expect(jugg.metadata.level).toBe(92);
      expect(saves.some((s) => s.displayName === "DeletedAlt")).toBe(false);
    });

    it("maps 401 to token_expired", async () => {
      fetchMock.activate();
      fetchMock.disableNetConnect();
      fetchMock
        .get("https://api.pathofexile.com")
        .intercept({ path: "/character", method: "GET" })
        .reply(401, "Unauthorized");

      await expect(poeAdapter.discoverSaves("bad", "pc")).rejects.toSatisfy(
        (error: unknown) => error instanceof AdapterError && error.code === "token_expired",
      );
    });

    it("maps 429 to rate_limited with Retry-After", async () => {
      fetchMock.activate();
      fetchMock.disableNetConnect();
      fetchMock
        .get("https://api.pathofexile.com")
        .intercept({ path: "/character", method: "GET" })
        .reply(429, "Too Many Requests", { headers: { "Retry-After": "47" } });

      await expect(poeAdapter.discoverSaves("tok", "pc")).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof AdapterError && error.code === "rate_limited" && error.retryAfter === 47,
      );
    });
  });

  describe("GET /oauth/ggg/authorize", () => {
    it("redirects with PKCE S256; verifier only in KV, not the URL/state", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/oauth/ggg/authorize", {
          method: "GET",
          headers: { Authorization: `Bearer ${USER_UUID}` },
        }),
      );
      expect(resp.status).toBe(200);
      const { url } = await resp.json<{ url: string }>();
      const authorize = new URL(url);

      expect(authorize.origin + authorize.pathname).toBe(
        "https://www.pathofexile.com/oauth/authorize",
      );
      expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
      const challenge = authorize.searchParams.get("code_challenge")!;
      expect(challenge).toBeTruthy();
      expect(challenge).not.toMatch(/[+/=]/);
      expect(authorize.searchParams.get("scope")).toContain("account:characters");

      // The verifier must NOT appear anywhere on the wire.
      expect(url).not.toContain("code_verifier");
      const stateKey = authorize.searchParams.get("state")!;
      expect(stateKey).not.toContain(challenge);

      const stored = await env.OAUTH_KV.get(`ggg-oauth-state:${stateKey}`);
      const parsed = JSON.parse(stored!) as { codeVerifier?: string };
      expect(parsed.codeVerifier).toBeTruthy();
      expect(url).not.toContain(parsed.codeVerifier!);
    });
  });

  describe("GET /oauth/ggg/callback", () => {
    it("exchanges code (PKCE), stores poe credentials, reconciles saves", async () => {
      const sourceUuid = await seedAdapterSource(USER_UUID);
      const stateKey = crypto.randomUUID();
      await env.OAUTH_KV.put(
        `ggg-oauth-state:${stateKey}`,
        JSON.stringify({
          userUuid: USER_UUID,
          region: "pc",
          returnUrl: "",
          sourceUuid,
          codeVerifier: "test-verifier-1234567890-abcdefghijklmnop",
        }),
        { expirationTtl: 600 },
      );

      fetchMock.activate();
      fetchMock.disableNetConnect();
      fetchMock
        .get("https://www.pathofexile.com")
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
      fetchMock
        .get("https://api.pathofexile.com")
        .intercept({ path: "/character", method: "GET" })
        .reply(200, JSON.stringify(characterListFixture), {
          headers: { "content-type": "application/json" },
        });

      const resp = await SELF.fetch(
        new Request(`https://test-host/oauth/ggg/callback?code=good&state=${stateKey}`, {
          method: "GET",
          redirect: "manual",
        }),
      );

      expect(resp.status).toBe(302);
      const location = new URL(resp.headers.get("Location")!);
      expect(location.searchParams.get("game_id")).toBe("poe");
      expect(location.searchParams.get("connected")).toBe("true");
      expect(location.searchParams.get("error")).toBeNull();

      const cred = await env.DB.prepare(
        "SELECT game_id, access_token FROM game_credentials WHERE user_uuid = ? AND game_id = 'poe'",
      )
        .bind(USER_UUID)
        .first<{ game_id: string; access_token: string }>();
      expect(cred).toBeTruthy();
      expect(cred!.game_id).toBe("poe");
      expect(cred!.access_token).toBe("ggg-access");

      const saves = await env.DB.prepare(
        "SELECT save_name FROM saves WHERE user_uuid = ? AND game_id = 'poe' ORDER BY save_name",
      )
        .bind(USER_UUID)
        .all<{ save_name: string }>();
      expect(saves.results.map((r) => r.save_name)).toEqual(["BoneShatterJugg", "LeagueStarterRF"]);
    });
  });
});
