import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, closeWs, connectDaemonWs, seedSource } from "./helpers";

const ADMIN_KEY = "test-admin-key-secret";

function adminFetch(path: string, key?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
  }
  return SELF.fetch(`https://test-host${path}`, { headers });
}

describe("Admin API", () => {
  beforeEach(cleanAll);

  describe("authentication", () => {
    it("returns 401 without Authorization header", async () => {
      const response = await adminFetch("/admin/sources");
      expect(response.status).toBe(401);
    });

    it("returns 401 with wrong API key", async () => {
      const response = await adminFetch("/admin/sources", "wrong-key");
      expect(response.status).toBe(401);
    });

    it("returns 200 with correct API key", async () => {
      const response = await adminFetch("/admin/sources", ADMIN_KEY);
      expect(response.status).toBe(200);
    });
  });

  describe("GET /admin/sources", () => {
    it("returns empty array when no sources exist", async () => {
      const response = await adminFetch("/admin/sources", ADMIN_KEY);
      expect(response.status).toBe(200);
      const body = await response.json<{ sources: unknown[] }>();
      expect(body.sources).toEqual([]);
    });

    it("returns seeded sources", async () => {
      const userUuid = crypto.randomUUID();
      const { sourceUuid } = await seedSource(userUuid);

      const response = await adminFetch("/admin/sources", ADMIN_KEY);
      const body = await response.json<{ sources: Array<{ source_uuid: string; user_uuid: string }> }>();
      expect(body.sources).toHaveLength(1);
      expect(body.sources[0]!.source_uuid).toBe(sourceUuid);
      expect(body.sources[0]!.user_uuid).toBe(userUuid);
    });
  });

  describe("GET /admin/source/:uuid/events", () => {
    it("returns events for a source", async () => {
      const { sourceUuid } = await seedSource();
      await env.DB.prepare(
        "INSERT INTO source_events (source_uuid, event_type, event_data) VALUES (?, ?, ?)",
      )
        .bind(sourceUuid, "sourceOnline", JSON.stringify({ test: true }))
        .run();

      const response = await adminFetch(`/admin/source/${sourceUuid}/events`, ADMIN_KEY);
      expect(response.status).toBe(200);
      const body = await response.json<{ events: Array<{ event_type: string }> }>();
      expect(body.events).toHaveLength(1);
      expect(body.events[0]!.event_type).toBe("sourceOnline");
    });

    it("respects limit query parameter", async () => {
      const { sourceUuid } = await seedSource();
      for (let index = 0; index < 5; index++) {
        await env.DB.prepare(
          "INSERT INTO source_events (source_uuid, event_type, event_data) VALUES (?, ?, ?)",
        )
          .bind(sourceUuid, `event${String(index)}`, "{}")
          .run();
      }

      const response = await adminFetch(`/admin/source/${sourceUuid}/events?limit=2`, ADMIN_KEY);
      const body = await response.json<{ events: unknown[] }>();
      expect(body.events).toHaveLength(2);
    });
  });

  describe("GET /admin/source/:uuid/debug/*", () => {
    it("returns state for a source DO", async () => {
      const { sourceUuid } = await seedSource();
      const response = await adminFetch(`/admin/source/${sourceUuid}/debug/state`, ADMIN_KEY);
      expect(response.status).toBe(200);
      const body = await response.json<{ sourceState: unknown; sourceUuid: unknown }>();
      expect(body).toHaveProperty("sourceState");
    });

    it("returns connections info", async () => {
      const { sourceUuid } = await seedSource();
      const response = await adminFetch(`/admin/source/${sourceUuid}/debug/connections`, ADMIN_KEY);
      expect(response.status).toBe(200);
      const body = await response.json<{ daemonCount: number }>();
      expect(body.daemonCount).toBe(0);
    });

    it("returns empty log for fresh DO", async () => {
      const { sourceUuid } = await seedSource();
      const response = await adminFetch(`/admin/source/${sourceUuid}/debug/log`, ADMIN_KEY);
      expect(response.status).toBe(200);
      const body = await response.json<{ entries: unknown[]; size: number }>();
      expect(body.entries).toEqual([]);
      expect(body.size).toBe(0);
    });

    it("returns storage keys", async () => {
      const { sourceUuid } = await seedSource();
      const response = await adminFetch(`/admin/source/${sourceUuid}/debug/storage`, ADMIN_KEY);
      expect(response.status).toBe(200);
      const body = await response.json<{ keys: string[] }>();
      expect(Array.isArray(body.keys)).toBe(true);
    });

    it("captures log entries after daemon activity", async () => {
      const userUuid = crypto.randomUUID();
      const { sourceUuid, sourceToken } = await seedSource(userUuid);

      // Connect daemon and send sourceOnline
      const ws = await connectDaemonWs(sourceToken);
      ws.send(JSON.stringify({ sourceOnline: { sourceId: sourceUuid, version: "0.1.0", platform: "linux-amd64" } }));
      // Wait for state broadcast to settle
      await new Promise((resolve) => { setTimeout(resolve, 100); });

      const response = await adminFetch(`/admin/source/${sourceUuid}/debug/log`, ADMIN_KEY);
      expect(response.status).toBe(200);
      const body = await response.json<{ entries: Array<{ level: string; msg: string }>; size: number }>();
      expect(body.size).toBeGreaterThan(0);
      // Should have at least a WebSocket accepted and message received entry
      const messages = body.entries.map((entry) => entry.msg);
      expect(messages.some((m) => m.includes("accepted") || m.includes("connected"))).toBe(true);

      await closeWs(ws);
    });
  });

  describe("GET /admin/user/:uuid/debug/*", () => {
    it("returns state for a user DO", async () => {
      const userUuid = crypto.randomUUID();
      const response = await adminFetch(`/admin/user/${userUuid}/debug/state`, ADMIN_KEY);
      expect(response.status).toBe(200);
      const body = await response.json<{ mergedState: unknown }>();
      expect(body).toHaveProperty("mergedState");
    });

    it("returns connections info", async () => {
      const userUuid = crypto.randomUUID();
      const response = await adminFetch(`/admin/user/${userUuid}/debug/connections`, ADMIN_KEY);
      expect(response.status).toBe(200);
      const body = await response.json<{ uiCount: number }>();
      expect(body.uiCount).toBe(0);
    });

    it("returns empty log for fresh DO", async () => {
      const userUuid = crypto.randomUUID();
      const response = await adminFetch(`/admin/user/${userUuid}/debug/log`, ADMIN_KEY);
      expect(response.status).toBe(200);
      const body = await response.json<{ entries: unknown[]; size: number }>();
      expect(body.entries).toEqual([]);
      expect(body.size).toBe(0);
    });

    it("returns storage keys", async () => {
      const userUuid = crypto.randomUUID();
      const response = await adminFetch(`/admin/user/${userUuid}/debug/storage`, ADMIN_KEY);
      expect(response.status).toBe(200);
      const body = await response.json<{ keys: string[] }>();
      expect(Array.isArray(body.keys)).toBe(true);
    });
  });

  describe("D1 error persistence", () => {
    it("persists error events to source_events table", async () => {
      const userUuid = crypto.randomUUID();
      const { sourceUuid, sourceToken } = await seedSource(userUuid);

      // Connect daemon and send a sourceOnline
      const ws = await connectDaemonWs(sourceToken);
      ws.send(
        JSON.stringify({
          sourceOnline: { sourceId: sourceUuid, version: "0.1.0", platform: "linux-amd64" },
        }),
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Now send a parseFailed event — this is a real error that should be persisted
      ws.send(
        JSON.stringify({
          parseFailed: { gameId: "d2r", error: "plugin crashed", savePath: "/saves/test.d2s" },
        }),
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Check D1 for the persisted error event
      const result = await env.DB.prepare(
        "SELECT event_type FROM source_events WHERE source_uuid = ? AND event_type = 'parseFailed'",
      )
        .bind(sourceUuid)
        .first<{ event_type: string }>();
      expect(result).not.toBeNull();
      expect(result!.event_type).toBe("parseFailed");

      await closeWs(ws);
    });
  });

  describe("unknown admin routes", () => {
    it("returns 404 for unknown admin path", async () => {
      const response = await adminFetch("/admin/nonexistent", ADMIN_KEY);
      expect(response.status).toBe(404);
    });
  });
});
