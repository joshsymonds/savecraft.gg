export type DeviceStatus = "online" | "error" | "offline";

export type GameStatus = "watching" | "error" | "detected" | "not_found" | "activating";

export type NoteSource = "user" | "ai" | "import";

export interface NoteSummary {
  id: string;
  title: string;
  content: string;
  source: NoteSource;
  sizeBytes: number;
  updatedAt: string;
}

export interface SaveSummary {
  saveUuid: string;
  saveName: string;
  summary: string;
  lastUpdated: string;
  status: "success" | "error";
}

export interface DeviceGame {
  gameId: string;
  name: string;
  status: GameStatus;
  statusLine: string;
  saves: SaveSummary[];
  path?: string;
  error?: string;
}

export interface Device {
  id: string;
  name: string;
  status: DeviceStatus;
  version: string | null;
  lastSeen: string;
  games: DeviceGame[];
}
