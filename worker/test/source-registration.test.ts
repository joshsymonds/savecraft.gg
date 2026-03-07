import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { Message } from "../src/proto/savecraft/v1/protocol";

import { cleanAll } from "./helpers";

describe("Source Registration", () => {
  beforeEach(cleanAll);

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

    function sendRegister(
      ws: WebSocket,
      fields: { hostname?: string; os?: string; arch?: string },
    ): void {
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
        const timer = setTimeout(() => {
          reject(new Error("Timed out"));
        }, timeoutMs);
        ws.addEventListener(
          "message",
          (event) => {
            clearTimeout(timer);
            const data = event.data as ArrayBuffer;
            resolve(Message.decode(new Uint8Array(data)));
          },
          { once: true },
        );
      });
    }

    it("registers a new source and returns RegisterResult", async () => {
      const ws = await connectRegisterWs();

      sendRegister(ws, { hostname: "test-pc", os: "linux", arch: "amd64" });
      const reply = await waitForMessage(ws);

      expect(reply.payload?.$case).toBe("registerResult");
      const result =
        reply.payload!.$case === "registerResult" ? reply.payload.registerResult : null;
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
      const result =
        reply.payload!.$case === "registerResult" ? reply.payload.registerResult : null;
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

    it("rate-limits registrations by IP", async () => {
      const testIp = "198.51.100.42";

      // Seed 10 unlinked sources from the same IP (at the limit)
      for (let index = 0; index < 10; index++) {
        const uuid = crypto.randomUUID();
        const hash = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO sources (source_uuid, token_hash, link_code, link_code_expires_at, ip) VALUES (?, ?, ?, datetime('now', '+20 minutes'), ?)",
        )
          .bind(uuid, hash, String(100_000 + index), testIp)
          .run();
      }

      // Next registration from same IP should be rejected
      const resp = await SELF.fetch("https://test-host/ws/register", {
        headers: { Upgrade: "websocket", "X-Real-IP": testIp },
      });
      const ws = resp.webSocket;
      if (!ws) throw new Error(`WS upgrade failed: ${String(resp.status)}`);
      ws.accept();

      sendRegister(ws, { hostname: "spam-pc" });

      // Should receive a close event with 1008
      const closePromise = new Promise<{ code: number; reason: string }>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Timed out waiting for close"));
        }, 2000);
        ws.addEventListener(
          "close",
          (event) => {
            clearTimeout(timer);
            resolve({ code: event.code, reason: event.reason });
          },
          { once: true },
        );
      });

      const close = await closePromise;
      expect(close.code).toBe(1008);
      expect(close.reason).toBe("Too many registrations");
    });
  });
});
