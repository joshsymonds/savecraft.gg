export type SourceStatus = "online" | "error" | "offline" | "linked";

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
  platform: string | null;
  device: string | null;
  status: SourceStatus;
  version: string | null;
  lastSeen: string;
  capabilities: SourceCapabilities;
  games: SourceGame[];
}

// -- Per-source game entry for GameDetailModal --

export interface GameSourceEntry {
  sourceId: string;
  sourceName: string;
  hostname: string | null;
  sourceKind: string;
  status: GameStatus;
  path?: string;
  error?: string;
  saveCount: number;
}

// -- Game-centric UI types for the dashboard --

export interface Save extends SaveSummary {
  sourceId: string;
  sourceName: string;
}

export interface Game {
  gameId: string;
  name: string;
  iconUrl?: string;
  statusLine: string;
  saves: Save[];
  sourceCount: number;
  sources: GameSourceEntry[];
  needsConfig: boolean;
}

// -- Removed saves (for restore UI) --

export interface RemovedSave {
  saveUuid: string;
  saveName: string;
  summary: string;
  removedAt: string;
  noteCount: number;
}

// -- Config modal types --

export type ValidationState = "idle" | "checking" | "valid" | "invalid" | "error";

export interface AvailableSource {
  id: string;
  name: string;
  hostname: string | null;
  platform: string | null;
}

export interface TestPathResult {
  valid: boolean;
  filesFound: number;
  fileNames: string[];
}

export interface PickerGame {
  gameId: string;
  name: string;
  iconUrl?: string;
  description: string;
  watched: boolean;
  saveCount: number;
  defaultPaths?: { windows?: string; linux?: string; darwin?: string };
  isApiGame?: boolean;
  adapter?: { authProvider: string; regions: string[] };
}
