import { DurableObject } from "cloudflare:workers";

import { DebugLog } from "./debug-log";
import { Message, RelayedMessage } from "./proto/savecraft/v1/protocol";
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
 *
 * All UI WebSocket sends use binary protobuf RelayedMessage frames.
 */
export class UserHub extends DurableObject<Env> {
  private readonly debugLog = new DebugLog();

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
    this.debugLog.push("info", "UI WebSocket accepted");

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
    this.debugLog.push("info", "UI WebSocket closed", { code, reason });
    const safeCode = code === 1005 ? 1000 : code;
    ws.close(safeCode, reason);
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    this.debugLog.push("error", "UI WebSocket error", {
      error: error instanceof Error ? error.message : String(error),
    });
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
    if (url.pathname === "/remove-source" && request.method === "POST") {
      return this.handleRemoveSource(request);
    }
    if (url.pathname === "/refresh-state" && request.method === "POST") {
      return this.handleRefreshState();
    }
    if (url.pathname.startsWith("/debug/") && request.method === "GET") {
      return this.routeDebugRequest(url);
    }
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  private async routeDebugRequest(url: URL): Promise<Response> {
    const subpath = url.pathname.slice("/debug/".length);

    if (subpath === "state") {
      const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);
      const mergedState = await this.buildMergedSourceState();
      return Response.json({
        userUuid: userUuid ?? null,
        mergedState: mergedState
          ? JSON.parse(JSON.stringify(Message.toJSON(mergedState))) as unknown
          : null,
      });
    }

    if (subpath === "connections") {
      const uiSockets = this.ctx.getWebSockets("ui");
      return Response.json({ uiCount: uiSockets.length });
    }

    if (subpath === "log") {
      const validLevels = new Set(["debug", "info", "warn", "error"]);
      const rawLevel = url.searchParams.get("level");
      const level =
        rawLevel && validLevels.has(rawLevel)
          ? (rawLevel as "debug" | "info" | "warn" | "error")
          : undefined;
      const rawLimit = url.searchParams.has("limit")
        ? Number(url.searchParams.get("limit"))
        : undefined;
      const limit = rawLimit ? Math.min(rawLimit, 200) : undefined;
      const entries = this.debugLog.entries({
        ...(level && { level }),
        ...(limit && { limit }),
      });
      return Response.json({ entries, size: this.debugLog.size });
    }

    if (subpath === "storage") {
      const allEntries = await this.ctx.storage.list();
      const keys = [...allEntries.keys()];
      return Response.json({ keys });
    }

