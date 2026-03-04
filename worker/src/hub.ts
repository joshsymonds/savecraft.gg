import { DurableObject } from "cloudflare:workers";

import type {
  SourceInfo,
  SourceState,
  GameInfo,
  SaveIdentity,
} from "./proto/savecraft/v1/protocol";
import { GameStatusEnum, Message } from "./proto/savecraft/v1/protocol";
import type { Env } from "./types";

const STATE_KEY = "sourceState";
const CONN_PREFIX = "conn:";
const USER_UUID_KEY = "userUuid";

// ── StateMutation: closed discriminated union ────────────────────────

type StateMutation =
  | { kind: "sourceOnline"; sourceId: string }
  | { kind: "sourceOffline"; sourceId: string }
  | { kind: "gameStatus"; sourceId: string; gameId: string; status: GameStatusEnum }
  | {
      kind: "pushCompleted";
      sourceId: string;
      gameId: string;
      saveUuid: string;
      summary: string;
      identity: SaveIdentity | undefined;
    }
  | { kind: "none" };

// ── Pure state helpers ───────────────────────────────────────────────

function findSource(state: SourceState, sourceId: string): SourceInfo | undefined {
  return state.sources.find((s) => s.sourceId === sourceId);
}

function findOrCreateSource(state: SourceState, sourceId: string): SourceInfo {
  let source = findSource(state, sourceId);
  if (!source) {
    source = { sourceId, online: false, lastSeen: undefined, games: [] };
    state.sources.push(source);
  }
  return source;
}

function findOrCreateGame(source: SourceInfo, gameId: string): GameInfo {
  let game = source.games.find((g) => g.gameId === gameId);
  if (!game) {
    game = {
      gameId,
      gameName: "",
      status: GameStatusEnum.GAME_STATUS_ENUM_UNSPECIFIED,
      saves: [],
      lastActivity: undefined,
    };
    source.games.push(game);
  }
  return game;
}

function getConnTag(tags: string[]): string | undefined {
  return tags.find((t) => t.startsWith(CONN_PREFIX));
}

function findStaleSources(state: SourceState, thresholdMs: number): string[] {
  const now = Date.now();
  return state.sources
    .filter((s) => s.online && s.lastSeen && now - new Date(s.lastSeen).getTime() > thresholdMs)
    .map((s) => s.sourceId);
}

/**
 * Compare two semver-like version strings (e.g. "0.2.0" > "0.1.0").
 * Returns true if `latest` is strictly newer than `current`.
 */
function parseSemver(v: string): number[] {
  return v.split(".").map(Number);
}

function isNewerVersion(latest: string, current: string): boolean {
  const l = parseSemver(latest);
  const c = parseSemver(current);
  for (let index = 0; index < Math.max(l.length, c.length); index++) {
    const lp = l[index] ?? 0;
    const cp = c[index] ?? 0;
    if (lp > cp) return true;
    if (lp < cp) return false;
  }
  return false;
}

/**
 * Apply a resolved mutation to in-memory state. Pure — no I/O, no async.
 * Exhaustive over StateMutation.kind; the compiler enforces completeness.
 */
function applyMutation(state: SourceState, mutation: StateMutation): void {
  const now = new Date();

  switch (mutation.kind) {
    case "sourceOnline": {
      const source = findOrCreateSource(state, mutation.sourceId);
      source.online = true;
      source.lastSeen = now;
      break;
    }
    case "sourceOffline": {
      const source = findSource(state, mutation.sourceId);
      if (!source) return;
      source.online = false;
      source.lastSeen = now;
      break;
    }
    case "gameStatus": {
      const source = findOrCreateSource(state, mutation.sourceId);
      const game = findOrCreateGame(source, mutation.gameId);
      game.status = mutation.status;
      game.lastActivity = now;
      break;
    }
    case "pushCompleted": {
      const source = findOrCreateSource(state, mutation.sourceId);
      const game = findOrCreateGame(source, mutation.gameId);
      const existing = game.saves.find((s) => s.saveUuid === mutation.saveUuid);
      if (existing) {
        existing.summary = mutation.summary;
        existing.lastUpdated = now;
        if (mutation.identity) existing.identity = mutation.identity;
      } else {
        game.saves.push({
          saveUuid: mutation.saveUuid,
          identity: mutation.identity,
          summary: mutation.summary,
          lastUpdated: now,
        });
      }
      game.lastActivity = now;
      break;
    }
    case "none": {
      break;
    }
  }
}

