import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

const TEST_USER = "pairing-test-user";

interface PairResponse {
  code: string;
}

interface ClaimResponse {
  token: string;
  serverUrl: string;
}

function createPairRequest(userUuid: string): Request {
  return new Request("https://test-host/api/v1/pair", {
    method: "POST",
    headers: { Authorization: `Bearer ${userUuid}` },
  });
}

function claimRequest(code: string): Request {
  return new Request("https://test-host/api/v1/pair/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

describe("Pairing Codes", () => {
  beforeEach(cleanAll);

  describe("POST /api/v1/pair", () => {
    it("returns 201 with a 6-digit code", async () => {
      const resp = await SELF.fetch(createPairRequest(TEST_USER));
      expect(resp.status).toBe(201);

      const body = await resp.json<PairResponse>();
      expect(body.code).toMatch(/^\d{6}$/);
    });

    it("returns 401 without auth", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/pair", { method: "POST" }),
      );
      expect(resp.status).toBe(401);
    });

    it("stores code hash in D1, not plaintext", async () => {
      const resp = await SELF.fetch(createPairRequest(TEST_USER));
      const body = await resp.json<PairResponse>();

      const row = await env.DB.prepare("SELECT code_hash FROM pairing_codes WHERE user_uuid = ?")
        .bind(TEST_USER)
        .first<{ code_hash: string }>();

      expect(row).not.toBeNull();
      // code_hash should NOT equal the raw code
      expect(row!.code_hash).not.toBe(body.code);
      // code_hash should be a hex string (SHA-256 = 64 hex chars)
      expect(row!.code_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("generating a new code replaces the old one (one per user)", async () => {
      await SELF.fetch(createPairRequest(TEST_USER));
      await SELF.fetch(createPairRequest(TEST_USER));

      const rows = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM pairing_codes WHERE user_uuid = ?",
      )
        .bind(TEST_USER)
        .first<{ count: number }>();

      expect(rows!.count).toBe(1);
    });
  });

  describe("POST /api/v1/pair/claim", () => {
    it("exchanges valid code for token and serverUrl", async () => {
      const pairResp = await SELF.fetch(createPairRequest(TEST_USER));
      const { code } = await pairResp.json<PairResponse>();

      const claimResp = await SELF.fetch(claimRequest(code));
      expect(claimResp.status).toBe(200);

      const body = await claimResp.json<ClaimResponse>();
      expect(body.token).toMatch(/^sav_/);
      expect(body.serverUrl).toBeTruthy();
    });

    it("returns 401 for invalid code", async () => {
      const resp = await SELF.fetch(claimRequest("000000"));
      expect(resp.status).toBe(401);
    });

    it("returns 401 for expired code", async () => {
      const pairResp = await SELF.fetch(createPairRequest(TEST_USER));
      const { code } = await pairResp.json<PairResponse>();

      // Manually expire the code in D1
      await env.DB.prepare(
        "UPDATE pairing_codes SET expires_at = datetime('now', '-1 minute')",
      ).run();

      const claimResp = await SELF.fetch(claimRequest(code));
      expect(claimResp.status).toBe(401);
    });

    it("code is single-use (second claim fails)", async () => {
      const pairResp = await SELF.fetch(createPairRequest(TEST_USER));
      const { code } = await pairResp.json<PairResponse>();

      const firstClaim = await SELF.fetch(claimRequest(code));
      expect(firstClaim.status).toBe(200);

      const secondClaim = await SELF.fetch(claimRequest(code));
      expect(secondClaim.status).toBe(401);
    });

    it("creates an API key for the user on successful claim", async () => {
      const pairResp = await SELF.fetch(createPairRequest(TEST_USER));
      const { code } = await pairResp.json<PairResponse>();

      const claimResp = await SELF.fetch(claimRequest(code));
      const { token } = await claimResp.json<ClaimResponse>();

      // The returned token should be a valid API key in D1
      const { sha256Hex } = await import("../src/auth");
      const hash = await sha256Hex(token);
      const row = await env.DB.prepare("SELECT user_uuid FROM api_keys WHERE key_hash = ?")
        .bind(hash)
        .first<{ user_uuid: string }>();

      expect(row).not.toBeNull();
      expect(row!.user_uuid).toBe(TEST_USER);
    });

    it("deletes pairing code after successful claim", async () => {
      const pairResp = await SELF.fetch(createPairRequest(TEST_USER));
      const { code } = await pairResp.json<PairResponse>();

      await SELF.fetch(claimRequest(code));

      const row = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM pairing_codes WHERE user_uuid = ?",
      )
        .bind(TEST_USER)
        .first<{ count: number }>();

      expect(row!.count).toBe(0);
    });

    it("returns 429 after too many failed attempts", async () => {
      // Make 5 failed attempts
      for (let index = 0; index < 5; index++) {
        await SELF.fetch(claimRequest("999999"));
      }

      // 6th attempt should be rate limited
      const resp = await SELF.fetch(claimRequest("999999"));
      expect(resp.status).toBe(429);

      // Verify rate limit state persisted to D1
      const row = await env.DB.prepare("SELECT failures FROM pairing_rate_limits WHERE ip = ?")
        .bind("unknown")
        .first<{ failures: number }>();
      expect(row).not.toBeNull();
      expect(row!.failures).toBeGreaterThanOrEqual(5);
    });

    it("resets rate limit after window expires", async () => {
      // Record 5 failures
      for (let index = 0; index < 5; index++) {
        await SELF.fetch(claimRequest("999999"));
      }

      // Confirm blocked
      const blocked = await SELF.fetch(claimRequest("999999"));
      expect(blocked.status).toBe(429);

      // Expire the window by backdating window_start in D1
      await env.DB.prepare(
        "UPDATE pairing_rate_limits SET window_start = datetime('now', '-2 minutes') WHERE ip = ?",
      )
        .bind("unknown")
        .run();

      // Should be allowed again (new window)
      const allowed = await SELF.fetch(claimRequest("999999"));
      expect(allowed.status).toBe(401); // wrong code, but NOT 429

      // Verify D1 state: counter should have reset to 1 (this new failure)
      const resetRow = await env.DB.prepare("SELECT failures FROM pairing_rate_limits WHERE ip = ?")
        .bind("unknown")
        .first<{ failures: number }>();
      expect(resetRow).not.toBeNull();
      expect(resetRow!.failures).toBe(1);
    });

    it("returns 400 for missing code", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/pair/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(resp.status).toBe(400);
    });
  });
});
