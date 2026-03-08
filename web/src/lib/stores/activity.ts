import type { Message } from "$lib/proto/savecraft/v1/protocol";
import type { ActivityEventType } from "$lib/types/activity";
import { type Readable, get, writable } from "svelte/store";

import { gameDisplayName } from "./plugins";
import { sources as sourcesStore } from "./sources";

export interface ActivityEventData {
  id: string;
  type: ActivityEventType;
  message: string;
  detail?: string;
  time: string;
}

const MAX_EVENTS = 100;

const { subscribe, update, set } = writable<ActivityEventData[]>([]);

export const activityEvents: Readable<ActivityEventData[]> = { subscribe };

/** Payload case type extracted from the Message oneof. */
type PayloadCase = NonNullable<NonNullable<Message["payload"]>["$case"]>;

const TYPE_MAP: Partial<Record<PayloadCase, ActivityEventType>> = {
  sourceOnline: "daemon_online",
  sourceOffline: "daemon_offline",
  gameDetected: "game_detected",
  gameNotFound: "game_not_found",
  watching: "watching",
  parseCompleted: "parse_completed",
  parseFailed: "parse_failed",
  pushCompleted: "push_completed",
  pushFailed: "push_failed",
  pluginUpdated: "plugin_updated",
  pluginDownloadFailed: "plugin_download_failed",
  gamesDiscovered: "games_discovered",
};

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${String(bytes)}B`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTime(ts: Date | undefined): string {
  const date = ts ?? new Date();
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// --- Per-type event builders ---

interface EventContent {
  message: string;
  detail?: string;
}

interface EventContext {
  msg: Message;
  sourceId: string;
}

type EventBuilder = (ctx: EventContext) => EventContent | null;

/** Look up the hostname for a source from the store. */
function sourceHostname(sourceId: string): string | undefined {
  return get(sourcesStore).find((s) => s.id === sourceId)?.hostname ?? undefined;
}

function buildSourceOnline({ msg, sourceId }: EventContext): EventContent | null {
  if (msg.payload?.$case !== "sourceOnline") return null;
  const s = msg.payload.sourceOnline;
  const hostname = s.hostname || sourceHostname(sourceId);
  const name = hostname?.toUpperCase() || "Daemon";
  return {
    message: `${name} connected`,
    detail:
      [s.os || null, s.version || null].filter(Boolean).join(" · ") || undefined,
  };
}

function buildSourceOffline({ sourceId }: EventContext): EventContent | null {
  const hostname = sourceHostname(sourceId);
  const name = hostname?.toUpperCase() || "Daemon";
  return {
    message: `${name} disconnected`,
  };
}

function buildGameDetected({ msg }: EventContext): EventContent | null {
  if (msg.payload?.$case !== "gameDetected") return null;
  const g = msg.payload.gameDetected;
  return {
    message: `Found ${gameDisplayName(g.gameId || "game")}`,
    detail: g.saveCount === 0 ? undefined : `${String(g.saveCount)} save files`,
  };
}

function buildGameNotFound({ msg }: EventContext): EventContent | null {
  if (msg.payload?.$case !== "gameNotFound") return null;
  const g = msg.payload.gameNotFound;
  return {
    message: `${gameDisplayName(g.gameId || "Game")} not found`,
  };
}

function buildWatching({ msg }: EventContext): EventContent | null {
  if (msg.payload?.$case !== "watching") return null;
  const w = msg.payload.watching;
  return {
    message: `Watching ${gameDisplayName(w.gameId || "game")} saves`,
    detail: w.path || undefined,
  };
}

function buildParseCompleted({ msg }: EventContext): EventContent | null {
  if (msg.payload?.$case !== "parseCompleted") return null;
  const p = msg.payload.parseCompleted;
  return {
    message: p.summary || `Parsed ${p.fileName || "file"}`,
    detail:
      [
        p.sectionsCount === 0 ? null : `${String(p.sectionsCount)} sections`,
        p.sizeBytes ? formatBytes(p.sizeBytes) : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
  };
}

function buildParseFailed({ msg }: EventContext): EventContent | null {
  if (msg.payload?.$case !== "parseFailed") return null;
  const p = msg.payload.parseFailed;
  return {
    message: `${p.fileName || "File"} — ${p.message || "parse error"}`,
  };
}

function buildPushCompleted({ msg }: EventContext): EventContent | null {
  if (msg.payload?.$case !== "pushCompleted") return null;
  const p = msg.payload.pushCompleted;
  return {
    message: p.summary || "Upload complete",
    detail:
      [
        p.snapshotSizeBytes ? formatBytes(p.snapshotSizeBytes) : null,
        p.durationMs === 0 ? null : `${String(p.durationMs)}ms`,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
  };
}

function buildPushFailed({ msg }: EventContext): EventContent | null {
  if (msg.payload?.$case !== "pushFailed") return null;
  const p = msg.payload.pushFailed;
  return {
    message: p.message || "Upload failed",
    detail: p.willRetry ? "will retry" : undefined,
  };
}

function buildPluginUpdated({ msg }: EventContext): EventContent | null {
  if (msg.payload?.$case !== "pluginUpdated") return null;
  const p = msg.payload.pluginUpdated;
  return {
    message: `${gameDisplayName(p.gameId || "Plugin")} updated`,
    detail: p.version ? `v${p.version}` : undefined,
  };
}

function buildPluginDownloadFailed({ msg }: EventContext): EventContent | null {
  if (msg.payload?.$case !== "pluginDownloadFailed") return null;
  const p = msg.payload.pluginDownloadFailed;
  return {
    message: `${gameDisplayName(p.gameId || "Plugin")} download failed`,
    detail: p.message || undefined,
  };
}

function buildGamesDiscovered({ msg }: EventContext): EventContent | null {
  if (msg.payload?.$case !== "gamesDiscovered") return null;
  const g = msg.payload.gamesDiscovered;
  const count = g.games.length;
  return {
    message: `Discovered ${String(count)} game${count === 1 ? "" : "s"}`,
  };
}

const EVENT_BUILDERS: Partial<Record<PayloadCase, EventBuilder>> = {
  sourceOnline: buildSourceOnline,
  sourceOffline: buildSourceOffline,
  gameDetected: buildGameDetected,
  gameNotFound: buildGameNotFound,
  watching: buildWatching,
  parseCompleted: buildParseCompleted,
  parseFailed: buildParseFailed,
  pushCompleted: buildPushCompleted,
  pushFailed: buildPushFailed,
  pluginUpdated: buildPluginUpdated,
  pluginDownloadFailed: buildPluginDownloadFailed,
  gamesDiscovered: buildGamesDiscovered,
  sourceState: () => null,
  testPathResult: () => null,
};

function buildEvent(
  payloadCase: PayloadCase,
  serverTimestamp: Date | undefined,
  ctx: EventContext,
): ActivityEventData | null {
  const activityType = TYPE_MAP[payloadCase];
  if (!activityType) return null;

  const builder = EVENT_BUILDERS[payloadCase];
  if (!builder) return null;

  const result = builder(ctx);
  if (!result) return null;

  return {
    id: crypto.randomUUID(),
    type: activityType,
    message: result.message,
    detail: result.detail,
    time: formatTime(serverTimestamp),
  };
}

export function dispatchToActivity(
  sourceId: string,
  serverTimestamp: Date | undefined,
  msg: Message | undefined,
): void {
  const payloadCase = msg?.payload?.$case;
  if (!payloadCase) return;

  // sourceState is a snapshot, not an activity event
  if (payloadCase === "sourceState") return;

  const event = buildEvent(payloadCase, serverTimestamp, { msg, sourceId });
  if (!event) return;

  update((events) => [event, ...events].slice(0, MAX_EVENTS));
}

export function resetActivity(): void {
  set([]);
}
