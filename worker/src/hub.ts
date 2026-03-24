import { DurableObject } from "cloudflare:workers";

import { DebugLog } from "./debug-log";
import type {
  GameInfo,
  PushSave,
  SaveIdentity,
  SourceInfo,
  SourceState,
} from "./proto/savecraft/v1/protocol";
import { GameStatusEnum, Message, PushSaveError } from "./proto/savecraft/v1/protocol";
import type { SectionInput } from "./store";
import { resolveGameName, storePush } from "./store";
import type { Env } from "./types";

const STATE_KEY = "sourceState";
const CONN_PREFIX = "conn:";
const USER_UUID_KEY = "userUuid";
const SOURCE_UUID_KEY = "sourceUuid";
const META_KEY = "sourceMeta";
const LINK_CODE_TTL_MINUTES = 20;
const MAX_SECTIONS = 50;
const MAX_PUSH_SIZE_BYTES = 1_048_576; // 1MB

/** Encode a sourceOffline proto event for forwarding to UserHub. */
function encodeSourceOfflineEvent(): Uint8Array {
  const msg: Message = {
    payload: { $case: "sourceOffline", sourceOffline: { timestamp: undefined } },
  };
  return Message.encode(msg).finish();
}

function generateSixDigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const code = ((buf[0] ?? 0) % 900_000) + 100_000;
  return code.toString();
}

interface SourceMeta {
  sourceKind: string;
  hostname: string;
  platform: string;
  os: string;
  arch: string;
  device: string;
  canRescan: boolean;
  canReceiveConfig: boolean;
}

const DEFAULT_SOURCE_META: SourceMeta = {
  sourceKind: "daemon",
  hostname: "",
  platform: "",
  os: "",
  arch: "",
  device: "",
  canRescan: true,
  canReceiveConfig: true,
};

// ── StateMutation: closed discriminated union ────────────────────────

type StateMutation =
  | { kind: "sourceOnline"; sourceId: string }
  | { kind: "sourceOffline"; sourceId: string }
  | { kind: "gameStatus"; sourceId: string; gameId: string; status: GameStatusEnum; path: string }
  | {
      kind: "pushCompleted";
      sourceId: string;
      gameId: string;
      saveUuid: string;
      summary: string;
      identity: SaveIdentity | undefined;
    }
  | {
      kind: "setGameStatus";
      sourceId: string;
      gameId: string;
      gameName: string;
      status: GameStatusEnum;
      error: string;
    }
  | { kind: "none" };

// ── Pure state helpers ───────────────────────────────────────────────

function findSource(state: SourceState, sourceId: string): SourceInfo | undefined {
  return state.sources.find((s) => s.sourceId === sourceId);
}

function findOrCreateSource(state: SourceState, sourceId: string): SourceInfo {
  let source = findSource(state, sourceId);
  if (!source) {
    source = {
      sourceId,
      online: false,
      lastSeen: undefined,
      games: [],
      sourceKind: "",
      hostname: "",
      platform: "",
      os: "",
      arch: "",
      device: "",
      canRescan: true,
      canReceiveConfig: true,
    };
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
      path: "",
      error: "",
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
      if (mutation.path) game.path = mutation.path;
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
    case "setGameStatus": {
      const source = findOrCreateSource(state, mutation.sourceId);
      source.online = true;
      source.lastSeen = now;
      const game = findOrCreateGame(source, mutation.gameId);
      game.gameName = mutation.gameName;
      game.status = mutation.status;
      game.error = mutation.error;
      game.lastActivity = now;
      break;
    }
    case "none": {
      break;
    }
  }
}

/**
 * SourceHub is a per-source Durable Object (keyed by source_uuid) that handles daemon/mod WebSocket
 * connections. Uses WebSocket Hibernation so the DO sleeps when no
 * application messages are in flight.
 *
 * Daemon connections get a unique "conn:{id}" tag to track per-connection
 * source identity. Source state is maintained in DO transactional storage.
 * Events and state updates are forwarded to UserHub for UI broadcast.
 */
export class SourceHub extends DurableObject<Env> {
  private readonly debugLog = new DebugLog();

  async fetch(request: Request): Promise<Response> {
    // Persist source and user UUIDs from the worker on every authenticated request.
    // The worker sets these headers after verifying auth; storing them here
    // ensures they survive DO hibernation regardless of request order.
    const sourceUuidHeader = request.headers.get("X-Source-UUID");
    if (sourceUuidHeader) {
      await this.ctx.storage.put(SOURCE_UUID_KEY, sourceUuidHeader);
    }
    const userUuidHeader = request.headers.get("X-User-UUID");
    if (userUuidHeader) {
      await this.ctx.storage.put(USER_UUID_KEY, userUuidHeader);
    }

    // Handle non-WebSocket requests (internal DO endpoints)
    if (request.headers.get("Upgrade") !== "websocket") {
      return this.routeHttpRequest(request);
    }

    // SourceHub only accepts daemon connections (UI goes to UserHub)
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const connId = crypto.randomUUID();
    const tags = ["daemon", `${CONN_PREFIX}${connId}`];
    this.ctx.acceptWebSocket(server, tags);
    this.debugLog.push("info", "daemon WebSocket accepted", { connId });

    // Echo Sec-WebSocket-Protocol so browser WS handshake succeeds
    // when using protocol-based auth (access_token.TOKEN)
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

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const tags = this.ctx.getTags(ws);
    const msgBuf =
      typeof message === "string"
        ? (new TextEncoder().encode(message).buffer as ArrayBuffer)
        : message;

    if (!tags.includes("daemon")) return;

    const rpc = await this.parseMessage(msgBuf);
    const payloadType = rpc?.payload?.$case ?? "unknown";
    this.debugLog.push("info", "message received", { payloadType });

    const { mutation, sourceId } = await this.applySourceState(tags, rpc);

    if (await this.handleSpecialMessage(ws, rpc, sourceId)) return;

    // After SourceOnline, tell daemon its link state so it doesn't need to poll.
    if (rpc?.payload?.$case === "sourceOnline") {
      await this.notifyLinkState(ws, sourceId);
    }

    // Source management messages — handled inline, not relayed.
    if (await this.dispatchSourceManagement(ws, rpc, sourceId)) return;

    await this.processEvent(ws, rpc, sourceId, mutation);
  }

  /** Handle heartbeat and pushSave early — these skip persist/relay. Returns true if handled. */
  private async handleSpecialMessage(
    ws: WebSocket,
    rpc: Message | undefined,
    sourceId: string | undefined,
  ): Promise<boolean> {
    if (rpc?.payload?.$case === "sourceHeartbeat") {
      await this.forwardStateToUserHub();
      return true;
    }
    if (rpc?.payload?.$case === "pushSave") {
      await this.handlePushSave(ws, rpc.payload.pushSave, sourceId);
      return true;
    }
    return false;
  }

