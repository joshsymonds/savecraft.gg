/**
 * Hand-typed interfaces for proto JSON wire format.
 * Matches protobuf-es toJSON() output from the server.
 * No @bufbuild/protobuf dependency needed.
 */

// --- Shared ---

export interface WireSaveIdentity {
  name?: string;
  extra?: Record<string, unknown>;
}

// --- Source lifecycle ---

export interface WireSourceOnline {
  sourceId?: string;
  version?: string;
  timestamp?: string;
}

export interface WireSourceOffline {
  sourceId?: string;
  timestamp?: string;
}

// --- Game discovery ---

export interface WireScanStarted {
  gameId?: string;
  path?: string;
}

export interface WireScanCompleted {
  gameId?: string;
  path?: string;
  filesFound?: number;
  fileNames?: string[];
}

export interface WireGameDetected {
  gameId?: string;
  path?: string;
  saveCount?: number;
}

export interface WireGameNotFound {
  gameId?: string;
  pathsChecked?: string[];
}

export interface WireWatching {
  gameId?: string;
  path?: string;
  filesMonitored?: number;
}

// --- Parse lifecycle ---

export interface WireParseStarted {
  gameId?: string;
  fileName?: string;
}

export interface WirePluginStatus {
  gameId?: string;
  fileName?: string;
  message?: string;
}

export interface WireParseCompleted {
  gameId?: string;
  fileName?: string;
  identity?: WireSaveIdentity;
  summary?: string;
  sectionsCount?: number;
  sizeBytes?: number;
}

export interface WireParseFailed {
  gameId?: string;
  fileName?: string;
  errorType?: string;
  message?: string;
}

// --- Push lifecycle ---

export interface WirePushStarted {
  gameId?: string;
  summary?: string;
  sizeBytes?: number;
}

export interface WirePushCompleted {
  gameId?: string;
  saveUuid?: string;
  summary?: string;
  snapshotSizeBytes?: number;
  durationMs?: number;
  identity?: WireSaveIdentity;
}

export interface WirePushFailed {
  gameId?: string;
  message?: string;
  willRetry?: boolean;
}

// --- Plugin management ---

export interface WirePluginUpdated {
  gameId?: string;
  version?: string;
}

export interface WirePluginDownloadFailed {
  gameId?: string;
  message?: string;
}

// --- State: server → UI ---

export interface WireSaveInfo {
  saveUuid?: string;
  identity?: WireSaveIdentity;
  summary?: string;
  lastUpdated?: string;
}

export interface WireGameInfo {
  gameId?: string;
  gameName?: string;
  status?: string; // GAME_STATUS_ENUM_*
  saves?: WireSaveInfo[];
  lastActivity?: string;
}

export interface WireSourceInfo {
  sourceId?: string;
  online?: boolean;
  lastSeen?: string;
  games?: WireGameInfo[];
  sourceKind?: string;
  hostname?: string;
  canRescan?: boolean;
  canReceiveConfig?: boolean;
}

export interface WireSourceState {
  sources?: WireSourceInfo[];
}

// --- User actions ---

export interface WireTestPathResult {
  gameId?: string;
  path?: string;
  valid?: boolean;
  filesFound?: number;
  fileNames?: string[];
}

// --- Auto-discovery ---

export interface WireDiscoveredGame {
  gameId?: string;
  name?: string;
  path?: string;
  fileCount?: number;
}

export interface WireGamesDiscovered {
  games?: WireDiscoveredGame[];
}

// --- Config results ---

export interface WireGameConfigResult {
  success?: boolean;
  error?: string;
  resolvedPath?: string;
}

export interface WireConfigResult {
  results?: Record<string, WireGameConfigResult>;
}

// --- Message envelope ---

/** Hub-injected metadata fields (not part of the proto payload). */
export interface WireMetadata {
  /** Injected by hub on replayed events — D1 created_at timestamp (ISO 8601). */
  _ts?: string;
  /** Injected by hub — source UUID for the connection that sent this event. */
  _sourceId?: string;
}

/** Proto payload fields — one per message type. */
export interface WirePayload {
  sourceOnline?: WireSourceOnline;
  sourceOffline?: WireSourceOffline;
  scanStarted?: WireScanStarted;
  scanCompleted?: WireScanCompleted;
  gameDetected?: WireGameDetected;
  gameNotFound?: WireGameNotFound;
  watching?: WireWatching;
  parseStarted?: WireParseStarted;
  pluginStatus?: WirePluginStatus;
  parseCompleted?: WireParseCompleted;
  parseFailed?: WireParseFailed;
  pushStarted?: WirePushStarted;
  pushCompleted?: WirePushCompleted;
  pushFailed?: WirePushFailed;
  pluginUpdated?: WirePluginUpdated;
  pluginDownloadFailed?: WirePluginDownloadFailed;
  sourceState?: WireSourceState;
  testPathResult?: WireTestPathResult;
  gamesDiscovered?: WireGamesDiscovered;
  configResult?: WireConfigResult;
}

export type WireMessage = WireMetadata & WirePayload;
export type WireMessageType = keyof WirePayload;

const MESSAGE_KEYS = [
  "sourceState",
  "sourceOnline",
  "sourceOffline",
  "scanStarted",
  "scanCompleted",
  "gameDetected",
  "gameNotFound",
  "watching",
  "parseStarted",
  "pluginStatus",
  "parseCompleted",
  "parseFailed",
  "pushStarted",
  "pushCompleted",
  "pushFailed",
  "pluginUpdated",
  "pluginDownloadFailed",
  "testPathResult",
  "gamesDiscovered",
  "configResult",
] as const satisfies readonly WireMessageType[];

export function getMessageType(msg: WireMessage): WireMessageType | undefined {
  return MESSAGE_KEYS.find((key) => msg[key] !== undefined);
}
