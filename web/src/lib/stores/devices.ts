import type { Device, DeviceGame, DeviceStatus, GameStatus, SaveSummary } from "$lib/types/device";
import { gameDisplayName } from "$lib/stores/plugins";
import type { WireDeviceInfo, WireMessage } from "$lib/types/wire";
import { getMessageType } from "$lib/types/wire";
import { writable, type Readable } from "svelte/store";

const { subscribe, set, update } = writable<Device[]>([]);

export const devices: Readable<Device[]> = { subscribe };

/**
 * Fallback device ID — set on daemonOnline and deviceState. Used only when
 * _deviceId metadata is missing (very old replayed events). The hub now
 * injects _deviceId into all relayed and replayed events, so this is
 * rarely needed.
 */
let lastOnlineDeviceId: string | null = null;

function resolveDeviceId(msg: WireMessage): string | null {
  return msg._deviceId ?? lastOnlineDeviceId;
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "unknown";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function wireStatusToGameStatus(wireStatus: string | undefined): GameStatus {
  switch (wireStatus) {
    case "GAME_STATUS_ENUM_WATCHING":
      return "watching";
    case "GAME_STATUS_ENUM_ERROR":
      return "error";
    case "GAME_STATUS_ENUM_NOT_FOUND":
      return "not_found";
    default:
      return "detected";
  }
}

function gameStatusLine(status: GameStatus, saves: SaveSummary[]): string {
  switch (status) {
    case "watching":
      return saves.length > 0
        ? `${saves.length} character${saves.length !== 1 ? "s" : ""}`
        : "watching";
    case "detected":
      return "scanning...";
    case "error":
      return "parse error";
    case "not_found":
      return "not installed";
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
      characterName: s.identity?.name ?? "Unknown",
      summary: s.summary ?? "",
      lastUpdated: relativeTime(s.lastUpdated),
    }));
    return {
      gameId: g.gameId ?? "",
      name: g.gameName || gameDisplayName(g.gameId ?? ""),
      status,
      statusLine: gameStatusLine(status, saves),
      saves,
    };
  });

  const deviceStatus: DeviceStatus = d.online ? "online" : "offline";
  if (d.online && d.deviceId) lastOnlineDeviceId = d.deviceId;

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

export function dispatchToDevices(msg: WireMessage): void {
  const type = getMessageType(msg);
  if (!type) return;

  switch (type) {
    case "deviceState": {
      const ds = msg.deviceState;
      if (!ds?.devices) return;
      set(ds.devices.map(mapDeviceInfo));
      break;
    }

    case "daemonOnline": {
      const { deviceId, version } = msg.daemonOnline!;
      if (!deviceId) return;
      lastOnlineDeviceId = deviceId;
      update((devs) => {
        const device = findOrCreateDevice(devs, deviceId);
        device.status = "online";
        device.version = version ?? device.version;
        device.lastSeen = "now";
        return devs;
      });
      break;
    }

    case "daemonOffline": {
      const { deviceId } = msg.daemonOffline!;
      if (!deviceId) return;
      update((devs) => {
        const device = devs.find((d) => d.id === deviceId);
        if (device) {
          device.status = "offline";
          device.lastSeen = "just now";
        }
        return devs;
      });
      break;
    }

    case "watching":
    case "gameDetected":
    case "gameNotFound": {
      const deviceId = resolveDeviceId(msg);
      if (!deviceId) return;

      let gameId: string | undefined;
      let status: GameStatus;

      if (type === "watching") {
        gameId = msg.watching!.gameId;
        status = "watching";
      } else if (type === "gameDetected") {
        gameId = msg.gameDetected!.gameId;
        status = "detected";
      } else {
        gameId = msg.gameNotFound!.gameId;
        status = "not_found";
      }

      if (!gameId) return;

      update((devs) => {
        const device = devs.find((d) => d.id === deviceId);
        if (!device) return devs;

        const game = findOrCreateGame(device, gameId);
        game.status = status;
        game.statusLine = gameStatusLine(status, game.saves);
        return devs;
      });
      break;
    }

    case "parseFailed": {
      const pf = msg.parseFailed!;
      const deviceId = resolveDeviceId(msg);
      if (!deviceId || !pf.gameId) return;

      update((devs) => {
        const device = devs.find((d) => d.id === deviceId);
        if (!device) return devs;

        const game = findOrCreateGame(device, pf.gameId!);
        game.status = "error";
        game.statusLine = pf.message ?? "parse error";
        return devs;
      });
      break;
    }

    case "parseCompleted": {
      const pc = msg.parseCompleted!;
      const deviceId = resolveDeviceId(msg);
      if (!deviceId || !pc.gameId) return;

      update((devs) => {
        const device = devs.find((d) => d.id === deviceId);
        if (!device) return devs;

        const game = findOrCreateGame(device, pc.gameId!);
        if (game.status === "detected" || game.status === "error") {
          game.status = "watching";
          game.statusLine = gameStatusLine("watching", game.saves);
        }
        return devs;
      });
      break;
    }

    case "pushCompleted": {
      const pc = msg.pushCompleted!;
      if (!pc.gameId) return;

      update((devs) => {
        const targetDeviceId = resolveDeviceId(msg);
        const targetDevice = targetDeviceId
          ? devs.find((d) => d.id === targetDeviceId)
          : devs[0];
        if (!targetDevice) return devs;

        const game = findOrCreateGame(targetDevice, pc.gameId!);

        if (pc.saveUuid) {
          const existing = game.saves.find((s) => s.saveUuid === pc.saveUuid);
          if (existing) {
            existing.summary = pc.summary ?? existing.summary;
            existing.characterName = pc.summary?.split(",")[0] ?? existing.characterName;
            existing.lastUpdated = "just now";
          } else {
            game.saves.push({
              saveUuid: pc.saveUuid,
              characterName: pc.summary?.split(",")[0] ?? "Unknown",
              summary: pc.summary ?? "",
              lastUpdated: "just now",
            });
          }
          game.statusLine = gameStatusLine(game.status, game.saves);
        }

        return devs;
      });
      break;
    }
  }
}

export function resetDevices(): void {
  set([]);
  lastOnlineDeviceId = null;
}
