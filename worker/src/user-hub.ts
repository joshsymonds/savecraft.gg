import { DurableObject } from "cloudflare:workers";

import type { Env } from "./types";

const SOURCE_STATE_PREFIX = "source:";
const USER_UUID_KEY = "userUuid";

/**
 * UserHub is a per-user Durable Object that handles UI WebSocket connections.
 * It receives forwarded events and state updates from SourceHub DOs and
 * broadcasts them to connected UI clients. Uses WebSocket Hibernation.
 *
 * State is stored per-source (keyed by sourceUuid) and merged into a single
 * SourceState envelope when sent to UI clients.
 */
export class UserHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const userUuidHeader = request.headers.get("X-User-UUID");
    if (userUuidHeader) {
      await this.ctx.storage.put(USER_UUID_KEY, userUuidHeader);
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return this.routeHttpRequest(request);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server, ["ui"]);

    await this.sendSourceState(server);
    await this.sendRecentEvents(server);

    // Echo Sec-WebSocket-Protocol so browser WS handshake succeeds
    const protocol = request.headers.get("Sec-WebSocket-Protocol");
    const headers: HeadersInit = {};
    if (protocol) {
      const selected = protocol
        .split(",")
        .map((s) => s.trim())
        .find((s) => s.startsWith("access_token."));
      if (selected) headers["Sec-WebSocket-Protocol"] = selected;
    }

    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // No-op — UI→daemon commands will be added later
  }

  webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): void {
    const safeCode = code === 1005 ? 1000 : code;
    ws.close(safeCode, reason);
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    ws.close(1011, "Unexpected error");
  }

  // ── HTTP endpoints (internal, called by SourceHub) ────────────────

  private async routeHttpRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/forward-event" && request.method === "POST") {
      return this.handleForwardEvent(request);
    }
    if (url.pathname === "/update-state" && request.method === "POST") {
      return this.handleUpdateState(request);
    }
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  /**
   * Receive a forwarded daemon event from SourceHub and broadcast to all
   * UI clients with _sourceId and _ts metadata injected.
   */
  private async handleForwardEvent(request: Request): Promise<Response> {
    const body = await request.json<{ event: string; sourceId?: string }>();
    const enriched = this.injectMetadata(body.event, {
      _sourceId: body.sourceId,
      _ts: new Date().toISOString(),
    });
    for (const ws of this.ctx.getWebSockets("ui")) {
      ws.send(enriched);
    }
    return Response.json({ ok: true });
  }

  /**
   * Receive pre-serialized SourceState JSON from a single SourceHub.
   * Stored per-source so multiple SourceHubs can contribute state.
   * Pre-serialized to avoid Date→string round-trip issues with proto Timestamps.
   */
  private async handleUpdateState(request: Request): Promise<Response> {
    const body = await request.json<{ sourceUuid: string; stateJson: string }>();
    await this.ctx.storage.put(`${SOURCE_STATE_PREFIX}${body.sourceUuid}`, body.stateJson);
    // Build merged state once, broadcast to all connected UI clients
    const merged = await this.buildMergedSourceState();
    for (const ws of this.ctx.getWebSockets("ui")) {
      ws.send(merged);
    }
    return Response.json({ ok: true });
  }

  // ── Internal helpers ──────────────────────────────────────────────

  /**
   * Build merged SourceState JSON from all per-source storage entries.
   * Returns a single JSON string ready to send to UI clients.
   */
  private async buildMergedSourceState(): Promise<string> {
    const entries = await this.ctx.storage.list<string>({
      prefix: SOURCE_STATE_PREFIX,
    });
    // Each entry is a pre-serialized SourceState envelope like:
    // {"sourceState":{"sources":[...]}}
    // Merge all sources[] arrays into one.
    const allSources: unknown[] = [];
    for (const stateJson of entries.values()) {
      try {
        const parsed = JSON.parse(stateJson) as {
          sourceState?: { sources?: unknown[] };
        };
        if (parsed.sourceState?.sources) {
          allSources.push(...parsed.sourceState.sources);
        }
      } catch {
        // Skip malformed entries
      }
    }

    return JSON.stringify({ sourceState: { sources: allSources } });
  }

  /**
   * Load all per-source state entries, merge their sources[] arrays into
   * a single SourceState envelope, and send to the UI client.
   */
  private async sendSourceState(ws: WebSocket): Promise<void> {
    const merged = await this.buildMergedSourceState();
    ws.send(merged);
  }

  private async sendRecentEvents(ws: WebSocket): Promise<void> {
    try {
      const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);
      if (!userUuid) return;
      const rows = await this.env.DB.prepare(
        `SELECT event_data, created_at, source_uuid FROM source_events
         WHERE user_uuid = ?
         ORDER BY created_at DESC
         LIMIT 50`,
      )
        .bind(userUuid)
        .all<{ event_data: string; created_at: string; source_uuid: string }>();

      const events = rows.results.toReversed();
      for (const row of events) {
        ws.send(
          this.injectMetadata(row.event_data, {
            _ts: row.created_at.endsWith("Z") ? row.created_at : `${row.created_at}Z`,
            _sourceId: row.source_uuid,
          }),
        );
      }
    } catch {
      // Don't let cold start failures break the connection
    }
  }

  private injectMetadata(json: string, fields: Record<string, string | undefined>): string {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) parsed[key] = value;
      }
      return JSON.stringify(parsed);
    } catch {
      return json;
    }
  }
}
