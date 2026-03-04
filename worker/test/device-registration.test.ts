import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

interface RegisterResponse {
  device_uuid: string;
  device_token: string;
  link_code: string;
  link_code_expires_at: string;
}

function registerRequest(body?: Record<string, unknown>): Request {
  return new Request("https://test-host/api/v1/device/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

describe("Device Registration", () => {
  beforeEach(cleanAll);

  describe("POST /api/v1/device/register", () => {
    it("returns 201 with device credentials", async () => {
      const resp = await SELF.fetch(registerRequest());
      expect(resp.status).toBe(201);

      const body = await resp.json<RegisterResponse>();
      expect(body.device_uuid).toBeTruthy();
      expect(body.device_token).toBeTruthy();
      expect(body.link_code).toBeTruthy();
      expect(body.link_code_expires_at).toBeTruthy();
    });

    it("device_token starts with dvt_ prefix", async () => {
      const resp = await SELF.fetch(registerRequest());
      const body = await resp.json<RegisterResponse>();
      expect(body.device_token).toMatch(/^dvt_/);
    });

    it("device_token is 36+ chars (dvt_ prefix + 32 hex)", async () => {
      const resp = await SELF.fetch(registerRequest());
      const body = await resp.json<RegisterResponse>();
      expect(body.device_token.length).toBeGreaterThanOrEqual(36);
    });

    it("link_code is exactly 6 digits", async () => {
      const resp = await SELF.fetch(registerRequest());
      const body = await resp.json<RegisterResponse>();
      expect(body.link_code).toMatch(/^\d{6}$/);
    });

    it("link_code_expires_at is ~20 minutes from now", async () => {
      const resp = await SELF.fetch(registerRequest());
      const body = await resp.json<RegisterResponse>();
      const expires = new Date(body.link_code_expires_at).getTime();
      const now = Date.now();
      const diffMinutes = (expires - now) / 60_000;
      expect(diffMinutes).toBeGreaterThan(18);
      expect(diffMinutes).toBeLessThanOrEqual(21);
    });

    it("stores device row in D1 with hashed token (not plaintext)", async () => {
      const resp = await SELF.fetch(registerRequest());
      const body = await resp.json<RegisterResponse>();

      const row = await env.DB.prepare(
        "SELECT device_uuid, token_hash, link_code, user_uuid FROM devices WHERE device_uuid = ?",
      )
        .bind(body.device_uuid)
        .first<{
          device_uuid: string;
          token_hash: string;
          link_code: string;
          user_uuid: string | null;
        }>();

      expect(row).not.toBeNull();
      expect(row!.device_uuid).toBe(body.device_uuid);
      expect(row!.token_hash).toBeTruthy();
      // Token hash must NOT be the plaintext token
      expect(row!.token_hash).not.toBe(body.device_token);
      // Device starts unlinked
      expect(row!.user_uuid).toBeNull();
      // Link code stored in D1 matches response
      expect(row!.link_code).toBe(body.link_code);
    });

    it("stores optional hostname, os, and arch", async () => {
      const resp = await SELF.fetch(
        registerRequest({ hostname: "gaming-pc", os: "windows", arch: "amd64" }),
      );
      const body = await resp.json<RegisterResponse>();

      const row = await env.DB.prepare(
        "SELECT hostname, os, arch FROM devices WHERE device_uuid = ?",
      )
        .bind(body.device_uuid)
        .first<{ hostname: string; os: string; arch: string }>();

      expect(row!.hostname).toBe("gaming-pc");
      expect(row!.os).toBe("windows");
      expect(row!.arch).toBe("amd64");
    });

    it("accepts empty body", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/register", {
          method: "POST",
        }),
      );
      expect(resp.status).toBe(201);
    });

    it("each registration creates a unique device", async () => {
      const resp1 = await SELF.fetch(registerRequest());
      const resp2 = await SELF.fetch(registerRequest());
      const body1 = await resp1.json<RegisterResponse>();
      const body2 = await resp2.json<RegisterResponse>();

      expect(body1.device_uuid).not.toBe(body2.device_uuid);
      expect(body1.device_token).not.toBe(body2.device_token);
    });

    it("sets capability flags to defaults (can_rescan=1, can_receive_config=1)", async () => {
      const resp = await SELF.fetch(registerRequest());
      const body = await resp.json<RegisterResponse>();

      const row = await env.DB.prepare(
        "SELECT can_rescan, can_receive_config FROM devices WHERE device_uuid = ?",
      )
        .bind(body.device_uuid)
        .first<{ can_rescan: number; can_receive_config: number }>();

      expect(row).not.toBeNull();
      expect(row!.can_rescan).toBe(1);
      expect(row!.can_receive_config).toBe(1);
    });

    it("does not accept GET method", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/register", { method: "GET" }),
      );
      // GET falls through to protected routes (no auth → 401)
      expect(resp.status).not.toBe(201);
    });
  });
});
