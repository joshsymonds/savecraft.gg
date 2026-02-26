import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";

/**
 * DaemonHub is a per-user Durable Object that relays WebSocket messages
 * between the daemon and the web UI. Uses WebSocket Hibernation so the
 * DO sleeps when no application messages are in flight.
 *
 * Connections are tagged "daemon" or "ui". Daemon messages forward to UI.
 * UI messages forward to daemon. Status events are persisted to D1.
 */
export class DaemonHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const url = new URL(request.url);
    const tag = url.pathname.includes("/daemon") ? "daemon" : "ui";

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server, [tag]);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const tags = this.ctx.getTags(ws);
    const msgStr = typeof message === "string" ? message : new TextDecoder().decode(message);

    if (tags.includes("daemon")) {
      // Forward daemon events to all UI connections
      for (const uiWs of this.ctx.getWebSockets("ui")) {
        uiWs.send(msgStr);
      }
      // Persist event to D1
      await this.persistEvent(msgStr);
    } else if (tags.includes("ui")) {
      // Forward UI commands to all daemon connections
      for (const daemonWs of this.ctx.getWebSockets("daemon")) {
        daemonWs.send(msgStr);
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    ws.close(1011, "Unexpected error");
  }

  private async persistEvent(message: string): Promise<void> {
    try {
      const parsed = JSON.parse(message) as Record<string, unknown>;
      // protojson serializes oneof as a single key at the top level
      // e.g. {"parseCompleted": {...}} — the key is the event type
      const eventType = Object.keys(parsed)[0];
      if (!eventType) return;

      // Extract user/device info from the WebSocket's DO identity
      // The DO is keyed by user UUID, so we get it from the DO name
      const userUuid = this.ctx.id.toString();

      // Try to extract device_id from the event data
      const eventData = parsed[eventType] as Record<string, unknown> | undefined;
      const deviceId = (eventData?.["deviceId"] as string) ?? "unknown";

      await this.env.DB.prepare(
        `INSERT INTO device_events (user_uuid, device_id, event_type, event_data)
         VALUES (?, ?, ?, ?)`
      ).bind(userUuid, deviceId, eventType, message).run();

      // Prune old events (keep last 100 per device)
      await this.env.DB.prepare(
        `DELETE FROM device_events
         WHERE user_uuid = ? AND device_id = ? AND id NOT IN (
           SELECT id FROM device_events
           WHERE user_uuid = ? AND device_id = ?
           ORDER BY created_at DESC LIMIT 100
         )`
      ).bind(userUuid, deviceId, userUuid, deviceId).run();
    } catch {
      // Don't let persistence failures break the relay
    }
  }
}
