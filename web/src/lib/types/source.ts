export type SourceStatus = "online" | "error" | "offline";

export type GameStatus = "watching" | "error" | "not_found";

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

export interface SourceGame {
  gameId: string;
  name: string;
  status: GameStatus;
  statusLine: string;
  saves: SaveSummary[];
  path?: string;
  error?: string;
}

export interface SourceCapabilities {
  canRescan: boolean;
  canReceiveConfig: boolean;
}

export interface Source {
  id: string;
  name: string;
  sourceKind: string;
  hostname: string | null;
  status: SourceStatus;
  version: string | null;
  lastSeen: string;
  capabilities: SourceCapabilities;
  games: SourceGame[];
}