  /** Dispatch source management messages. Returns true if handled. */
  private async dispatchSourceManagement(
    ws: WebSocket,
    rpc: Message | undefined,
    sourceId: string | undefined,
  ): Promise<boolean> {
    const payloadCase = rpc?.payload?.$case;
    if (payloadCase === "refreshLinkCode") {
      await this.handleRefreshLinkCode(ws, sourceId);
      return true;
    }
    if (payloadCase === "unlinkSource") {
      await this.handleUnlinkSource(ws, sourceId);
      return true;
    }
    if (payloadCase === "deregisterSource") {
      await this.handleDeregisterSource(ws, sourceId);
      return true;
    }
    return false;
  }

  /** Persist, relay, and react to a daemon event (non-heartbeat, non-push). */
  private async processEvent(
    ws: WebSocket,
    rpc: Message | undefined,
    sourceId: string | undefined,
    mutation: { kind: string },
  ): Promise<void> {
    // JSON for D1 persistence (storage boundary stays JSON)
    const eventJson = rpc ? JSON.stringify(Message.toJSON(rpc)) : undefined;
    // Binary proto bytes for UserHub relay
    const eventBytes = rpc ? Message.encode(rpc).finish() : undefined;

    // Persist before forwarding — ensures D1 is written before UI sees the event
    await this.persistEvent(sourceId, rpc, eventJson);
    await this.maybePersistConfigResult(rpc);

    // Forward binary event to UserHub for UI broadcast
    if (eventBytes) {
      await this.forwardEventToUserHub(eventBytes, sourceId);
    }

    // Broadcast updated state after event — UI gets the event first,
    // then the state snapshot reflecting it
    if (mutation.kind !== "none") {
      await this.forwardStateToUserHub();
    }

    await this.maybePushConfig(rpc);
    await this.maybeAutoEnableGame(rpc);
    await this.maybeAutoEnableDiscoveredGames(rpc);
    await this.maybePushSourceUpdate(ws, rpc);
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    this.debugLog.push("info", "WebSocket closed", { code, reason });
    const tags = this.ctx.getTags(ws);
    if (tags.includes("daemon")) {
      await this.handleDaemonDisconnect(tags);
    }
    const safeCode = code === 1005 ? 1000 : code;
    ws.close(safeCode, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.debugLog.push("error", "WebSocket error", {
      error: error instanceof Error ? error.message : String(error),
    });
    const tags = this.ctx.getTags(ws);
    if (tags.includes("daemon")) {
      await this.handleDaemonDisconnect(tags);
    }
    ws.close(1011, "Unexpected error");
  }

  // ── HTTP endpoints (non-WebSocket) ──────────────────────────────

  private async routeHttpRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST") {
      return this.routePostRequest(request, url);
    }
    if (url.pathname === "/status" && request.method === "GET") {
      return this.handleStatus();
    }
    if (url.pathname.startsWith("/debug/") && request.method === "GET") {
      return this.routeDebugRequest(url);
    }
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  private async routePostRequest(request: Request, url: URL): Promise<Response> {
    switch (url.pathname) {
      case "/cleanup": {
        return this.handleCleanup();
      }
      case "/push-config": {
        const body = await request.json<{ sourceId: string }>();
        await this.pushConfigToSource(body.sourceId);
        return Response.json({ ok: true });
      }
      case "/rescan": {
        return this.handleRescan(request);
      }
      case "/set-game-status": {
        return this.handleSetGameStatus(request);
      }
      case "/set-user": {
        return this.handleSetUser(request);
      }
      case "/push-update": {
        return this.handlePushUpdate(request);
      }
      case "/restore-save": {
        return this.handleRestoreSaveState(request);
      }
      default: {
        return new Response("Not found", { status: 404 });
      }
    }
  }

  private async routeDebugRequest(url: URL): Promise<Response> {
    const subpath = url.pathname.slice("/debug/".length);

    if (subpath === "state") {
      const sourceState = await this.loadState();
      const sourceUuid = await this.ctx.storage.get<string>(SOURCE_UUID_KEY);
      const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);
      const sourceMeta = await this.ctx.storage.get(META_KEY);
      const alarm = await this.ctx.storage.getAlarm();
      return Response.json({
        sourceState,
        sourceUuid: sourceUuid ?? null,
        userUuid: userUuid ?? null,
        sourceMeta: sourceMeta ?? null,
        alarm: alarm ? new Date(alarm).toISOString() : null,
      });
    }

