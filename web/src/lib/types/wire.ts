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

// --- Daemon lifecycle ---

export interface WireDaemonOnline {
  deviceId?: string;
  version?: string;
  timestamp?: string;
}

export interface WireDaemonOffline {
  deviceId?: string;
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

export interface WireDeviceInfo {
  deviceId?: string;
  online?: boolean;
  lastSeen?: string;
  games?: WireGameInfo[];
}

export interface WireDeviceState {
  devices?: WireDeviceInfo[];
}

// --- User actions ---

export interface WireTestPathResult {
  gameId?: string;
  path?: string;
  valid?: boolean;
  filesFound?: number;
  fileNames?: string[];
}

// --- Message envelope ---

export interface WireMessage {
  /** Injected by hub on replayed events — D1 created_at timestamp (ISO 8601). */
  _ts?: string;

  daemonOnline?: WireDaemonOnline;
  daemonOffline?: WireDaemonOffline;
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
  deviceState?: WireDeviceState;
  testPathResult?: WireTestPathResult;
}

export type WireMessageType = keyof WireMessage;

const MESSAGE_KEYS: WireMessageType[] = [
  "deviceState",
  "daemonOnline",
  "daemonOffline",
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
  "testPathResult",
];

export function getMessageType(msg: WireMessage): WireMessageType | undefined {
  return MESSAGE_KEYS.find((key) => msg[key] !== undefined);
}
