import { GameStatusEnum, type Message, type SourceInfo } from "$lib/proto/savecraft/v1/protocol";
import { gameDisplayName } from "$lib/stores/plugins";
import type { GameStatus, SaveSummary, Source, SourceGame, SourceStatus } from "$lib/types/source";
import { relativeTime } from "$lib/utils/time";
import { type Readable, writable } from "svelte/store";

const { subscribe, set, update } = writable<Source[]>([]);

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

function sourceDisplayName(sourceKind?: string, hostname?: string | null): string {
  const kind = (sourceKind ?? "daemon").toUpperCase();
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
    };
  });

  const sourceStatus: SourceStatus = d.online ? "online" : "offline";

  return {
    id: d.sourceId,
    name: sourceDisplayName(d.sourceKind, d.hostname || null),
    sourceKind: d.sourceKind || "daemon",
    hostname: d.hostname || null,
    // Use `os` (runtime.GOOS: "linux", "darwin", "windows") for platform-dependent
    // path defaults, not `platform` which is architecture info.
    platform: d.os || null,
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

function findOrCreateSource(srcs: Source[], sourceId: string): Source {
  let source = srcs.find((s) => s.id === sourceId);
  if (!source) {
    source = {
      id: sourceId,
      name: sourceDisplayName("daemon"),
      sourceKind: "daemon",
      hostname: null,
      platform: null,
      status: "online",
      version: null,
      lastSeen: "now",
      capabilities: { canRescan: true, canReceiveConfig: true },
      games: [],
    };
    srcs.push(source);
  }
  return source;
}

function findOrCreateGame(source: Source, gameId: string): SourceGame {
  let game = source.games.find((g) => g.gameId === gameId);
  if (!game) {
    game = {
      gameId,
      name: gameDisplayName(gameId),
      status: "watching",
      statusLine: "watching",
      saves: [],
    };
    source.games.push(game);
  }
  return game;
}

/** Payload case type extracted from the Message oneof. */
type PayloadCase = NonNullable<NonNullable<Message["payload"]>["$case"]>;

function handleSourceState(msg: Message): void {
  if (msg.payload?.$case !== "sourceState") return;
  const ss = msg.payload.sourceState;
  set(ss.sources.map((s) => mapSourceInfo(s)));
}

function handleSourceOnline(sourceId: string, msg: Message): void {
  if (msg.payload?.$case !== "sourceOnline") return;
  const version = msg.payload.sourceOnline.version;
  const os = msg.payload.sourceOnline.os;
  update((srcs) => {
    const source = findOrCreateSource(srcs, sourceId);
    source.status = "online";
    source.version = version || source.version;
    source.lastSeen = "now";
    if (os) source.platform = os;
    return [...srcs];
  });
}

function handleSourceOffline(sourceId: string): void {
  update((srcs) => {
    const source = srcs.find((s) => s.id === sourceId);
    if (!source) return srcs;
    source.status = "offline";
    source.lastSeen = "just now";
    return [...srcs];
  });
}

function handleGameStatusChange(
  sourceId: string,
  msg: Message,
  type: "watching" | "gameDetected" | "gameNotFound",
): void {
  let gameId: string | undefined;
  let status: GameStatus;
  let path: string | undefined;

  if (type === "watching" && msg.payload?.$case === "watching") {
    gameId = msg.payload.watching.gameId;
    path = msg.payload.watching.path;
    status = "watching";
  } else if (type === "gameDetected" && msg.payload?.$case === "gameDetected") {
    gameId = msg.payload.gameDetected.gameId;
    path = msg.payload.gameDetected.path;
    status = "watching";
  } else if (type === "gameNotFound" && msg.payload?.$case === "gameNotFound") {
    gameId = msg.payload.gameNotFound.gameId;
    status = "not_found";
  } else {
    return;
  }

  if (!gameId) return;

  update((srcs) => {
    const source = srcs.find((s) => s.id === sourceId);
    if (!source) return srcs;

    const game = findOrCreateGame(source, gameId);
    game.status = status;
    game.statusLine = gameStatusLine(status, game.saves);
    if (path) game.path = path;
    if (status === "watching") game.error = undefined;
    return [...srcs];
  });
}

function handleParseFailed(sourceId: string, msg: Message): void {
  if (msg.payload?.$case !== "parseFailed") return;
  const pf = msg.payload.parseFailed;
  const gameId = pf.gameId;
  if (!gameId) return;

  update((srcs) => {
    const source = srcs.find((s) => s.id === sourceId);
    if (!source) return srcs;

    const game = findOrCreateGame(source, gameId);
    game.status = "error";
    game.statusLine = pf.message || "parse error";
    game.error = pf.message;
    return [...srcs];
  });
}

function handleParseCompleted(sourceId: string, msg: Message): void {
  if (msg.payload?.$case !== "parseCompleted") return;
  const pc = msg.payload.parseCompleted;
  const gameId = pc.gameId;
  if (!gameId) return;

  update((srcs) => {
    const source = srcs.find((s) => s.id === sourceId);
    if (!source) return srcs;

    const game = findOrCreateGame(source, gameId);
    if (game.status === "error") {
      game.status = "watching";
      game.statusLine = gameStatusLine("watching", game.saves);
      game.error = undefined;
    }
    return [...srcs];
  });
}

function handlePushCompleted(sourceId: string, msg: Message): void {
  if (msg.payload?.$case !== "pushCompleted") return;
  const pc = msg.payload.pushCompleted;
  const gameId = pc.gameId;
  if (!gameId) return;

  update((srcs) => {
    const targetSource = srcs.find((s) => s.id === sourceId);
    if (!targetSource) return srcs;

    const game = findOrCreateGame(targetSource, gameId);

    if (pc.saveUuid) {
      const existing = game.saves.find((s) => s.saveUuid === pc.saveUuid);
      if (existing) {
        existing.summary = pc.summary || existing.summary;
        if (pc.identity?.name) existing.saveName = pc.identity.name;
        existing.lastUpdated = "just now";
      } else {
        game.saves.push({
          saveUuid: pc.saveUuid,
          saveName: pc.identity?.name ?? "Unknown",
          summary: pc.summary,
          lastUpdated: "just now",
          status: "success",
        });
      }
      game.statusLine = gameStatusLine(game.status, game.saves);
    }

    return [...srcs];
  });
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

type SourceHandler = (sourceId: string, msg: Message) => void;

const SOURCE_HANDLERS: Partial<Record<PayloadCase, SourceHandler>> = {
  sourceState: (_sourceId, msg) => {
    handleSourceState(msg);
  },
  sourceOnline: handleSourceOnline,
  sourceOffline: (sourceId) => {
    handleSourceOffline(sourceId);
  },
  watching: (sourceId, msg) => {
    handleGameStatusChange(sourceId, msg, "watching");
  },
  gameDetected: (sourceId, msg) => {
    handleGameStatusChange(sourceId, msg, "gameDetected");
  },
  gameNotFound: (sourceId, msg) => {
    handleGameStatusChange(sourceId, msg, "gameNotFound");
  },
  parseFailed: handleParseFailed,
  parseCompleted: handleParseCompleted,
  pushCompleted: handlePushCompleted,
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