/**
 * DaemonHub is a per-user Durable Object that relays WebSocket messages
 * between the source (daemon/mod) and the web UI. Uses WebSocket Hibernation
 * so the DO sleeps when no application messages are in flight.
 *
 * Connections are tagged "daemon" or "ui". Daemon connections also get
 * a unique "conn:{id}" tag to track per-connection source identity.
 * Source state is maintained in DO transactional storage for cold start.
 */
export class DaemonHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    // Persist userUuid from the worker on every authenticated request.
    // The worker sets X-User-UUID after verifying auth; storing it here
    // ensures it survives DO hibernation regardless of request order.
    const userUuidHeader = request.headers.get("X-User-UUID");
    if (userUuidHeader) {
      await this.ctx.storage.put(USER_UUID_KEY, userUuidHeader);
    }

    // Handle non-WebSocket requests (internal DO endpoints)
    if (request.headers.get("Upgrade") !== "websocket") {
      return this.routeHttpRequest(request);
    }

    const url = new URL(request.url);
    const tag = url.pathname.includes("/daemon") ? "daemon" : "ui";

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Daemon connections get a unique connection ID for per-source tracking
    const tags = tag === "daemon" ? [tag, `${CONN_PREFIX}${crypto.randomUUID()}`] : [tag];
    this.ctx.acceptWebSocket(server, tags);

    if (tag === "ui") {
      await this.sendSourceState(server);
      await this.sendRecentEvents(server);
    }

    // Echo Sec-WebSocket-Protocol so browser WS handshake succeeds
    // when using protocol-based auth (access_token.TOKEN)
    const protocol = request.headers.get("Sec-WebSocket-Protocol");
    const headers: HeadersInit = {};
    if (protocol) {
      // Select only the access_token protocol, not the raw value
      const selected = protocol
        .split(",")
        .map((s) => s.trim())
        .find((s) => s.startsWith("access_token."));
      if (selected) headers["Sec-WebSocket-Protocol"] = selected;
    }

    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const tags = this.ctx.getTags(ws);
    const msgString = typeof message === "string" ? message : new TextDecoder().decode(message);

    if (tags.includes("daemon")) {
      const rpc = this.parseMessage(msgString);
      await this.applySourceState(tags, rpc);

      // Heartbeat updates lastSeen (via applySourceState) but is not
      // relayed to UI or persisted — it's transport-level only.
      if (rpc?.payload?.$case === "sourceHeartbeat") return;

      // Resolve source sourceId (available after applySourceState stores
      // the conn->sourceId mapping on sourceOnline)
      const sourceId = await this.getSourceIdForConnection(tags);

      // Forward to UI with _sourceId and _ts injected so the frontend can
      // attribute game events to the correct source and show timestamps
      const forwardMsg = this.injectMetadata(msgString, {
        _sourceId: sourceId,
        _ts: new Date().toISOString(),
      });
      for (const uiWs of this.ctx.getWebSockets("ui")) {
        uiWs.send(forwardMsg);
      }

      await this.persistEvent(sourceId, rpc, msgString);
      await this.maybePushConfig(rpc);
      await this.maybePushSourceUpdate(ws, rpc);
    } else if (tags.includes("ui")) {
      for (const daemonWs of this.ctx.getWebSockets("daemon")) {
        daemonWs.send(msgString);
      }
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const tags = this.ctx.getTags(ws);
    if (tags.includes("daemon")) {
      await this.handleDaemonDisconnect(tags);
    }
    const safeCode = code === 1005 ? 1000 : code;
    ws.close(safeCode, reason);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    const tags = this.ctx.getTags(ws);
    if (tags.includes("daemon")) {
      await this.handleDaemonDisconnect(tags);
    }
    ws.close(1011, "Unexpected error");
  }

  // ── HTTP endpoints (non-WebSocket) ──────────────────────────────

  private async routeHttpRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/push-config" && request.method === "POST") {
      const body = await request.json<{ sourceId: string }>();
      const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);
      if (!userUuid) return Response.json({ error: "No user context" }, { status: 400 });
      await this.pushConfigToSource(body.sourceId, userUuid);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/rescan" && request.method === "POST") {
      return this.handleRescan(request);
    }
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  // ── Phase 1: Resolve — all async I/O, no state mutation ──────────

  /**
   * Resolve all external data needed to build a StateMutation.
   * This phase performs all async I/O (storage reads, D1 queries)
   * so that the subsequent load -> mutate -> save can run atomically.
   */
  private async resolveStateMutation(tags: string[], rpc: Message): Promise<StateMutation> {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- maps open proto union to closed StateMutation; unhandled events return "none"
    switch (rpc.payload?.$case) {
      case "sourceOnline": {
        const { sourceId } = rpc.payload.sourceOnline;
        const connTag = getConnTag(tags);
        if (connTag) await this.ctx.storage.put(connTag, sourceId);
        return { kind: "sourceOnline", sourceId };
      }
      case "sourceOffline": {
        return { kind: "sourceOffline", sourceId: rpc.payload.sourceOffline.sourceId };
      }
      case "gameDetected": {
        const sourceId = await this.getSourceIdForConnection(tags);
        if (!sourceId) return { kind: "none" };
        return {
          kind: "gameStatus",
          sourceId,
          gameId: rpc.payload.gameDetected.gameId,
          status: GameStatusEnum.GAME_STATUS_ENUM_DETECTED,
        };
      }
      case "watching": {
        const sourceId = await this.getSourceIdForConnection(tags);
        if (!sourceId) return { kind: "none" };
        return {
          kind: "gameStatus",
          sourceId,
          gameId: rpc.payload.watching.gameId,
          status: GameStatusEnum.GAME_STATUS_ENUM_WATCHING,
        };
      }
      case "gameNotFound": {
        const sourceId = await this.getSourceIdForConnection(tags);
        if (!sourceId) return { kind: "none" };
        return {
          kind: "gameStatus",
          sourceId,
          gameId: rpc.payload.gameNotFound.gameId,
          status: GameStatusEnum.GAME_STATUS_ENUM_NOT_FOUND,
        };
      }
      case "pushCompleted": {
        const sourceId = await this.getSourceIdForConnection(tags);
        if (!sourceId) return { kind: "none" };
        const { gameId, saveUuid, summary, identity } = rpc.payload.pushCompleted;
        return {
          kind: "pushCompleted",
          sourceId,
          gameId,
          saveUuid,
          summary,
          identity,
        };
      }
      default: {
        return { kind: "none" };
      }
    }
  }

  // ── Disconnect handler ────────────────────────────────────────────

  /**
   * Handle daemon WebSocket close/error: resolve sourceId from connection
   * tag, mark source offline, clean up mapping, and manage alarm lifecycle.
   */
  private async handleDaemonDisconnect(tags: string[]): Promise<void> {
    const connTag = getConnTag(tags);
    if (!connTag) return;
    const sourceId = await this.ctx.storage.get<string>(connTag);
    if (!sourceId) return;

    const state = await this.loadState();
    applyMutation(state, { kind: "sourceOffline", sourceId });
    await this.saveState(state);
    await this.ctx.storage.delete(connTag);

    // Delete alarm if no sources remain online
    if (!state.sources.some((s) => s.online)) {
      await this.ctx.storage.deleteAlarm();
    }
  }

  /**
   * DO alarm handler: check for stale daemon connections.
   * Fires every ALARM_INTERVAL_MS while any source is online.
   * Evicts sources whose lastSeen exceeds STALE_THRESHOLD_MS.
   */
  async alarm(): Promise<void> {
    const state = await this.loadState();
    const staleSourceIds = findStaleSources(state, this.env.STALE_THRESHOLD_MS ?? 90_000);

    if (staleSourceIds.length > 0) {
      await this.evictStaleSources(state, staleSourceIds);
    }

    // Reschedule if any sources still online
    if (state.sources.some((s) => s.online)) {
      const interval = this.env.ALARM_INTERVAL_MS ?? 30_000;
      await this.ctx.storage.setAlarm(Date.now() + interval);
    }
  }

  private async evictStaleSources(state: SourceState, staleSourceIds: string[]): Promise<void> {
    for (const sourceId of staleSourceIds) {
      applyMutation(state, { kind: "sourceOffline", sourceId });
    }
    await this.saveState(state);

    this.broadcastStaleOffline(staleSourceIds);
    await this.closeStaleConnections(staleSourceIds);
  }

  private broadcastStaleOffline(staleSourceIds: string[]): void {
    for (const sourceId of staleSourceIds) {
      const offlineMsg = JSON.stringify({
        sourceOffline: { sourceId },
        _sourceId: sourceId,
        _ts: new Date().toISOString(),
      });
      for (const uiWs of this.ctx.getWebSockets("ui")) {
        uiWs.send(offlineMsg);
      }
    }
  }

  private async closeStaleConnections(staleSourceIds: string[]): Promise<void> {
    for (const daemonWs of this.ctx.getWebSockets("daemon")) {
      const wsTags = this.ctx.getTags(daemonWs);
      const connTag = getConnTag(wsTags);
      if (!connTag) continue;
      const wsSourceId = await this.ctx.storage.get<string>(connTag);
      if (wsSourceId && staleSourceIds.includes(wsSourceId)) {
        await this.ctx.storage.delete(connTag);
        try {
          daemonWs.close(1000, "stale connection");
        } catch {
          // WebSocket may already be closed
        }
      }
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private async loadState(): Promise<SourceState> {
    const stored = await this.ctx.storage.get(STATE_KEY);
    if (!stored) return { sources: [] };
    return stored as SourceState;
  }

  private async saveState(state: SourceState): Promise<void> {
    await this.ctx.storage.put(STATE_KEY, state);
  }

  private async getSourceIdForConnection(tags: string[]): Promise<string | undefined> {
    const connTag = getConnTag(tags);
    if (!connTag) return undefined;
    return this.ctx.storage.get<string>(connTag);
  }

  private async sendSourceState(ws: WebSocket): Promise<void> {
    const state = await this.loadState();
    if (state.sources.length === 0) return;
    const envelope = Message.toJSON({ payload: { $case: "sourceState", sourceState: state } });
    ws.send(JSON.stringify(envelope));
  }

  private parseMessage(msgString: string): Message | undefined {
    try {
      const parsed = JSON.parse(msgString) as Record<string, unknown>;
      const rpc = Message.fromJSON(parsed);
      return rpc.payload ? rpc : undefined;
    } catch {
      return undefined;
    }
  }

  private async applySourceState(tags: string[], rpc: Message | undefined): Promise<StateMutation> {
    if (!rpc) return { kind: "none" };
    try {
      const mutation = await this.resolveStateMutation(tags, rpc);

      // Resolve sourceId for lastSeen update
      const sourceId =
        mutation.kind === "sourceOnline" || mutation.kind === "sourceOffline"
          ? mutation.sourceId
          : await this.getSourceIdForConnection(tags);

      // Load -> mutate -> update lastSeen -> save
      const state = await this.loadState();
      if (mutation.kind !== "none") {
        applyMutation(state, mutation);
      }
      if (sourceId) {
        const source = findSource(state, sourceId);
        if (source) source.lastSeen = new Date();
      }
      await this.saveState(state);

      // Set alarm when a source comes online
      if (mutation.kind === "sourceOnline") {
        const interval = this.env.ALARM_INTERVAL_MS ?? 30_000;
        await this.ctx.storage.setAlarm(Date.now() + interval);
      }

      return mutation;
    } catch {
      // Don't let state update failures break the relay
      return { kind: "none" };
    }
  }

  private async sendRecentEvents(ws: WebSocket): Promise<void> {
    try {
      const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);
      if (!userUuid) return;
      const rows = await this.env.DB.prepare(
        `SELECT event_data, created_at, source_id FROM source_events
         WHERE user_uuid = ?
         ORDER BY created_at DESC
         LIMIT 50`,
      )
        .bind(userUuid)
        .all<{ event_data: string; created_at: string; source_id: string }>();

      const events = rows.results.toReversed();
      for (const row of events) {
        ws.send(
          this.injectMetadata(row.event_data, {
            _ts: row.created_at.endsWith("Z") ? row.created_at : `${row.created_at}Z`,
            _sourceId: row.source_id,
          }),
        );
      }
    } catch {
      // Don't let cold start failures break the connection
    }
  }

  private async maybePushConfig(rpc: Message | undefined): Promise<void> {
    if (rpc?.payload?.$case !== "sourceOnline") return;
    try {
      const { sourceId } = rpc.payload.sourceOnline;
      const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);
      if (!userUuid) return;
      await this.pushConfigToSource(sourceId, userUuid);
    } catch {
      // Don't let config push failures break the relay
    }
  }

  private async maybePushSourceUpdate(ws: WebSocket, rpc: Message | undefined): Promise<void> {
    if (rpc?.payload?.$case !== "sourceOnline") return;
    try {
      const { version: sourceVersion, platform } = rpc.payload.sourceOnline;
      if (!sourceVersion || !platform) return;

      const installUrl = this.env.INSTALL_URL;
      if (!installUrl) return;

      const resp = await fetch(`${installUrl}/daemon/manifest.json`);
      if (!resp.ok) return;

      const manifest = await resp.json<{
        version: string;
        platforms: Record<string, { url: string; sha256: string; signatureUrl: string }>;
      }>();

      if (!isNewerVersion(manifest.version, sourceVersion)) return;

      const entry = manifest.platforms[platform];
      if (!entry) return;

      const updateMsg = JSON.stringify({
        sourceUpdateAvailable: {
          version: manifest.version,
          url: entry.url,
          signatureUrl: entry.signatureUrl,
          sha256: entry.sha256,
        },
      });

      ws.send(updateMsg);
    } catch {
      // Don't let update check failures break the relay
    }
  }

  private async pushConfigToSource(sourceId: string, userUuid: string): Promise<void> {
    const rows = await this.env.DB.prepare(
      `SELECT game_id, save_path, enabled, file_extensions
       FROM source_configs
       WHERE user_uuid = ? AND source_id = ?`,
    )
      .bind(userUuid, sourceId)
      .all<{
        game_id: string;
        save_path: string;
        enabled: number;
        file_extensions: string;
      }>();

    const games: Record<string, { savePath: string; enabled: boolean; fileExtensions: string[] }> =
      {};
    for (const row of rows.results) {
      games[row.game_id] = {
        savePath: row.save_path,
        enabled: row.enabled === 1,
        fileExtensions: JSON.parse(row.file_extensions) as string[],
      };
    }

    // Set ACTIVATING status for enabled games
    const enabledGameIds = Object.entries(games)
      .filter(([, cfg]) => cfg.enabled)
      .map(([id]) => id);

    if (enabledGameIds.length > 0) {
      const state = await this.loadState();
      for (const gameId of enabledGameIds) {
        applyMutation(state, {
          kind: "gameStatus",
          sourceId,
          gameId,
          status: GameStatusEnum.GAME_STATUS_ENUM_ACTIVATING,
        });
      }
      await this.saveState(state);

      // Broadcast updated state to all UI WebSockets
      for (const uiWs of this.ctx.getWebSockets("ui")) {
        await this.sendSourceState(uiWs);
      }
    }

    // Send config to daemon
    const msg = JSON.stringify({ configUpdate: { games } });
    for (const daemonWs of this.ctx.getWebSockets("daemon")) {
      const wsTags = this.ctx.getTags(daemonWs);
      const wsSourceId = await this.getSourceIdForConnection(wsTags);
      if (wsSourceId === sourceId) {
        daemonWs.send(msg);
      }
    }
  }

  private async handleRescan(request: Request): Promise<Response> {
    const body = await request.json<{ gameId: string }>();
    const daemonSockets = this.ctx.getWebSockets("daemon");
    if (daemonSockets.length === 0) {
      return Response.json({ sent: false, daemon_online: false });
    }
    const msg = JSON.stringify({ rescanGame: { gameId: body.gameId } });
    for (const ws of daemonSockets) {
      ws.send(msg);
    }
    return Response.json({ sent: true, daemon_count: daemonSockets.length });
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

  /** Internal pipeline events that are too noisy for the activity feed / D1. */
  private static readonly SKIP_PERSIST = new Set([
    "scanStarted",
    "scanCompleted",
    "parseStarted",
    "pluginStatus",
    "pushStarted",
  ]);

  private async persistEvent(
    sourceId: string | undefined,
    rpc: Message | undefined,
    rawMessage: string,
  ): Promise<void> {
    if (!rpc?.payload) return;
    try {
      const eventType = rpc.payload.$case;
      if (DaemonHub.SKIP_PERSIST.has(eventType)) return;
      const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);
      if (!userUuid) return;

      const resolvedSourceId = sourceId ?? "unknown";

      await this.env.DB.prepare(
        `INSERT INTO source_events (user_uuid, source_id, event_type, event_data)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(userUuid, resolvedSourceId, eventType, rawMessage)
        .run();

      await this.env.DB.prepare(
        `DELETE FROM source_events
         WHERE user_uuid = ? AND source_id = ? AND id NOT IN (
           SELECT id FROM source_events
           WHERE user_uuid = ? AND source_id = ?
           ORDER BY created_at DESC LIMIT 100
         )`,
      )
        .bind(userUuid, resolvedSourceId, userUuid, resolvedSourceId)
        .run();
    } catch {
      // Don't let persistence failures break the relay
    }
  }
}
