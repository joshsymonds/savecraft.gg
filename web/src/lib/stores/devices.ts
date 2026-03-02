import { gameDisplayName } from "$lib/stores/plugins";
import type { Device, DeviceGame, DeviceStatus, GameStatus, SaveSummary } from "$lib/types/device";
import type { WireDeviceInfo, WireMessage, WireMessageType } from "$lib/types/wire";
import { getMessageType } from "$lib/types/wire";
import { type Readable, writable } from "svelte/store";

const { subscribe, set, update } = writable<Device[]>([]);

export const devices: Readable<Device[]> = { subscribe };

function resolveDeviceId(msg: WireMessage): string | null {
  return msg._deviceId ?? null;
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "unknown";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

function wireStatusToGameStatus(wireStatus: string | undefined): GameStatus {
  if (wireStatus === "GAME_STATUS_ENUM_WATCHING") return "watching";
  if (wireStatus === "GAME_STATUS_ENUM_ERROR") return "error";
  if (wireStatus === "GAME_STATUS_ENUM_NOT_FOUND") return "not_found";
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
    case "error": {
      return "parse error";
    }
    case "not_found": {
      return "not installed";
    }
  }
}

function deviceDisplayName(deviceId: string): string {
  return deviceId.toUpperCase();
}

function mapDeviceInfo(d: WireDeviceInfo): Device {
  const games: DeviceGame[] = (d.games ?? []).map((g) => {
    const status = wireStatusToGameStatus(g.status);
    const saves: SaveSummary[] = (g.saves ?? []).map((s) => ({
      saveUuid: s.saveUuid ?? "",
      saveName: s.identity?.name ?? "Unknown",
      summary: s.summary ?? "",
      lastUpdated: relativeTime(s.lastUpdated),
    }));
    return {
      gameId: g.gameId ?? "",
      name: g.gameName ?? gameDisplayName(g.gameId ?? ""),
      status,
      statusLine: gameStatusLine(status, saves),
      saves,
    };
  });

  const deviceStatus: DeviceStatus = d.online ? "online" : "offline";

  return {
    id: d.deviceId ?? "",
    name: deviceDisplayName(d.deviceId ?? "UNKNOWN"),
    status: deviceStatus,
    version: null,
    lastSeen: relativeTime(d.lastSeen),
    games,
  };
}

function findOrCreateDevice(devs: Device[], deviceId: string): Device {
  let device = devs.find((d) => d.id === deviceId);
  if (!device) {
    device = {
      id: deviceId,
      name: deviceDisplayName(deviceId),
      status: "online",
      version: null,
      lastSeen: "now",
      games: [],
    };
    devs.push(device);
  }
  return device;
}

function findOrCreateGame(device: Device, gameId: string): DeviceGame {
  let game = device.games.find((g) => g.gameId === gameId);
  if (!game) {
    game = {
      gameId,
      name: gameDisplayName(gameId),
      status: "detected",
      statusLine: "scanning...",
      saves: [],
    };
    device.games.push(game);
  }
  return game;
}

function handleDeviceState(msg: WireMessage): void {
  const ds = msg.deviceState;
  if (!ds?.devices) return;
  set(ds.devices.map((d) => mapDeviceInfo(d)));
}

function handleDaemonOnline(msg: WireMessage): void {
  const data = msg.daemonOnline;
  if (!data?.deviceId) return;
  const { deviceId, version } = data;
  update((devs) => {
    const device = findOrCreateDevice(devs, deviceId);
    device.status = "online";
    device.version = version ?? device.version;
    device.lastSeen = "now";
    return [...devs];
  });
}

function handleDaemonOffline(msg: WireMessage): void {
  const data = msg.daemonOffline;
  if (!data?.deviceId) return;
  const { deviceId } = data;
  update((devs) => {
    const device = devs.find((d) => d.id === deviceId);
    if (!device) return devs;
    device.status = "offline";
    device.lastSeen = "just now";
    return [...devs];
  });
}