    if (subpath === "connections") {
      const daemonSockets = this.ctx.getWebSockets("daemon");
      const connections = daemonSockets.map((ws) => {
        const tags = this.ctx.getTags(ws);
        return { tags };
      });
      return Response.json({
        daemonCount: daemonSockets.length,
        connections,
      });
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
        // Use the server-authoritative source_uuid, not the daemon's self-reported sourceId.
        // The SourceHub DO is keyed by source_uuid and always has it in storage.
        const sourceUuid = await this.ctx.storage.get<string>(SOURCE_UUID_KEY);
        if (!sourceUuid) return { kind: "none" };
        const connTag = getConnTag(tags);
        if (connTag) await this.ctx.storage.put(connTag, sourceUuid);
        return { kind: "sourceOnline", sourceId: sourceUuid };
      }
      case "sourceOffline": {
        const sourceUuid = await this.ctx.storage.get<string>(SOURCE_UUID_KEY);
        if (!sourceUuid) return { kind: "none" };
        return { kind: "sourceOffline", sourceId: sourceUuid };
      }
      case "gameDetected": {
        const sourceId = await this.getSourceIdForConnection(tags);
        if (!sourceId) return { kind: "none" };
        return {
          kind: "gameStatus",
          sourceId,
          gameId: rpc.payload.gameDetected.gameId,
          status: GameStatusEnum.GAME_STATUS_ENUM_DETECTED,
          path: rpc.payload.gameDetected.path,
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
          path: rpc.payload.watching.path,
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
          path: "",
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

    this.debugLog.push("info", "daemon disconnected", { sourceId, connTag });

    const state = await this.loadState();
    applyMutation(state, { kind: "sourceOffline", sourceId });
    await this.saveState(state);
    await this.ctx.storage.delete(connTag);

    // Forward sourceOffline event AND updated state to UserHub.
    // Both have their own try/catch — belt and suspenders.
    await this.forwardEventToUserHub(encodeSourceOfflineEvent(), sourceId);
    await this.forwardStateToUserHub();

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
    this.debugLog.push("debug", "alarm fired");
    try {
      // Adapter sources are never stale-evicted — their lifecycle is driven
      // by the cron job, not WebSocket presence. Returning early also skips
      // the reschedule block below, so the alarm fires once and stops.
      const meta = await this.getSourceMeta();
      if (meta.sourceKind === "adapter") {
        this.debugLog.push("debug", "skipping stale check for adapter source");
        return;
      }

      const state = await this.loadState();
      const staleSourceIds = findStaleSources(state, this.env.STALE_THRESHOLD_MS ?? 90_000);

      if (staleSourceIds.length > 0) {
        this.debugLog.push("info", "evicting stale sources", { staleSourceIds });
        await this.evictStaleSources(state, staleSourceIds);
      }
    } catch (error) {
      this.debugLog.push("error", "alarm handler failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Always reschedule if any sources are still online. Load fresh state
    // in case the try block failed partway through a mutation.
    try {
      const state = await this.loadState();
      if (state.sources.some((s) => s.online)) {
        const interval = this.env.ALARM_INTERVAL_MS ?? 30_000;
        await this.ctx.storage.setAlarm(Date.now() + interval);
        this.debugLog.push("debug", "alarm rescheduled", { intervalMs: interval });
      }
    } catch {
      // Last resort: reschedule unconditionally so we don't lose the alarm
      await this.ctx.storage.setAlarm(Date.now() + (this.env.ALARM_INTERVAL_MS ?? 30_000));
    }
  }

  private async evictStaleSources(state: SourceState, staleSourceIds: string[]): Promise<void> {
    for (const sourceId of staleSourceIds) {
      applyMutation(state, { kind: "sourceOffline", sourceId });
    }
    await this.saveState(state);

    // Forward offline events and updated state to UserHub
    const offlineBytes = encodeSourceOfflineEvent();
    await Promise.all(
      staleSourceIds.map((sourceId) => this.forwardEventToUserHub(offlineBytes, sourceId)),
    );
    await this.forwardStateToUserHub();

    await this.closeStaleConnections(staleSourceIds);
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

  private async fetchSourceMetaFromD1(sourceUuid: string): Promise<SourceMeta> {
    const row = await this.env.DB.prepare(
      "SELECT source_kind, hostname, os, arch, device, can_rescan, can_receive_config FROM sources WHERE source_uuid = ?",
    )
      .bind(sourceUuid)
      .first<{
        source_kind: string;
        hostname: string | null;
        os: string | null;
        arch: string | null;
        device: string | null;
        can_rescan: number;
        can_receive_config: number;
      }>();

    return {
      sourceKind: row?.source_kind ?? "daemon",
      hostname: row?.hostname ?? "",
      platform: row?.os ?? "",
      os: row?.os ?? "",
      arch: row?.arch ?? "",
      device: row?.device ?? "",
      canRescan: row?.can_rescan !== 0,
      canReceiveConfig: row?.can_receive_config !== 0,
    };
  }

  private async getSourceMeta(): Promise<SourceMeta> {
    const cached = await this.ctx.storage.get<SourceMeta & { cachedAt: number }>(META_KEY);
    if (cached && Date.now() - cached.cachedAt < 5 * 60_000) {
      return {
        sourceKind: cached.sourceKind,
        hostname: cached.hostname,
        platform: cached.platform,
        os: cached.os,
        arch: cached.arch,
        device: cached.device,
        canRescan: cached.canRescan,
        canReceiveConfig: cached.canReceiveConfig,
      };
    }

    const sourceUuid = await this.ctx.storage.get<string>(SOURCE_UUID_KEY);
    if (!sourceUuid) return DEFAULT_SOURCE_META;

    const meta = await this.fetchSourceMetaFromD1(sourceUuid);
    await this.ctx.storage.put(META_KEY, { ...meta, cachedAt: Date.now() });
    return meta;
  }

  private async getSourceIdForConnection(tags: string[]): Promise<string | undefined> {
    const connTag = getConnTag(tags);
    if (!connTag) return undefined;
    return this.ctx.storage.get<string>(connTag);
  }

  private async parseMessage(data: ArrayBuffer): Promise<Message | undefined> {
    try {
      const raw = new Uint8Array(data);
      const bytes = isGzipped(raw) ? await gunzip(raw) : raw;
      const rpc = Message.decode(bytes);
      return rpc.payload ? rpc : undefined;
    } catch {
      return undefined;
    }
  }

  private async applySourceState(
    tags: string[],
    rpc: Message | undefined,
  ): Promise<{ mutation: StateMutation; sourceId: string | undefined }> {
    if (!rpc) return { mutation: { kind: "none" }, sourceId: undefined };
    try {
      const mutation = await this.resolveStateMutation(tags, rpc);

      if (mutation.kind !== "none") {
        this.debugLog.push("info", "state mutation applied", { kind: mutation.kind });
      }

      // Resolve sourceId for lastSeen update (also returned to caller)
      const sourceId =
        mutation.kind === "none" ? await this.getSourceIdForConnection(tags) : mutation.sourceId;

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

      return { mutation, sourceId };
    } catch (error) {
      this.debugLog.push("error", "state mutation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("applySourceState", error);
      return { mutation: { kind: "none" }, sourceId: undefined };
    }
  }

  private async maybePersistConfigResult(rpc: Message | undefined): Promise<void> {
    if (rpc?.payload?.$case !== "configResult") return;
    try {
      const sourceUuid = await this.ctx.storage.get<string>(SOURCE_UUID_KEY);
      if (!sourceUuid) return;
      const { results } = rpc.payload.configResult;
      const now = new Date().toISOString();
      const batch = Object.entries(results).map(([gameId, result]) =>
        this.env.DB.prepare(
          `UPDATE source_configs
           SET config_status = ?, resolved_path = ?, last_error = ?, result_at = ?
           WHERE source_uuid = ? AND game_id = ?`,
        ).bind(
          result.success ? "success" : "error",
          result.resolvedPath,
          result.error,
          now,
          sourceUuid,
          gameId,
        ),
      );
      if (batch.length > 0) {
        await this.env.DB.batch(batch);
      }
    } catch (error) {
      this.debugLog.push("error", "config result persistence failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("maybePersistConfigResult", error);
    }
  }

  private async maybePushConfig(rpc: Message | undefined): Promise<void> {
    if (rpc?.payload?.$case !== "sourceOnline") return;
    try {
      const caps = await this.getSourceMeta();
      if (!caps.canReceiveConfig) return;
      const sourceUuid = await this.ctx.storage.get<string>(SOURCE_UUID_KEY);
      if (!sourceUuid) return;
      await this.pushConfigToSource(sourceUuid);
    } catch (error) {
      this.debugLog.push("error", "config push failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("maybePushConfig", error);
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

      const updateMsg = Message.encode({
        payload: {
          $case: "sourceUpdateAvailable",
          sourceUpdateAvailable: {
            version: manifest.version,
            url: entry.url,
            signatureUrl: entry.signatureUrl,
            sha256: entry.sha256,
          },
        },
      }).finish();

      this.debugLog.push("info", "source update available", { version: manifest.version });
      ws.send(updateMsg);
    } catch (error) {
      this.debugLog.push("error", "source update check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("maybePushSourceUpdate", error);
    }
  }

  /**
   * Handle a PushSave message from the daemon: write save data to D1,
   * send PushSaveResult back to the daemon, then synthesize and forward
   * a pushCompleted event through the normal relay pipeline.
   */
  private async handlePushSave(
    ws: WebSocket,
    push: PushSave,
    sourceId: string | undefined,
  ): Promise<void> {
    try {
      const userUuid = (await this.ctx.storage.get<string>(USER_UUID_KEY)) ?? null;
      if (!sourceId) {
        this.debugLog.push("warn", "pushSave missing sourceId");
        return;
      }

      const saveName = push.identity?.name ?? "";
      if (!saveName || !push.gameId) {
        this.debugLog.push("warn", "pushSave missing identity or gameId");
        return;
      }

      // Check if the push should be rejected (disabled game or excluded save)
      const rejection = await this.checkPushRejection(sourceId, push.gameId, saveName);
      if (rejection) {
        this.debugLog.push("warn", rejection.reason, { gameId: push.gameId, saveName, sourceId });
        ws.send(
          Message.encode({
            payload: {
              $case: "pushSaveResult",
              pushSaveResult: {
                saveUuid: "",
                snapshotTimestamp: undefined,
                error: rejection.error,
                gameId: push.gameId,
              },
            },
          }).finish(),
        );
        return;
      }

      const validated = this.validateAndConvertSections(push);
      if ("reason" in validated) {
        this.debugLog.push("warn", validated.reason, validated.detail);
        return;
      }
      const sections = validated.sections;

      const parsedAt = push.parsedAt?.toISOString() ?? new Date().toISOString();

      const { saveUuid, changed } = await storePush(
        this.env,
        userUuid,
        sourceId,
        push.gameId,
        saveName,
        push.summary,
        parsedAt,
        sections,
        push.allSectionNames,
      );

      // Send PushSaveResult back to daemon
      const resultMsg = Message.encode({
        payload: {
          $case: "pushSaveResult",
          pushSaveResult: {
            saveUuid,
            snapshotTimestamp: push.parsedAt,
            error: PushSaveError.PUSH_SAVE_ERROR_UNSPECIFIED,
            gameId: push.gameId,
          },
        },
      }).finish();
      ws.send(resultMsg);

      this.debugLog.push("info", "pushSave completed", { saveUuid, gameId: push.gameId, changed });

      // Only emit pushCompleted event when data actually changed.
      if (changed) {
        await this.synthesizePushCompleted(sourceId, push, saveUuid);
      }
    } catch (error) {
      this.debugLog.push("error", "pushSave failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("handlePushSave", error);
    }
  }

  /** Check if a push should be rejected due to disabled game or excluded save. */
  private async checkPushRejection(
    sourceId: string,
    gameId: string,
    saveName: string,
  ): Promise<{ error: PushSaveError; reason: string } | null> {
    const config = await this.env.DB.prepare(
      "SELECT enabled, exclude_saves FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceId, gameId)
      .first<{ enabled: number; exclude_saves: string }>();

    if (config && !config.enabled) {
      return {
        error: PushSaveError.PUSH_SAVE_ERROR_GAME_REMOVED,
        reason: "pushSave rejected: game disabled",
      };
    }

    if (config?.exclude_saves) {
      let excludeSaves: string[] = [];
      try {
        excludeSaves = JSON.parse(config.exclude_saves) as string[];
      } catch {
        // Corrupted JSON — treat as empty (no saves excluded)
      }
      if (excludeSaves.some((s) => s.toLowerCase() === saveName.toLowerCase())) {
        return {
          error: PushSaveError.PUSH_SAVE_ERROR_SAVE_REMOVED,
          reason: "pushSave rejected: save excluded",
        };
      }
    }

    return null;
  }

  /** Validate PushSave limits and convert sections in a single pass. */
  private validateAndConvertSections(
    push: PushSave,
  ):
    | { reason: string; detail: Record<string, unknown> }
    | { sections: Record<string, SectionInput> } {
    if (push.sections.length > MAX_SECTIONS) {
      return {
        reason: "pushSave rejected: too many sections",
        detail: { count: push.sections.length },
      };
    }
    let totalSize = 0;
    const sections: Record<string, SectionInput> = {};
    for (const section of push.sections) {
      const data = section.data;
      if (data === undefined) {
        continue;
      }
      totalSize += JSON.stringify(data).length;
      if (totalSize > MAX_PUSH_SIZE_BYTES) {
        return {
          reason: "pushSave rejected: total size exceeds limit",
          detail: { totalSize },
        };
      }
      sections[section.name] = {
        description: section.description,
        data: data as Record<string, unknown>,
      };
    }
    return { sections };
  }

  /** Synthesize a pushCompleted event: mutate state, persist, and relay to UserHub. */
  private async synthesizePushCompleted(
    sourceId: string,
    push: PushSave,
    saveUuid: string,
  ): Promise<void> {
    const pushCompletedMsg: Message = {
      payload: {
        $case: "pushCompleted",
        pushCompleted: {
          gameId: push.gameId,
          saveUuid,
          summary: push.summary,
          identity: push.identity,
          snapshotSizeBytes: 0,
          durationMs: 0,
        },
      },
    };

    const state = await this.loadState();
    applyMutation(state, {
      kind: "pushCompleted",
      sourceId,
      gameId: push.gameId,
      saveUuid,
      summary: push.summary,
      identity: push.identity,
    });
    await this.saveState(state);

    const eventJson = JSON.stringify(Message.toJSON(pushCompletedMsg));
    const eventBytes = Message.encode(pushCompletedMsg).finish();
    await this.persistEvent(sourceId, pushCompletedMsg, eventJson);
    await Promise.all([
      this.forwardEventToUserHub(eventBytes, sourceId),
      this.forwardStateToUserHub(),
    ]);
  }

  /**
   * When daemon reports a newly detected game, auto-create a config entry
   * (enabled, with the detected path) and push config to start watching.
   * Skips if config already exists (don't overwrite user's path or re-enable disabled games).
   */
  private async maybeAutoEnableGame(rpc: Message | undefined): Promise<void> {
    if (rpc?.payload?.$case !== "gameDetected") return;
    const { gameId, path } = rpc.payload.gameDetected;
    if (!gameId || !path) return;

    try {
      const sourceUuid = await this.ctx.storage.get<string>(SOURCE_UUID_KEY);
      if (!sourceUuid) return;

      // Check if config already exists for this source+game
      const existing = await this.env.DB.prepare(
        "SELECT 1 FROM source_configs WHERE source_uuid = ? AND game_id = ?",
      )
        .bind(sourceUuid, gameId)
        .first();

      if (existing) return; // Don't overwrite existing config (enabled or disabled)

      // Auto-create enabled config with the detected path
      await this.env.DB.prepare(
        `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions, file_patterns, exclude_dirs)
         VALUES (?, ?, ?, 1, '[]', '[]', '[]')`,
      )
        .bind(sourceUuid, gameId, path)
        .run();

      this.debugLog.push("info", "game auto-enabled", { gameId, sourceUuid });
      // Push updated config to daemon so it starts watching.
      await this.pushConfigToSource(sourceUuid);
    } catch (error) {
      this.debugLog.push("error", "game auto-enable failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("maybeAutoEnableGame", error);
    }
  }

  /**
   * When daemon reports discovered games, auto-create config entries for each
   * game that doesn't already have one, then push config to start watching.
   */
  private async maybeAutoEnableDiscoveredGames(rpc: Message | undefined): Promise<void> {
    if (rpc?.payload?.$case !== "gamesDiscovered") return;
    const { games } = rpc.payload.gamesDiscovered;
    if (games.length === 0) return;

    try {
      const sourceUuid = await this.ctx.storage.get<string>(SOURCE_UUID_KEY);
      if (!sourceUuid) return;

      const validGames = games.filter(
        (game): game is typeof game & { gameId: string; path: string } =>
          Boolean(game.gameId && game.path),
      );
      if (validGames.length === 0) return;

      const gameIds = validGames.map((game) => game.gameId);
      const placeholders = gameIds.map(() => "?").join(", ");
      const existingRows = await this.env.DB.prepare(
        `SELECT game_id FROM source_configs WHERE source_uuid = ? AND game_id IN (${placeholders})`,
      )
        .bind(sourceUuid, ...gameIds)
        .all<{ game_id: string }>();

      const existingIds = new Set(existingRows.results.map((row) => row.game_id));
      const newGames = validGames.filter((game) => !existingIds.has(game.gameId));

      // Backfill file_patterns and exclude_dirs on existing rows that still have
      // the default '[]'. This handles upgrades where the plugin gained these
      // fields after the user already had the game configured. One UPDATE per
      // game covers both columns.
      const backfillGames = validGames.filter(
        (game) =>
          existingIds.has(game.gameId) &&
          (game.filePatterns.length > 0 || game.excludeDirs.length > 0),
      );

      if (newGames.length === 0 && backfillGames.length === 0) return;

      const statements = [
        ...newGames.map((game) =>
          this.env.DB.prepare(
            `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions, file_patterns, exclude_dirs)
             VALUES (?, ?, ?, 1, ?, ?, ?)`,
          ).bind(
            sourceUuid,
            game.gameId,
            game.path,
            JSON.stringify(game.fileExtensions),
            JSON.stringify(game.filePatterns),
            JSON.stringify(game.excludeDirs),
          ),
        ),
        ...backfillGames.map((game) =>
          this.env.DB.prepare(
            `UPDATE source_configs
             SET file_patterns = CASE WHEN file_patterns = '[]' THEN ? ELSE file_patterns END,
                 exclude_dirs = CASE WHEN exclude_dirs = '[]' THEN ? ELSE exclude_dirs END
             WHERE source_uuid = ? AND game_id = ?
               AND (file_patterns = '[]' OR exclude_dirs = '[]')`,
          ).bind(
            JSON.stringify(game.filePatterns),
            JSON.stringify(game.excludeDirs),
            sourceUuid,
            game.gameId,
          ),
        ),
      ];

      await this.env.DB.batch(statements);

      await this.pushConfigToSource(sourceUuid);
    } catch (error) {
      this.debugLog.push("error", "discovered games auto-enable failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("maybeAutoEnableDiscoveredGames", error);
    }
  }

  private async pushConfigToSource(sourceId: string): Promise<void> {
    const rows = await this.env.DB.prepare(
      `SELECT game_id, save_path, enabled, file_extensions, file_patterns, exclude_dirs, exclude_saves
       FROM source_configs
       WHERE source_uuid = ?`,
    )
      .bind(sourceId)
      .all<{
        game_id: string;
        save_path: string;
        enabled: number;
        file_extensions: string;
        file_patterns: string;
        exclude_dirs: string;
        exclude_saves: string;
      }>();

    const games: Record<
      string,
      {
        savePath: string;
        enabled: boolean;
        fileExtensions: string[];
        filePatterns: string[];
        excludeDirs: string[];
        excludeSaves: string[];
      }
    > = {};
    const disabledGameIds = new Set<string>();
    for (const row of rows.results) {
      games[row.game_id] = {
        savePath: row.save_path,
        enabled: row.enabled === 1,
        fileExtensions: JSON.parse(row.file_extensions) as string[],
        filePatterns: JSON.parse(row.file_patterns || "[]") as string[],
        excludeDirs: JSON.parse(row.exclude_dirs || "[]") as string[],
        excludeSaves: JSON.parse(row.exclude_saves || "[]") as string[],
      };
      if (row.enabled === 0) {
        disabledGameIds.add(row.game_id);
      }
    }

    // Send config to all connected daemon sockets. SourceHub is keyed by
    // source_uuid, so all daemon connections belong to this source.
    const msg = Message.encode({
      payload: { $case: "configUpdate", configUpdate: { games } },
    }).finish();
    for (const daemonWs of this.ctx.getWebSockets("daemon")) {
      daemonWs.send(msg);
    }

    await this.removeStaleStateEntries(disabledGameIds, games);
  }

  /**
   * Remove disabled games and excluded saves from in-memory SourceState
   * so the browser never sees them. Called after pushing config to daemons.
   */
  private async removeStaleStateEntries(
    disabledGameIds: Set<string>,
    games: Record<string, { excludeSaves: string[] }>,
  ): Promise<void> {
    const excludedSavesByGame = new Map<string, Set<string>>();
    for (const [gameId, cfg] of Object.entries(games)) {
      if (cfg.excludeSaves.length > 0) {
        excludedSavesByGame.set(gameId, new Set(cfg.excludeSaves.map((s) => s.toLowerCase())));
      }
    }

    if (disabledGameIds.size === 0 && excludedSavesByGame.size === 0) return;

    const state = await this.loadState();
    const changed = this.filterStateEntries(state, disabledGameIds, excludedSavesByGame);
    if (changed) {
      await this.saveState(state);
      await this.forwardStateToUserHub();
    }
  }

  /** Mutates state in place, returns true if anything was removed. */
  private filterStateEntries(
    state: SourceState,
    disabledGameIds: Set<string>,
    excludedSavesByGame: Map<string, Set<string>>,
  ): boolean {
    let changed = false;
    for (const source of state.sources) {
      const beforeGames = source.games.length;
      source.games = source.games.filter((g) => !disabledGameIds.has(g.gameId));
      if (source.games.length < beforeGames) changed = true;

      for (const game of source.games) {
        const excluded = excludedSavesByGame.get(game.gameId);
        if (!excluded) continue;
        const beforeSaves = game.saves.length;
        game.saves = game.saves.filter(
          (s) => !excluded.has((s.identity?.name ?? "").toLowerCase()),
        );
        if (game.saves.length < beforeSaves) changed = true;
      }
    }
    return changed;
  }

  /**
   * Re-add a restored save to in-memory SourceState so it appears in the UI
   * immediately, without waiting for the daemon to re-push the file.
   */
  private async handleRestoreSaveState(request: Request): Promise<Response> {
    const { sourceId, gameId, saveUuid, saveName, summary } = await request.json<{
      sourceId: string;
      gameId: string;
      saveUuid: string;
      saveName: string;
      summary: string;
    }>();

    const state = await this.loadState();
    const source = state.sources.find((s) => s.sourceId === sourceId);
    if (!source) return Response.json({ ok: true });

    let game = source.games.find((g) => g.gameId === gameId);
    if (!game) {
      game = {
        gameId,
        gameName: gameId,
        status: 0,
        saves: [],
        lastActivity: new Date(),
        path: "",
        error: "",
      };
      source.games.push(game);
    }
    if (!game.saves.some((s) => s.saveUuid === saveUuid)) {
      game.saves.push({
        saveUuid,
        identity: { name: saveName, extra: undefined },
        summary,
        lastUpdated: new Date(),
      });
      await this.saveState(state);
      await this.forwardStateToUserHub();
    }

    return Response.json({ ok: true });
  }

  /**
   * Sends a SourceUpdateAvailable message to connected daemons, triggering
   * an immediate self-update. Called via the admin API.
   */
  private handlePushUpdate(request: Request): Promise<Response> {
    return request
      .json<{
        version: string;
        url: string;
        signatureUrl: string;
        sha256: string;
      }>()
      .then((body) => {
        const msg = Message.encode({
          payload: {
            $case: "sourceUpdateAvailable",
            sourceUpdateAvailable: {
              version: body.version,
              url: body.url,
              signatureUrl: body.signatureUrl,
              sha256: body.sha256,
            },
          },
        }).finish();
        const daemons = this.ctx.getWebSockets("daemon");
        for (const ws of daemons) {
          ws.send(msg);
        }
        this.debugLog.push("info", "pushed SourceUpdateAvailable", {
          version: body.version,
          daemonCount: daemons.length,
        });
        return Response.json({ ok: true, daemonCount: daemons.length });
      });
  }

  /**
   * Called when a source is permanently deleted by the user.
   * Closes all daemon WebSocket connections and wipes all DO storage.
   */
  private async handleCleanup(): Promise<Response> {
    this.debugLog.push("info", "cleanup started");
    // Close all daemon WebSocket connections
    for (const daemonWs of this.ctx.getWebSockets("daemon")) {
      try {
        daemonWs.close(1000, "source removed");
      } catch {
        // WebSocket may already be closed
      }
    }

    // Delete all alarm
    await this.ctx.storage.deleteAlarm();

    // Wipe all storage
    await this.ctx.storage.deleteAll();

    return Response.json({ ok: true });
  }

  private async handleRescan(request: Request): Promise<Response> {
    const caps = await this.getSourceMeta();
    if (!caps.canRescan) {
      return Response.json({ sent: false, reason: "rescan_not_supported" });
    }
    const body = await request.json<{ gameId: string }>();
    const daemonSockets = this.ctx.getWebSockets("daemon");
    if (daemonSockets.length === 0) {
      return Response.json({ sent: false, daemon_online: false });
    }
    const msg = Message.encode({
      payload: { $case: "rescanGame", rescanGame: { gameId: body.gameId } },
    }).finish();
    for (const ws of daemonSockets) {
      ws.send(msg);
    }
    return Response.json({ sent: true, daemon_count: daemonSockets.length });
  }

  private handleStatus(): Response {
    const hasDaemon = this.ctx.getWebSockets("daemon").length > 0;
    return Response.json({ daemon_online: hasDaemon });
  }

  /**
   * Called by the worker to set adapter game status (WATCHING or ERROR).
   * Applies a setGameStatus mutation, ensures adapter source meta is set,
   * and forwards the updated state to UserHub for UI broadcast.
   */
  private async handleSetGameStatus(request: Request): Promise<Response> {
    const body = await request.json<{
      gameId?: string;
      gameName?: string;
      status?: string;
      error?: string;
    }>();

    if (!body.gameId || !body.gameName || !body.status) {
      return Response.json(
        { error: "Missing required fields: gameId, gameName, status" },
        { status: 400 },
      );
    }

    const statusMap: Record<string, GameStatusEnum> = {
      watching: GameStatusEnum.GAME_STATUS_ENUM_WATCHING,
      error: GameStatusEnum.GAME_STATUS_ENUM_ERROR,
    };
    const gameStatus = statusMap[body.status];
    if (gameStatus === undefined) {
      return Response.json(
        { error: "Invalid status: must be 'watching' or 'error'" },
        { status: 400 },
      );
    }

    // Ensure adapter source meta is set
    const sourceUuid = await this.ctx.storage.get<string>(SOURCE_UUID_KEY);
    if (sourceUuid) {
      const existingMeta = await this.ctx.storage.get<SourceMeta>(META_KEY);
      if (existingMeta?.sourceKind !== "adapter") {
        await this.ctx.storage.put(META_KEY, {
          sourceKind: "adapter",
          hostname: "",
          platform: "",
          os: "",
          arch: "",
          device: "",
          canRescan: false,
          canReceiveConfig: false,
          cachedAt: Date.now(),
        });
      }
    }

    const state = await this.loadState();
    const mutation: StateMutation = {
      kind: "setGameStatus",
      sourceId: sourceUuid ?? crypto.randomUUID(),
      gameId: body.gameId,
      gameName: body.gameName,
      status: gameStatus,
      error: body.error ?? "",
    };
    applyMutation(state, mutation);
    await this.saveState(state);
    await this.forwardStateToUserHub();

    // Set alarm to trigger forwardStateToUserHub on next tick. For adapter
    // sources the alarm handler returns early (no stale-eviction), so this
    // alarm fires once and is not rescheduled.
    const interval = this.env.ALARM_INTERVAL_MS ?? 30_000;
    await this.ctx.storage.setAlarm(Date.now() + interval);

    return Response.json({ ok: true });
  }

  /**
   * Called by the worker when a source is linked to a user mid-session.
   * Stores the new user_uuid, forwards state to UserHub, and notifies
   * the connected daemon via SourceLinked proto message.
   */
  private async handleSetUser(request: Request): Promise<Response> {
    const body = await request.json<{ userUuid: string }>();
    await this.ctx.storage.put(USER_UUID_KEY, body.userUuid);
    await this.forwardStateToUserHub();

    // Push SourceLinked notification to all connected daemon WebSockets
    const linkedMsg = Message.encode({
      payload: {
        $case: "sourceLinked",
        sourceLinked: { userUuid: body.userUuid },
      },
    }).finish();
    for (const daemonWs of this.ctx.getWebSockets("daemon")) {
      daemonWs.send(linkedMsg);
    }
    this.debugLog.push("info", "pushed SourceLinked to daemon", {
      userUuid: body.userUuid,
    });

    return Response.json({ ok: true });
  }

  // ── Source management (daemon-initiated over WS) ──────────────────

  /**
   * After SourceOnline, tell the daemon whether it's linked or not.
   * If linked: push SourceLinked so daemon knows to proceed normally.
   * If not linked: re-send the existing link code if still valid, or generate a fresh one.
   */
  private async notifyLinkState(ws: WebSocket, sourceId: string | undefined): Promise<void> {
    try {
      const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);
      if (userUuid) {
        const msg = Message.encode({
          payload: { $case: "sourceLinked", sourceLinked: { userUuid } },
        }).finish();
        ws.send(msg);
        this.debugLog.push("info", "notified daemon: already linked", { userUuid });
      } else {
        // Check if we already have a valid link code (e.g. from registration).
        // Only generate a fresh one if none exists or the existing one expired.
        const sourceUuid = sourceId ?? (await this.ctx.storage.get<string>(SOURCE_UUID_KEY));
        if (!sourceUuid) return;

        const existing = await this.env.DB.prepare(
          "SELECT link_code, link_code_expires_at FROM sources WHERE source_uuid = ?",
        )
          .bind(sourceUuid)
          .first<{ link_code: string | null; link_code_expires_at: string | null }>();

        if (existing?.link_code && existing.link_code_expires_at) {
          const expiresAt = new Date(existing.link_code_expires_at);
          if (expiresAt.getTime() > Date.now()) {
            // Existing code is still valid — re-send it without overwriting.
            const resultMsg = Message.encode({
              payload: {
                $case: "refreshLinkCodeResult",
                refreshLinkCodeResult: { linkCode: existing.link_code, expiresAt },
              },
            }).finish();
            ws.send(resultMsg);
            this.debugLog.push("info", "re-sent existing link code", { sourceUuid });
            return;
          }
        }

        // No valid code exists — generate a fresh one.
        await this.handleRefreshLinkCode(ws, sourceId);
      }
    } catch (error) {
      this.debugLog.push("error", "notifyLinkState failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Daemon requests a fresh link code. */
  private async handleRefreshLinkCode(ws: WebSocket, sourceId: string | undefined): Promise<void> {
    try {
      const sourceUuid = sourceId ?? (await this.ctx.storage.get<string>(SOURCE_UUID_KEY));
      if (!sourceUuid) return;

      const linkCode = generateSixDigitCode();
      const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);

      await this.env.DB.prepare(
        "UPDATE sources SET link_code = ?, link_code_expires_at = ? WHERE source_uuid = ?",
      )
        .bind(linkCode, expiresAt.toISOString(), sourceUuid)
        .run();

      const resultMsg = Message.encode({
        payload: {
          $case: "refreshLinkCodeResult",
          refreshLinkCodeResult: { linkCode, expiresAt },
        },
      }).finish();
      ws.send(resultMsg);

      this.debugLog.push("info", "refreshed link code", { sourceUuid });
    } catch (error) {
      this.debugLog.push("error", "refreshLinkCode failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("handleRefreshLinkCode", error);
    }
  }

  /** Daemon requests to unlink from its current user. */
  private async handleUnlinkSource(ws: WebSocket, sourceId: string | undefined): Promise<void> {
    try {
      const sourceUuid = sourceId ?? (await this.ctx.storage.get<string>(SOURCE_UUID_KEY));
      if (!sourceUuid) {
        this.debugLog.push("warn", "unlinkSource: no sourceUuid available");
        return;
      }

      // Read current userUuid before clearing, so we can notify UserHub
      const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);

      const linkCode = generateSixDigitCode();
      const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);

      // Clear user association in D1, generate new link code
      await this.env.DB.prepare(
        "UPDATE sources SET user_uuid = NULL, user_email = NULL, user_display_name = NULL, link_code = ?, link_code_expires_at = ? WHERE source_uuid = ?",
      )
        .bind(linkCode, expiresAt.toISOString(), sourceUuid)
        .run();

      // Clear user in DO storage
      await this.ctx.storage.delete(USER_UUID_KEY);

      // Notify UserHub to drop this source's state
      if (userUuid) {
        try {
          const userHubId = this.env.USER_HUB.idFromName(userUuid);
          await this.env.USER_HUB.get(userHubId).fetch(
            new Request("https://do/remove-source", {
              method: "POST",
              headers: { "X-User-UUID": userUuid },
              body: JSON.stringify({ sourceUuid }),
            }),
          );
        } catch {
          this.debugLog.push("warn", "failed to notify UserHub on unlink");
        }
      }

      // Send new link code back to daemon
      const resultMsg = Message.encode({
        payload: {
          $case: "refreshLinkCodeResult",
          refreshLinkCodeResult: { linkCode, expiresAt },
        },
      }).finish();
      ws.send(resultMsg);

      this.debugLog.push("info", "source unlinked", { sourceUuid });
    } catch (error) {
      this.debugLog.push("error", "unlinkSource failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("handleUnlinkSource", error);
    }
  }

  /** Daemon requests permanent deletion (uninstall flow). */
  private async handleDeregisterSource(
    _ws: WebSocket,
    sourceId: string | undefined,
  ): Promise<void> {
    try {
      const sourceUuid = sourceId ?? (await this.ctx.storage.get<string>(SOURCE_UUID_KEY));
      if (!sourceUuid) {
        this.debugLog.push("warn", "deregisterSource: no sourceUuid available");
        return;
      }

      const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);

      // D1 cleanup — delete source records
      await this.env.DB.batch([
        this.env.DB.prepare("DELETE FROM source_events WHERE source_uuid = ?").bind(sourceUuid),
        this.env.DB.prepare("DELETE FROM source_configs WHERE source_uuid = ?").bind(sourceUuid),
        this.env.DB.prepare("DELETE FROM sources WHERE source_uuid = ?").bind(sourceUuid),
      ]);

      // Notify UserHub to drop this source's state
      if (userUuid) {
        try {
          const userHubId = this.env.USER_HUB.idFromName(userUuid);
          await this.env.USER_HUB.get(userHubId).fetch(
            new Request("https://do/remove-source", {
              method: "POST",
              headers: { "X-User-UUID": userUuid },
              body: JSON.stringify({ sourceUuid }),
            }),
          );
        } catch {
          this.debugLog.push("warn", "failed to notify UserHub on deregister");
        }
      }

      this.debugLog.push("info", "source deregistered", { sourceUuid });

      // Close all daemon WebSocket connections and wipe DO storage
      for (const daemonWs of this.ctx.getWebSockets("daemon")) {
        try {
          daemonWs.close(1000, "source removed");
        } catch {
          // WebSocket may already be closed
        }
      }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
    } catch (error) {
      this.debugLog.push("error", "deregisterSource failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("handleDeregisterSource", error);
    }
  }

  // ── UserHub forwarding ────────────────────────────────────────────

  private async forwardEventToUserHub(
    eventBytes: Uint8Array,
    sourceId: string | undefined,
  ): Promise<void> {
    const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);
    if (!userUuid) return;
    try {
      const id = this.env.USER_HUB.idFromName(userUuid);
      const stub = this.env.USER_HUB.get(id);
      const headers: Record<string, string> = { "X-User-UUID": userUuid };
      if (sourceId) {
        headers["X-Source-ID"] = sourceId;
      }
      const resp = await stub.fetch(
        new Request("https://do/forward-event", {
          method: "POST",
          headers,
          body: eventBytes,
        }),
      );
      await resp.text();
    } catch (error) {
      this.debugLog.push("error", "forward event to UserHub failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("forwardEventToUserHub", error);
    }
  }

  private async forwardStateToUserHub(): Promise<void> {
    const userUuid = await this.ctx.storage.get<string>(USER_UUID_KEY);
    if (!userUuid) return;
    const sourceUuid = await this.ctx.storage.get<string>(SOURCE_UUID_KEY);
    if (!sourceUuid) return;
    try {
      const state = await this.loadState();
      // Decorate SourceInfo with D1 metadata (source_kind, hostname, capabilities)
      // before serializing — these are static per-source and not part of event state.
      const meta = await this.getSourceMeta();
      for (const source of state.sources) {
        source.sourceKind = meta.sourceKind;
        source.hostname = meta.hostname;
        source.platform = meta.platform;
        source.os = meta.os;
        source.arch = meta.arch;
        source.device = meta.device;
        source.canRescan = meta.canRescan;
        source.canReceiveConfig = meta.canReceiveConfig;

        // Resolve display names for games from plugin manifests
        await Promise.all(
          source.games
            .filter((game) => !game.gameName)
            .map(async (game) => {
              game.gameName = await resolveGameName(this.env.PLUGINS, game.gameId);
            }),
        );

        // Enrich adapter sources with saves from D1
        if (meta.sourceKind === "adapter") {
          await Promise.all(
            source.games.map(async (game) => {
              const rows = await this.env.DB.prepare(
                `SELECT uuid, save_name, summary, last_updated
                 FROM saves WHERE last_source_uuid = ? AND game_id = ? AND removed_at IS NULL
                 ORDER BY last_updated DESC LIMIT 500`,
              )
                .bind(sourceUuid, game.gameId)
                .all<{
                  uuid: string;
                  save_name: string;
                  summary: string;
                  last_updated: string | null;
                }>();
              game.saves = rows.results.map((row) => ({
                saveUuid: row.uuid,
                identity: { name: row.save_name, extra: undefined },
                summary: row.summary,
                lastUpdated: row.last_updated ? new Date(row.last_updated) : undefined,
              }));
            }),
          );
        }
      }

      // Encode SourceState as binary proto Message for UserHub
      const stateBytes = Message.encode({
        payload: { $case: "sourceState", sourceState: state },
      }).finish();

      const id = this.env.USER_HUB.idFromName(userUuid);
      const stub = this.env.USER_HUB.get(id);
      const resp = await stub.fetch(
        new Request("https://do/update-state", {
          method: "POST",
          headers: {
            "X-User-UUID": userUuid,
            "X-Source-UUID": sourceUuid,
          },
          body: stateBytes,
        }),
      );
      await resp.text();
    } catch (error) {
      this.debugLog.push("error", "forward state to UserHub failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.persistErrorEvent("forwardStateToUserHub", error);
    }
  }

  /** Internal pipeline events that are too noisy for the activity feed / D1. */
  private static readonly SKIP_PERSIST = new Set([
    "scanStarted",
    "scanCompleted",
    "parseStarted",
    "pushStarted",
    "pushSave", // Raw save data — pushCompleted is synthesized and persisted instead
  ]);

  /**
   * Best-effort persistence of internal error events to D1.
   * Used by catch blocks to make errors visible for post-mortem debugging.
   * Has its own try/catch — never throws, never breaks the caller.
   */
  private async persistErrorEvent(context: string, error: unknown): Promise<void> {
    try {
      const sourceUuid = await this.ctx.storage.get<string>(SOURCE_UUID_KEY);
      if (!sourceUuid) return;
      const errorData = JSON.stringify({
        internalError: {
          context,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      await this.env.DB.prepare(
        "INSERT INTO source_events (source_uuid, event_type, event_data) VALUES (?, ?, ?)",
      )
        .bind(sourceUuid, "internalError", errorData)
        .run();
    } catch {
      // Best-effort — if D1 is down, the ring buffer has it
    }
  }

  private async persistEvent(
    sourceId: string | undefined,
    rpc: Message | undefined,
    eventJson: string | undefined,
  ): Promise<void> {
    if (!rpc?.payload || !eventJson) return;
    try {
      const eventType = rpc.payload.$case;
      if (SourceHub.SKIP_PERSIST.has(eventType)) return;
      if (!sourceId) return;

      await this.env.DB.prepare(
        `INSERT INTO source_events (source_uuid, event_type, event_data)
         VALUES (?, ?, ?)`,
      )
        .bind(sourceId, eventType, eventJson)
        .run();

      // Prune old events probabilistically (~1 in 10) to avoid
      // running a DELETE subquery on every single insert.
      // eslint-disable-next-line sonarjs/pseudo-random -- used for jitter, not security
      if (Math.random() < 0.1) {
        await this.env.DB.prepare(
          `DELETE FROM source_events
           WHERE source_uuid = ? AND id NOT IN (
             SELECT id FROM source_events
             WHERE source_uuid = ?
             ORDER BY created_at DESC LIMIT 100
           )`,
        )
          .bind(sourceId, sourceId)
          .run();
      }
    } catch (error) {
      this.debugLog.push("error", "event persistence failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Intentionally not calling persistErrorEvent here to avoid infinite
      // recursion — persistEvent IS the D1 write path, so retrying would loop.
    }
  }
}

// --- Gzip helpers ---

/** Check for gzip magic header (0x1f 0x8b). */
function isGzipped(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

/** Max decompressed size (10MB) — defense-in-depth against decompression bombs. */
const MAX_DECOMPRESSED_BYTES = 10 * 1024 * 1024;

/** Decompress gzipped data using the Web Streams DecompressionStream API. */
async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  await writer.write(data);
  await writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalLength += value.length;
    if (totalLength > MAX_DECOMPRESSED_BYTES) {
      throw new Error("decompressed payload exceeds size limit");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
