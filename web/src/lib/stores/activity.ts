import type { ActivityEventType } from "$lib/types/activity";
import type { WireMessage, WireMessageType } from "$lib/types/wire";
import { getMessageType } from "$lib/types/wire";
import { writable, type Readable } from "svelte/store";

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
  daemonOnline: "daemon_online",
  daemonOffline: "daemon_offline",
  scanStarted: "scan_started",
  scanCompleted: "scan_completed",
  gameDetected: "game_detected",
  gameNotFound: "game_not_found",
  watching: "watching",
  parseStarted: "parse_started",
  pluginStatus: "plugin_status",
  parseCompleted: "parse_completed",
  parseFailed: "parse_failed",
  pushStarted: "push_started",
  pushCompleted: "push_completed",
  pushFailed: "push_failed",
  pluginUpdated: "plugin_updated",
  gamesDiscovered: "games_discovered",
};

function formatBytes(bytes: number | string | undefined): string {
  if (bytes === undefined) return "";
  const n = typeof bytes === "string" ? Number.parseInt(bytes, 10) : bytes;
  if (Number.isNaN(n)) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "now";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildEvent(type: WireMessageType, msg: WireMessage): ActivityEventData | null {
  const activityType = TYPE_MAP[type];
  if (!activityType) return null;

  let message = "";
  let detail: string | undefined;

  switch (type) {
    case "daemonOnline": {
      const d = msg.daemonOnline!;
      message = `${d.deviceId ?? "Device"} connected`;
      detail = d.version ?? undefined;
      break;
    }
    case "daemonOffline": {
      const d = msg.daemonOffline!;
      message = `${d.deviceId ?? "Device"} disconnected`;
      break;
    }
    case "scanStarted": {
      const s = msg.scanStarted!;
      message = `Scanning ${s.gameId ?? "game"}`;
      detail = s.path ?? undefined;
      break;
    }
    case "scanCompleted": {
      const s = msg.scanCompleted!;
      message = `Scan complete: ${s.gameId ?? "game"}`;
      detail = s.filesFound !== undefined ? `${s.filesFound} files` : undefined;
      break;
    }
    case "gameDetected": {
      const g = msg.gameDetected!;
      message = `Found ${g.gameId ?? "game"}`;
      detail = g.saveCount !== undefined ? `${g.saveCount} save files` : undefined;
      break;
    }
    case "gameNotFound": {
      const g = msg.gameNotFound!;
      message = `${g.gameId ?? "Game"} not found`;
      break;
    }
    case "watching": {
      const w = msg.watching!;
      message = `Watching ${w.gameId ?? "game"} saves`;
      detail = w.path ?? undefined;
      break;
    }
    case "parseStarted": {
      const p = msg.parseStarted!;
      message = `Parsing ${p.fileName ?? "file"}`;
      detail = p.gameId ?? undefined;
      break;
    }
    case "pluginStatus": {
      const p = msg.pluginStatus!;
      message = p.message ?? "Plugin status";
      detail = p.fileName ?? undefined;
      break;
    }
    case "parseCompleted": {
      const p = msg.parseCompleted!;
      message = p.summary ?? `Parsed ${p.fileName ?? "file"}`;
      detail =
        [
          p.sectionsCount !== undefined ? `${p.sectionsCount} sections` : null,
          p.sizeBytes ? formatBytes(p.sizeBytes) : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined;
      break;
    }
    case "parseFailed": {
      const p = msg.parseFailed!;
      message = `${p.fileName ?? "File"} — ${p.message ?? "parse error"}`;
      break;
    }
    case "pushStarted": {
      const p = msg.pushStarted!;
      message = `Uploading ${p.summary ?? "save"}`;
      detail = p.sizeBytes ? formatBytes(p.sizeBytes) : undefined;
      break;
    }
    case "pushCompleted": {
      const p = msg.pushCompleted!;
      message = p.summary ?? "Upload complete";
      detail =
        [
          p.snapshotSizeBytes ? formatBytes(p.snapshotSizeBytes) : null,
          p.durationMs !== undefined ? `${p.durationMs}ms` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined;
      break;
    }
    case "pushFailed": {
      const p = msg.pushFailed!;
      message = p.message ?? "Upload failed";
      detail = p.willRetry ? "will retry" : undefined;
      break;
    }
    case "pluginUpdated": {
      const p = msg.pluginUpdated!;
      message = `${p.gameId ?? "Plugin"} updated`;
      detail = p.version ? `v${p.version}` : undefined;
      break;
    }
    case "gamesDiscovered": {
      const g = msg.gamesDiscovered!;
      const count = g.games?.length ?? 0;
      message = `Discovered ${count} game${count !== 1 ? "s" : ""}`;
      break;
    }
    default:
      return null;
  }

  return {
    id: crypto.randomUUID(),
    type: activityType,
    message,
    detail,
    time: relativeTime(msg._ts),
  };
}

export function dispatchToActivity(msg: WireMessage): void {
  const type = getMessageType(msg);
  if (!type) return;

  // deviceState is a snapshot, not an activity event
  if (type === "deviceState") return;

  const event = buildEvent(type, msg);
  if (!event) return;

  update((events) => [event, ...events].slice(0, MAX_EVENTS));
}

export function resetActivity(): void {
  set([]);
}