function handleGameStatusChange(
  msg: WireMessage,
  type: "watching" | "gameDetected" | "gameNotFound",
): void {
  const deviceId = resolveDeviceId(msg);
  if (!deviceId) return;

  let gameId: string | undefined;
  let status: GameStatus;

  if (type === "watching") {
    gameId = msg.watching?.gameId;
    status = "watching";
  } else if (type === "gameDetected") {
    gameId = msg.gameDetected?.gameId;
    status = "detected";
  } else {
    gameId = msg.gameNotFound?.gameId;
    status = "not_found";
  }

  if (!gameId) return;

  update((devs) => {
    const device = devs.find((d) => d.id === deviceId);
    if (!device) return devs;

    const game = findOrCreateGame(device, gameId);
    game.status = status;
    game.statusLine = gameStatusLine(status, game.saves);
    return [...devs];
  });
}

function handleParseFailed(msg: WireMessage): void {
  const pf = msg.parseFailed;
  if (!pf) return;
  const deviceId = resolveDeviceId(msg);
  const gameId = pf.gameId;
  if (!deviceId || !gameId) return;

  update((devs) => {
    const device = devs.find((d) => d.id === deviceId);
    if (!device) return devs;

    const game = findOrCreateGame(device, gameId);
    game.status = "error";
    game.statusLine = pf.message ?? "parse error";
    return [...devs];
  });
}

function handleParseCompleted(msg: WireMessage): void {
  const pc = msg.parseCompleted;
  if (!pc) return;
  const deviceId = resolveDeviceId(msg);
  const gameId = pc.gameId;
  if (!deviceId || !gameId) return;

  update((devs) => {
    const device = devs.find((d) => d.id === deviceId);
    if (!device) return devs;

    const game = findOrCreateGame(device, gameId);
    if (game.status === "detected" || game.status === "error") {
      game.status = "watching";
      game.statusLine = gameStatusLine("watching", game.saves);
    }
    return [...devs];
  });
}

function handlePushCompleted(msg: WireMessage): void {
  const pc = msg.pushCompleted;
  if (!pc) return;
  const deviceId = resolveDeviceId(msg);
  const gameId = pc.gameId;
  if (!deviceId || !gameId) return;

  update((devs) => {
    const targetDevice = devs.find((d) => d.id === deviceId);
    if (!targetDevice) return devs;

    const game = findOrCreateGame(targetDevice, gameId);

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
        });
      }
      game.statusLine = gameStatusLine(game.status, game.saves);
    }

    return [...devs];
  });
}

type DeviceHandler = (msg: WireMessage) => void;

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
  const deviceId = resolveDeviceId(msg);
  if (!deviceId) return;
  const games = data.games;

  update((devs) => {
    const device = devs.find((d) => d.id === deviceId);
    if (!device) return devs;

    for (const discovered of games) {
      if (!discovered.gameId) continue;
      const existing = device.games.find((g) => g.gameId === discovered.gameId);
      if (existing) {
        // Don't downgrade from watching/error — only upgrade from not_found
        if (existing.status === "not_found") {
          existing.status = "detected";
          existing.statusLine = gameStatusLine("detected", existing.saves);
        }
        if (discovered.name) existing.name = discovered.name;
      } else {
        device.games.push({
          gameId: discovered.gameId,
          name: discovered.name ?? gameDisplayName(discovered.gameId),
          status: "detected",
          statusLine: gameStatusLine("detected", []),
          saves: [],
        });
      }
    }
    return [...devs];
  });
}

const DEVICE_HANDLERS: Partial<Record<WireMessageType, DeviceHandler>> = {
  deviceState: handleDeviceState,
  daemonOnline: handleDaemonOnline,
  daemonOffline: handleDaemonOffline,
  watching: handleWatching,
  gameDetected: handleGameDetected,
  gameNotFound: handleGameNotFound,
  gamesDiscovered: handleGamesDiscovered,
  parseFailed: handleParseFailed,
  parseCompleted: handleParseCompleted,
  pushCompleted: handlePushCompleted,
};

export function dispatchToDevices(msg: WireMessage): void {
  const type = getMessageType(msg);
  if (!type) return;
  const handler = DEVICE_HANDLERS[type];
  if (handler) handler(msg);
}

export function resetDevices(): void {
  set([]);
}
