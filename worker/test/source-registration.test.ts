import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { Message } from "../src/proto/savecraft/v1/protocol";

import { cleanAll } from "./helpers";

interface RegisterResponse {
  source_uuid: string;
  source_token: string;
  link_code: string;
  link_code_expires_at: string;
}

function registerRequest(body?: Record<string, unknown>): Request {
  return new Request("https://test-host/api/v1/source/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

describe("Source Registration", () => {
  beforeEach(cleanAll);

  describe("POST /api/v1/source/register", () => {
    it("returns 201 with source credentials", async () => {
      const resp = await SELF.fetch(registerRequest());
      expect(resp.status).toBe(201);

      const body = await resp.json<RegisterResponse>();
      expect(body.source_uuid).toBeTruthy();
      expect(body.source_token).toBeTruthy();
      expect(body.link_code).toBeTruthy();
      expect(body.link_code_expires_at).toBeTruthy();
    });

    it("source_token starts with sct_ prefix", async () => {
      const resp = await SELF.fetch(registerRequest());
      const body = await resp.json<RegisterResponse>();
      expect(body.source_token).toMatch(/^sct_/);
    });

    it("source_token is 36+ chars (sct_ prefix + 32 hex)", async () => {
      const resp = await SELF.fetch(registerRequest());
      const body = await resp.json<RegisterResponse>();
      expect(body.source_token.length).toBeGreaterThanOrEqual(36);
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

    it("stores source row in D1 with hashed token (not plaintext)", async () => {
      const resp = await SELF.fetch(registerRequest());
      const body = await resp.json<RegisterResponse>();

      const row = await env.DB.prepare(
        "SELECT source_uuid, token_hash, link_code, user_uuid FROM sources WHERE source_uuid = ?",
      )
        .bind(body.source_uuid)
        .first<{
          source_uuid: string;
          token_hash: string;
          link_code: string;
          user_uuid: string | null;
        }>();

      expect(row).not.toBeNull();
      expect(row!.source_uuid).toBe(body.source_uuid);
      expect(row!.token_hash).toBeTruthy();
      // Token hash must NOT be the plaintext token
      expect(row!.token_hash).not.toBe(body.source_token);
      // Source starts unlinked
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
        "SELECT hostname, os, arch FROM sources WHERE source_uuid = ?",
      )
        .bind(body.source_uuid)
        .first<{ hostname: string; os: string; arch: string }>();

      expect(row!.hostname).toBe("gaming-pc");
      expect(row!.os).toBe("windows");
      expect(row!.arch).toBe("amd64");
    });

    it("accepts empty body", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/source/register", {
          method: "POST",
        }),
      );
      expect(resp.status).toBe(201);
    });

    it("each registration creates a unique source", async () => {
      const resp1 = await SELF.fetch(registerRequest());
      const resp2 = await SELF.fetch(registerRequest());
      const body1 = await resp1.json<RegisterResponse>();
      const body2 = await resp2.json<RegisterResponse>();

      expect(body1.source_uuid).not.toBe(body2.source_uuid);
      expect(body1.source_token).not.toBe(body2.source_token);
    });

    it("sets capability flags to defaults (can_rescan=1, can_receive_config=1)", async () => {
      const resp = await SELF.fetch(registerRequest());
      const body = await resp.json<RegisterResponse>();

      const row = await env.DB.prepare(
        "SELECT can_rescan, can_receive_config FROM sources WHERE source_uuid = ?",
      )
        .bind(body.source_uuid)
        .first<{ can_rescan: number; can_receive_config: number }>();

      expect(row).not.toBeNull();
      expect(row!.can_rescan).toBe(1);
      expect(row!.can_receive_config).toBe(1);
    });

    it("does not accept GET method", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/source/register", { method: "GET" }),
      );
      // GET falls through to protected routes (no auth → 401)
      expect(resp.status).not.toBe(201);
    });
  });

  // ── WebSocket registration (/ws/register) ──────────────────────

  describe("WS /ws/register", () => {
    async function connectRegisterWs(): Promise<WebSocket> {
      const resp = await SELF.fetch("https://test-host/ws/register", {
        headers: { Upgrade: "websocket" },
      });
      const ws = resp.webSocket;
      if (!ws) throw new Error(`WS upgrade failed: ${String(resp.status)}`);
      ws.accept();
      return ws;
    }

    function sendRegister(ws: WebSocket, fields: { hostname?: string; os?: string; arch?: string }): void {
      const msg = Message.encode({
        payload: {
          $case: "register",
          register: {
            hostname: fields.hostname ?? "",
            os: fields.os ?? "",
            arch: fields.arch ?? "",
          },
        },
      }).finish();
      ws.send(msg);
    }

    function waitForMessage(ws: WebSocket, timeoutMs = 2000): Promise<Message> {
      return new Promise<Message>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out")), timeoutMs);
        ws.addEventListener("message", (event) => {
          clearTimeout(timer);
          const data = event.data as ArrayBuffer;
          resolve(Message.decode(new Uint8Array(data)));
        }, { once: true });
      });
    }

    it("registers a new source and returns RegisterResult", async () => {
      const ws = await connectRegisterWs();

      sendRegister(ws, { hostname: "test-pc", os: "linux", arch: "amd64" });
      const reply = await waitForMessage(ws);

      expect(reply.payload?.$case).toBe("registerResult");
      const result = reply.payload!.$case === "registerResult" ? reply.payload.registerResult : null;
      expect(result).not.toBeNull();
      expect(result!.sourceUuid).toBeTruthy();
      expect(result!.sourceToken).toMatch(/^sct_/);
      expect(result!.linkCode).toMatch(/^\d{6}$/);
      expect(result!.linkCodeExpiresAt).toBeDefined();

      // Verify D1 row
      const row = await env.DB.prepare(
        "SELECT source_uuid, hostname, os, arch, user_uuid FROM sources WHERE source_uuid = ?",
      )
        .bind(result!.sourceUuid)
        .first<{
          source_uuid: string;
          hostname: string;
          os: string;
          arch: string;
          user_uuid: string | null;
        }>();
      expect(row).not.toBeNull();
      expect(row!.hostname).toBe("test-pc");
      expect(row!.os).toBe("linux");
      expect(row!.arch).toBe("amd64");
      expect(row!.user_uuid).toBeNull(); // starts unlinked

      ws.close();
    });

    it("returned source_token authenticates against /api/v1/source/verify", async () => {
      const ws = await connectRegisterWs();

      sendRegister(ws, {});
      const reply = await waitForMessage(ws);
      const result = reply.payload!.$case === "registerResult" ? reply.payload.registerResult : null;
      expect(result).not.toBeNull();

      // Use the token to verify
      const verifyResp = await SELF.fetch("https://test-host/api/v1/source/verify", {
        headers: { Authorization: `Bearer ${result!.sourceToken}` },
      });
      expect(verifyResp.status).toBe(200);
      const body = await verifyResp.json<{ source_uuid: string }>();
      expect(body.source_uuid).toBe(result!.sourceUuid);

      ws.close();
    });

    it("rejects non-WebSocket request with 426", async () => {
      const resp = await SELF.fetch("https://test-host/ws/register", {
        method: "GET",
      });
      expect(resp.status).toBe(426);
    });
  });
});
