import { GameStatusEnum, type Message, type SourceInfo } from "$lib/proto/savecraft/v1/protocol";
import { gameDisplayName } from "$lib/stores/plugins";
import type { GameStatus, SaveSummary, Source, SourceGame, SourceStatus } from "$lib/types/source";
import { relativeTime } from "$lib/utils/time";
import { type Readable, writable } from "svelte/store";

const { subscribe, set } = writable<Source[]>([]);

export const sources: Readable<Source[]> = { subscribe };

/** Per-game config result from the most recent ConfigResult WebSocket event. */
export interface ConfigResultEntry {
  success: boolean;
  error: string;
  resolvedPath: string;
}

const configResultsStore = writable<Record<string, ConfigResultEntry>>({});
export const configResults: Readable<Record<string, ConfigResultEntry>> = configResultsStore;

function enumStatusToGameStatus(status: GameStatusEnum): GameStatus {
  if (status === GameStatusEnum.GAME_STATUS_ENUM_ERROR) return "error";
  if (status === GameStatusEnum.GAME_STATUS_ENUM_NOT_FOUND) return "not_found";
  return "watching";
}

function gameStatusLine(status: GameStatus, saves: SaveSummary[]): string {
  switch (status) {
    case "watching": {
      if (saves.length === 0) return "watching";
      const suffix = saves.length === 1 ? "" : "s";
      return `${String(saves.length)} character${suffix}`;
    }
    case "error": {
      return "parse error";
    }
    case "not_found": {
      return "not installed";
    }
  }
}

const SOURCE_KIND_LABELS: Record<string, string> = {
  daemon: "DAEMON",
  adapter: "API",
};

function sourceDisplayName(sourceKind?: string, hostname?: string | null): string {
  const kind = SOURCE_KIND_LABELS[sourceKind ?? "daemon"] ?? (sourceKind ?? "daemon").toUpperCase();
  if (hostname) return `${kind} · ${hostname.toUpperCase()}`;
  return kind;
}

function formatTimestamp(ts: Date | undefined): string {
  if (!ts) return "";
  return relativeTime(ts.toISOString());
}

function mapSourceInfo(d: SourceInfo): Source {
  const games: SourceGame[] = d.games.map((g) => {
    const status = enumStatusToGameStatus(g.status);
    const saves: SaveSummary[] = g.saves.map((s) => ({
      saveUuid: s.saveUuid,
      saveName: s.identity?.name ?? "Unknown",
      summary: s.summary,
      lastUpdated: formatTimestamp(s.lastUpdated),
      status: "success" as const,
    }));
    return {
      gameId: g.gameId,
      name: g.gameName || gameDisplayName(g.gameId),
      status,
      statusLine: gameStatusLine(status, saves),
      saves,
      path: g.path || undefined,
      error: g.error || undefined,
    };
  });

  let sourceStatus: SourceStatus = "offline";
  if (d.sourceKind === "adapter") {
    sourceStatus = "linked";
  } else if (d.online) {
    sourceStatus = "online";
  }

  return {
    id: d.sourceId,
    name: sourceDisplayName(d.sourceKind, d.hostname || null),
    sourceKind: d.sourceKind || "daemon",
    hostname: d.hostname || null,
    // Use `os` (runtime.GOOS: "linux", "darwin", "windows") for platform-dependent
    // path defaults, not `platform` which is architecture info.
    platform: d.os || null,
    device: d.device || null,
    status: sourceStatus,
    version: null,
    lastSeen: formatTimestamp(d.lastSeen),
    capabilities: {
      canRescan: d.canRescan,
      canReceiveConfig: d.canReceiveConfig,
    },
    games,
  };
}

/** Replace the entire sources store from an authoritative sourceState snapshot. */
function handleSourceState(msg: Message): void {
  if (msg.payload?.$case !== "sourceState") return;
  const ss = msg.payload.sourceState;
  set(ss.sources.map((s) => mapSourceInfo(s)));
}

function handleConfigResult(msg: Message): void {
  if (msg.payload?.$case !== "configResult") return;
  const cr = msg.payload.configResult;
  const entries: Record<string, ConfigResultEntry> = {};
  for (const [gameId, result] of Object.entries(cr.results)) {
    entries[gameId] = {
      success: result.success,
      error: result.error,
      resolvedPath: result.resolvedPath,
    };
  }
  configResultsStore.set(entries);
}

type PayloadCase = NonNullable<NonNullable<Message["payload"]>["$case"]>;
type SourceHandler = (sourceId: string, msg: Message) => void;

const SOURCE_HANDLERS: Partial<Record<PayloadCase, SourceHandler>> = {
  sourceState: (_sourceId, msg) => {
    handleSourceState(msg);
  },
  configResult: (_sourceId, msg) => {
    handleConfigResult(msg);
  },
};

export function dispatchToSources(sourceId: string, msg: Message | undefined): void {
  if (!msg?.payload?.$case) return;
  const handler = SOURCE_HANDLERS[msg.payload.$case];
  if (handler) handler(sourceId, msg);
}

export function resetConfigResults(): void {
  configResultsStore.set({});
}

export function resetSources(): void {
  set([]);
}
