export type DeviceStatus = "online" | "error" | "offline";

export type GameStatus = "watching" | "error" | "detected" | "not_found";

export interface SaveSummary {
  saveUuid: string;
  saveName: string;
  summary: string;
  lastUpdated: string;
}

export interface DeviceGame {
  gameId: string;
  name: string;
  status: GameStatus;
  statusLine: string;
  saves: SaveSummary[];
}

export interface Device {
  id: string;
  name: string;
  status: DeviceStatus;
  version: string | null;
  lastSeen: string;
  games: DeviceGame[];
}
