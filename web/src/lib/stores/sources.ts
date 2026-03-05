import { gameDisplayName } from "$lib/stores/plugins";
import type { GameStatus, SaveSummary, Source, SourceGame, SourceStatus } from "$lib/types/source";
import type { WireMessage, WireMessageType, WireSourceInfo } from "$lib/types/wire";
import { getMessageType } from "$lib/types/wire";
import { relativeTime } from "$lib/utils/time";
import { type Readable, writable } from "svelte/store";

const { subscribe, set, update } = writable<Source[]>([]);

export const sources: Readable<Source[]> = { subscribe };

function resolveSourceId(msg: WireMessage): string | null {
  return msg._sourceId ?? null;
}

function wireStatusToGameStatus(wireStatus: string | undefined): GameStatus {
  if (wireStatus === "GAME_STATUS_ENUM_WATCHING") return "watching";
  if (wireStatus === "GAME_STATUS_ENUM_ERROR") return "error";
  if (wireStatus === "GAME_STATUS_ENUM_NOT_FOUND") return "not_found";
  if (wireStatus === "GAME_STATUS_ENUM_ACTIVATING") return "activating";
  return "detected";
}

function gameStatusLine(status: GameStatus, saves: SaveSummary[]): string {
  switch (status) {
    case "watching": {
      if (saves.length === 0) return "watching";
      const suffix = saves.length === 1 ? "" : "s";
      return `${String(saves.length)} character${suffix}`;
    }
    case "detected": {
      return "scanning...";
    }
    case "activating": {
      return "activating...";
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

function mapSourceInfo(d: WireSourceInfo): Source {
  const games: SourceGame[] = (d.games ?? []).map((g) => {
    const status = wireStatusToGameStatus(g.status);
    const saves: SaveSummary[] = (g.saves ?? []).map((s) => ({
      saveUuid: s.saveUuid ?? "",
      saveName: s.identity?.name ?? "Unknown",
      summary: s.summary ?? "",
      lastUpdated: relativeTime(s.lastUpdated),
      status: "success" as const,
    }));
    return {
      gameId: g.gameId ?? "",
      name: g.gameName ?? gameDisplayName(g.gameId ?? ""),
      status,
      statusLine: gameStatusLine(status, saves),
      saves,
    };
  });

  const sourceStatus: SourceStatus = d.online ? "online" : "offline";

  return {
    id: d.sourceId ?? "",
    name: sourceDisplayName(d.sourceKind, d.hostname),
    sourceKind: d.sourceKind ?? "daemon",
    hostname: d.hostname ?? null,
    status: sourceStatus,
    version: null,
    lastSeen: relativeTime(d.lastSeen),
    capabilities: {
      canRescan: d.canRescan ?? false,
      canReceiveConfig: d.canReceiveConfig ?? false,
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
      status: "detected",
      statusLine: "scanning...",
      saves: [],
    };
    source.games.push(game);
  }
  return game;
}

function handleSourceState(msg: WireMessage): void {
  const ss = msg.sourceState;
  if (!ss?.sources) return;
  set(ss.sources.map((s) => mapSourceInfo(s)));
}

function handleSourceOnline(msg: WireMessage): void {
  const data = msg.sourceOnline;
  if (!data?.sourceId) return;
  const { sourceId, version } = data;
  update((srcs) => {
    const source = findOrCreateSource(srcs, sourceId);
    source.status = "online";
    source.version = version ?? source.version;
    source.lastSeen = "now";
    return [...srcs];
  });
}

function handleSourceOffline(msg: WireMessage): void {
  const data = msg.sourceOffline;
  if (!data?.sourceId) return;
  const { sourceId } = data;
  update((srcs) => {
    const source = srcs.find((s) => s.id === sourceId);
    if (!source) return srcs;
    source.status = "offline";
    source.lastSeen = "just now";
    return [...srcs];
  });
}

function handleGameStatusChange(
  msg: WireMessage,
  type: "watching" | "gameDetected" | "gameNotFound",
): void {
  const sourceId = resolveSourceId(msg);
  if (!sourceId) return;

  let gameId: string | undefined;
  let status: GameStatus;
  let path: string | undefined;

  if (type === "watching") {
    gameId = msg.watching?.gameId;
    path = msg.watching?.path;
    status = "watching";
  } else if (type === "gameDetected") {
    gameId = msg.gameDetected?.gameId;
    path = msg.gameDetected?.path;
    status = "detected";
  } else {
    gameId = msg.gameNotFound?.gameId;
    status = "not_found";
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

function handleParseFailed(msg: WireMessage): void {
  const pf = msg.parseFailed;
  if (!pf) return;
  const sourceId = resolveSourceId(msg);
  const gameId = pf.gameId;
  if (!sourceId || !gameId) return;

  update((srcs) => {
    const source = srcs.find((s) => s.id === sourceId);
    if (!source) return srcs;

    const game = findOrCreateGame(source, gameId);
    game.status = "error";
    game.statusLine = pf.message ?? "parse error";
    game.error = pf.message;
    return [...srcs];
  });
}

function handleParseCompleted(msg: WireMessage): void {
  const pc = msg.parseCompleted;
  if (!pc) return;
  const sourceId = resolveSourceId(msg);
  const gameId = pc.gameId;
  if (!sourceId || !gameId) return;

  update((srcs) => {
    const source = srcs.find((s) => s.id === sourceId);
    if (!source) return srcs;

    const game = findOrCreateGame(source, gameId);
    if (game.status === "detected" || game.status === "activating" || game.status === "error") {
      game.status = "watching";
      game.statusLine = gameStatusLine("watching", game.saves);
      game.error = undefined;
    }
    return [...srcs];
  });
}

function handlePushCompleted(msg: WireMessage): void {
  const pc = msg.pushCompleted;
  if (!pc) return;
  const sourceId = resolveSourceId(msg);
  const gameId = pc.gameId;
  if (!sourceId || !gameId) return;

  update((srcs) => {
    const targetSource = srcs.find((s) => s.id === sourceId);
    if (!targetSource) return srcs;

    const game = findOrCreateGame(targetSource, gameId);

    if (game.status === "activating") {
      game.status = "watching";
    }

    if (pc.saveUuid) {
      const existing = game.saves.find((s) => s.saveUuid === pc.saveUuid);
      if (existing) {
        existing.summary = pc.summary ?? existing.summary;
        if (pc.identity?.name) existing.saveName = pc.identity.name;
        existing.lastUpdated = "just now";
      } else {
        game.saves.push({
          saveUuid: pc.saveUuid,
          saveName: pc.identity?.name ?? "Unknown",
          summary: pc.summary ?? "",
          lastUpdated: "just now",
          status: "success",
        });
      }
      game.statusLine = gameStatusLine(game.status, game.saves);
    }

    return [...srcs];
  });
}

type SourceHandler = (msg: WireMessage) => void;

function handleWatching(msg: WireMessage): void {
  handleGameStatusChange(msg, "watching");
}

function handleGameDetected(msg: WireMessage): void {
  handleGameStatusChange(msg, "gameDetected");
}

function handleGameNotFound(msg: WireMessage): void {
  handleGameStatusChange(msg, "gameNotFound");
}

function handleGamesDiscovered(msg: WireMessage): void {
  const data = msg.gamesDiscovered;
  if (!data?.games) return;
  const sourceId = resolveSourceId(msg);
  if (!sourceId) return;
  const games = data.games;

  update((srcs) => {
    const source = srcs.find((s) => s.id === sourceId);
    if (!source) return srcs;

    for (const discovered of games) {
      if (!discovered.gameId) continue;
      const existing = source.games.find((g) => g.gameId === discovered.gameId);
      if (existing) {
        // Don't downgrade from watching/error — only upgrade from not_found
        if (existing.status === "not_found") {
          existing.status = "detected";
          existing.statusLine = gameStatusLine("detected", existing.saves);
        }
        if (discovered.name) existing.name = discovered.name;
      } else {
        source.games.push({
          gameId: discovered.gameId,
          name: discovered.name ?? gameDisplayName(discovered.gameId),
          status: "detected",
          statusLine: gameStatusLine("detected", []),
          saves: [],
        });
      }
    }
    return [...srcs];
  });
}

const SOURCE_HANDLERS: Partial<Record<WireMessageType, SourceHandler>> = {
  sourceState: handleSourceState,
  sourceOnline: handleSourceOnline,
  sourceOffline: handleSourceOffline,
  watching: handleWatching,
  gameDetected: handleGameDetected,
  gameNotFound: handleGameNotFound,
  gamesDiscovered: handleGamesDiscovered,
  parseFailed: handleParseFailed,
  parseCompleted: handleParseCompleted,
  pushCompleted: handlePushCompleted,
};

export function dispatchToSources(msg: WireMessage): void {
  const type = getMessageType(msg);
  if (!type) return;
  const handler = SOURCE_HANDLERS[type];
  if (handler) handler(msg);
}

export function setGameStatus(sourceId: string, gameId: string, status: GameStatus): void {
  update((srcs) => {
    const source = srcs.find((s) => s.id === sourceId);
    if (!source) return srcs;
    const game = source.games.find((g) => g.gameId === gameId);
    if (!game) return srcs;
    game.status = status;
    game.statusLine = gameStatusLine(status, game.saves);
    return [...srcs];
  });
}

export function resetSources(): void {
  set([]);
}