    return Response.json({ error: "Unknown debug endpoint" }, { status: 404 });
  }

  /**
   * Receive a forwarded daemon event from SourceHub as binary proto bytes
   * and broadcast to all UI clients wrapped in a RelayedMessage.
   */
  private async handleForwardEvent(request: Request): Promise<Response> {
    const sourceId = request.headers.get("X-Source-ID") ?? undefined;
    const buf = await request.arrayBuffer();
    const decodedMsg = Message.decode(new Uint8Array(buf));

    const uiCount = this.ctx.getWebSockets("ui").length;
    this.debugLog.push("debug", "forwarding event to UI", { sourceId, uiCount });

    const relayed = RelayedMessage.encode({
      sourceId: sourceId ?? "",
      serverTimestamp: new Date(),
      message: decodedMsg,
    }).finish();

    for (const ws of this.ctx.getWebSockets("ui")) {
      ws.send(relayed);
    }
    return Response.json({ ok: true });
  }

  /**
   * Receive pre-encoded SourceState binary proto from a single SourceHub.
   * Stored per-source as JSON so multiple SourceHubs can contribute state
   * (JSON is needed for the merge operation across sources).
   * Broadcasts merged state as binary RelayedMessage to UI clients.
   */
  private async handleUpdateState(request: Request): Promise<Response> {
    const sourceUuid = request.headers.get("X-Source-UUID");
    if (!sourceUuid) {
      return Response.json({ error: "missing X-Source-UUID header" }, { status: 400 });
    }

    const buf = await request.arrayBuffer();
    const decodedMsg = Message.decode(new Uint8Array(buf));

    this.debugLog.push("debug", "state updated for source", { sourceUuid });

    // Store as JSON for merging across sources
    const stateJson = JSON.stringify(Message.toJSON(decodedMsg));
    await this.ctx.storage.put(`${SOURCE_STATE_PREFIX}${sourceUuid}`, stateJson);

    // Build merged state and broadcast as binary RelayedMessage
    const mergedState = await this.buildMergedSourceState();
    if (mergedState) {
      const relayed = RelayedMessage.encode({
        sourceId: "",
        serverTimestamp: new Date(),
        message: mergedState,
      }).finish();

      for (const ws of this.ctx.getWebSockets("ui")) {
        ws.send(relayed);
      }
    }
    return Response.json({ ok: true });
  }

  /**
   * Called when a source is permanently deleted by the user.
   * Drops the per-source state entry and rebroadcasts merged state to UI.
   */
  private async handleRemoveSource(request: Request): Promise<Response> {
    const body = await request.json<{ sourceUuid: string }>();
    this.debugLog.push("info", "source removed", { sourceUuid: body.sourceUuid });
    await this.ctx.storage.delete(`${SOURCE_STATE_PREFIX}${body.sourceUuid}`);

    const mergedState = await this.buildMergedSourceState();
    if (mergedState) {
      const relayed = RelayedMessage.encode({
        sourceId: "",
        serverTimestamp: new Date(),
        message: mergedState,
      }).finish();

      for (const ws of this.ctx.getWebSockets("ui")) {
        ws.send(relayed);
      }
    }
    return Response.json({ ok: true });
  }

  /**
   * Rebuild and broadcast merged state to all UI clients.
   * Called after game removal or other state-changing operations.
   */
  private async handleRefreshState(): Promise<Response> {
    const mergedState = await this.buildMergedSourceState();
    if (mergedState) {
      const relayed = RelayedMessage.encode({
        sourceId: "",
        serverTimestamp: new Date(),
        message: mergedState,
      }).finish();

      for (const ws of this.ctx.getWebSockets("ui")) {
        ws.send(relayed);
      }
    }
    return Response.json({ ok: true });
  }

  // ── Internal helpers ──────────────────────────────────────────────

  /**
   * Build merged SourceState Message from all per-source storage entries.
   * Each entry is a JSON-serialized Message with a sourceState payload.
   * Returns the merged Message, or undefined if no state exists.
   */
  private async buildMergedSourceState(): Promise<Message | undefined> {
    const entries = await this.ctx.storage.list<string>({
      prefix: SOURCE_STATE_PREFIX,
    });

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

    // Reconstruct a Message from the merged JSON via fromJSON
    const mergedJson = { sourceState: { sources: allSources } };
    return Message.fromJSON(mergedJson);
  }

  /**
   * Load all per-source state entries, merge their sources[] arrays into
   * a single SourceState envelope, wrap in RelayedMessage, and send binary to the UI client.
   */
  private async sendSourceState(ws: WebSocket): Promise<void> {
    const mergedState = await this.buildMergedSourceState();
    if (!mergedState) return;

    const relayed = RelayedMessage.encode({
      sourceId: "",
      serverTimestamp: new Date(),
      message: mergedState,
    }).finish();

    ws.send(relayed);
  }

  private async sendRecentEvents(ws: WebSocket): Promise<void> {
    try {
      const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);
      if (!userUuid) return;
      const rows = await this.env.DB.prepare(
        `SELECT e.event_data, e.created_at, e.source_uuid FROM source_events e
         JOIN sources s ON e.source_uuid = s.source_uuid
         WHERE s.user_uuid = ?
         ORDER BY e.created_at DESC
         LIMIT 50`,
      )
        .bind(userUuid)
        .all<{ event_data: string; created_at: string; source_uuid: string }>();

      const events = rows.results.toReversed();
      for (const row of events) {
        const decodedMsg = Message.fromJSON(JSON.parse(row.event_data) as Record<string, unknown>);
        const createdAt = row.created_at.endsWith("Z") ? row.created_at : `${row.created_at}Z`;

        const relayed = RelayedMessage.encode({
          sourceId: row.source_uuid,
          serverTimestamp: new Date(createdAt),
          message: decodedMsg,
        }).finish();

        ws.send(relayed);
      }
    } catch (error) {
      this.debugLog.push("error", "recent events load failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
