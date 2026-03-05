import type { ActivityEventType } from "$lib/types/activity";
import type { WireMessage, WireMessageType } from "$lib/types/wire";
import { getMessageType } from "$lib/types/wire";
import { type Readable, writable } from "svelte/store";

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

const TYPE_MAP: Partial<Record<WireMessageType, ActivityEventType>> = {
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

function formatBytes(bytes: number | string | undefined): string {
  if (bytes === undefined) return "";
  const n = typeof bytes === "string" ? Number.parseInt(bytes, 10) : bytes;
  if (Number.isNaN(n)) return "";
  if (n < 1024) return `${String(n)}B`;
  if (n < 1024 * 1024) return `${String(Math.round(n / 1024))}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTime(iso: string | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// --- Per-type event builders ---

interface EventContent {
  message: string;
  detail?: string;
}

type EventBuilder = (msg: WireMessage) => EventContent | null;

function buildSourceOnline(msg: WireMessage): EventContent | null {
  const d = msg.sourceOnline;
  if (!d) return null;
  return {
    message: `${d.sourceId ?? "Source"} connected`,
    detail: d.version ?? undefined,
  };
}

function buildSourceOffline(msg: WireMessage): EventContent | null {
  const d = msg.sourceOffline;
  if (!d) return null;
  return {
    message: `${d.sourceId ?? "Source"} disconnected`,
  };
}

function buildGameDetected(msg: WireMessage): EventContent | null {
  const g = msg.gameDetected;
  if (!g) return null;
  return {
    message: `Found ${g.gameId ?? "game"}`,
    detail: g.saveCount === undefined ? undefined : `${String(g.saveCount)} save files`,
  };
}

function buildGameNotFound(msg: WireMessage): EventContent | null {
  const g = msg.gameNotFound;
  if (!g) return null;
  return {
    message: `${g.gameId ?? "Game"} not found`,
  };
}

function buildWatching(msg: WireMessage): EventContent | null {
  const w = msg.watching;
  if (!w) return null;
  return {
    message: `Watching ${w.gameId ?? "game"} saves`,
    detail: w.path ?? undefined,
  };
}

function buildParseCompleted(msg: WireMessage): EventContent | null {
  const p = msg.parseCompleted;
  if (!p) return null;
  return {
    message: p.summary ?? `Parsed ${p.fileName ?? "file"}`,
    detail:
      [
        p.sectionsCount === undefined ? null : `${String(p.sectionsCount)} sections`,
        p.sizeBytes ? formatBytes(p.sizeBytes) : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
  };
}

function buildParseFailed(msg: WireMessage): EventContent | null {
  const p = msg.parseFailed;
  if (!p) return null;
  return {
    message: `${p.fileName ?? "File"} — ${p.message ?? "parse error"}`,
  };
}

function buildPushCompleted(msg: WireMessage): EventContent | null {
  const p = msg.pushCompleted;
  if (!p) return null;
  return {
    message: p.summary ?? "Upload complete",
    detail:
      [
        p.snapshotSizeBytes ? formatBytes(p.snapshotSizeBytes) : null,
        p.durationMs === undefined ? null : `${String(p.durationMs)}ms`,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
  };
}

function buildPushFailed(msg: WireMessage): EventContent | null {
  const p = msg.pushFailed;
  if (!p) return null;
  return {
    message: p.message ?? "Upload failed",
    detail: p.willRetry ? "will retry" : undefined,
  };
}

function buildPluginUpdated(msg: WireMessage): EventContent | null {
  const p = msg.pluginUpdated;
  if (!p) return null;
  return {
    message: `${p.gameId ?? "Plugin"} updated`,
    detail: p.version ? `v${p.version}` : undefined,
  };
}

function buildPluginDownloadFailed(msg: WireMessage): EventContent | null {
  const p = msg.pluginDownloadFailed;
  if (!p) return null;
  return {
    message: `${p.gameId ?? "Plugin"} download failed`,
    detail: p.message ?? undefined,
  };
}

function buildGamesDiscovered(msg: WireMessage): EventContent | null {
  const g = msg.gamesDiscovered;
  if (!g) return null;
  const count = g.games?.length ?? 0;
  return {
    message: `Discovered ${String(count)} game${count === 1 ? "" : "s"}`,
  };
}

const EVENT_BUILDERS: Partial<Record<WireMessageType, EventBuilder>> = {
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

function buildEvent(type: WireMessageType, msg: WireMessage): ActivityEventData | null {
  const activityType = TYPE_MAP[type];
  if (!activityType) return null;

  const builder = EVENT_BUILDERS[type];
  if (!builder) return null;

  const result = builder(msg);
  if (!result) return null;

  return {
    id: crypto.randomUUID(),
    type: activityType,
    message: result.message,
    detail: result.detail,
    time: formatTime(msg._ts),
  };
}

export function dispatchToActivity(msg: WireMessage): void {
  const type = getMessageType(msg);
  if (!type) return;

  // sourceState is a snapshot, not an activity event
  if (type === "sourceState") return;

  const event = buildEvent(type, msg);
  if (!event) return;

  update((events) => [event, ...events].slice(0, MAX_EVENTS));
}

export function resetActivity(): void {
  set([]);
}
