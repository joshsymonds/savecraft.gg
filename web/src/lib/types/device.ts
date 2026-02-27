export type DeviceStatus = "online" | "error" | "offline";

export type GameStatus = "watching" | "error" | "detected" | "not_found";

export interface DeviceGame {
  gameId: string;
  name: string;
  icon: string;
  status: GameStatus;
  statusLine: string;
}

export interface Device {
  id: string;
  name: string;
  status: DeviceStatus;
  version: string;
  os: string;
  lastSeen: string;
  games: DeviceGame[];
}
