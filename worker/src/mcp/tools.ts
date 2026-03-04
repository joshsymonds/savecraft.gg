/**
 * Pure MCP tool handler functions. Each takes explicit dependencies
 * (D1, R2, user UUID) and returns MCP-compatible tool result objects.
 * Tested independently of the MCP protocol layer.
 */

/** MCP tool result — matches the MCP spec's ToolResult shape. */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

interface SaveRow {
  uuid: string;
  source_uuid: string;
  game_id: string;
  game_name: string;
  save_name: string;
  summary: string;
  last_updated: string;
}

interface GameStateSection {
  description: string;
  data: unknown;
}

interface GameState {
  identity: {
    saveName: string;
    gameId: string;
    extra?: Record<string, unknown>;
  };
  summary: string;
  sections: Record<string, GameStateSection>;
}

/** Maximum bytes for a single section's JSON before we reject it (~20K tokens). */
export const SECTION_SIZE_LIMIT = 80 * 1024;

function textResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function lookupSave(
  db: D1Database,
  userUuid: string,
  saveId: string,
): Promise<SaveRow | null> {
  return db
    .prepare(
      `SELECT s.* FROM saves s
       JOIN sources d ON s.source_uuid = d.source_uuid
       WHERE s.uuid = ? AND d.user_uuid = ?`,
    )
    .bind(saveId, userUuid)
    .first<SaveRow>();
}

async function loadLatestSnapshot(
  snapshots: R2Bucket,
  sourceUuid: string,
  saveId: string,
): Promise<GameState | null> {
  const key = `sources/${sourceUuid}/saves/${saveId}/latest.json`;
  const object = await snapshots.get(key);
  if (!object) return null;
  return object.json<GameState>();
}

async function loadSnapshotAtTimestamp(
  snapshots: R2Bucket,
  sourceUuid: string,
  saveId: string,
  timestamp: string,
): Promise<GameState | null> {
  const key = `sources/${sourceUuid}/saves/${saveId}/snapshots/${timestamp}.json`;
  const object = await snapshots.get(key);
  if (!object) return null;
  return object.json<GameState>();
}

interface NotePreviewRow {
  note_id: string;
  save_id: string;
  title: string;
  preview: string;
}

interface ReferenceModule {
  name: string;
  description: string;
  attribution?: unknown;
  parameters?: Record<string, unknown>;
}

interface ManifestData {
  game_id?: string;
  name?: string;
  reference?: {
    modules?: Record<string, ReferenceModule>;
  };
}

/** Test if a game matches a filter pattern (case-insensitive substring on id or name). */
function matchesGameFilter(gameId: string, gameName: string, filter: string): boolean {
  const lower = filter.toLowerCase();
  return gameId.toLowerCase().includes(lower) || gameName.toLowerCase().includes(lower);
}

interface GameEntry {
  game_id: string;
  game_name: string;
  saves: {
    save_id: string;
    name: string;
    summary: string;
    last_updated: string;
    notes: { note_id: string; title: string }[];
  }[];
  references?: {
    id: string;
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  }[];
}

/** Fetch note previews and group by save_id. */
async function fetchNotesBySave(
  db: D1Database,
  userUuid: string,
): Promise<Map<string, { note_id: string; title: string }[]>> {
  const noteRows = await db
    .prepare(
      "SELECT note_id, save_id, title, SUBSTR(content, 1, 100) as preview FROM notes WHERE user_uuid = ? ORDER BY created_at DESC",
    )
    .bind(userUuid)
    .all<NotePreviewRow>();

  const notesBySave = new Map<string, { note_id: string; title: string }[]>();
  for (const note of noteRows.results) {
    const title = note.title || note.preview || "";
    const list = notesBySave.get(note.save_id) ?? [];
    list.push({ note_id: note.note_id, title });
    notesBySave.set(note.save_id, list);
  }
  return notesBySave;
}

/** Group saves into a game map, applying optional filter. */
function groupSavesByGame(
  saves: SaveRow[],
  notesBySave: Map<string, { note_id: string; title: string }[]>,
  filter?: string,
): Map<string, GameEntry> {
  const gameMap = new Map<string, GameEntry>();
  for (const row of saves) {
    const gameName = row.game_name || row.game_id;
    if (filter && !matchesGameFilter(row.game_id, gameName, filter)) continue;

    let game = gameMap.get(row.game_id);
    if (!game) {
      game = { game_id: row.game_id, game_name: gameName, saves: [] };
      gameMap.set(row.game_id, game);
    }
    game.saves.push({
      save_id: row.uuid,
      name: row.save_name,
      summary: row.summary,
      last_updated: row.last_updated,
      notes: notesBySave.get(row.uuid) ?? [],
    });
  }
  return gameMap;
}

/** Scan R2 manifests and attach reference modules to game entries. */
async function attachReferenceModules(
  plugins: R2Bucket,
  gameMap: Map<string, GameEntry>,
  filter?: string,
): Promise<void> {
  const allObjects: R2Object[] = [];
  let cursor: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- R2 pagination loop
  while (true) {
    const listed = await plugins.list({ prefix: "plugins/", cursor });
    allObjects.push(...listed.objects);
    if (!listed.truncated) break;
    cursor = listed.cursor;
  }

  for (const object of allObjects) {
    if (!object.key.endsWith("/manifest.json")) continue;
    const manifest = await plugins.get(object.key);
    if (!manifest) continue;

    const data = await manifest.json<ManifestData>();
    if (!data.game_id || !data.reference?.modules) continue;

    const manifestGameName = data.name ?? data.game_id;
    if (filter && !matchesGameFilter(data.game_id, manifestGameName, filter)) continue;

    let game = gameMap.get(data.game_id);
    if (!game) {
      game = { game_id: data.game_id, game_name: manifestGameName, saves: [] };
      gameMap.set(data.game_id, game);
    }

    game.references = Object.entries(data.reference.modules).map(([id, entry]) => ({
      id,
      name: entry.name,
      description: entry.description,
      parameters: entry.parameters,
    }));
  }
}

export async function listGames(
  db: D1Database,
  plugins: R2Bucket,
  userUuid: string,
  filter?: string,
): Promise<ToolResult> {
  const saveRows = await db
    .prepare(
      `SELECT s.uuid, s.source_uuid, s.game_id, s.game_name, s.save_name, s.summary, s.last_updated
       FROM saves s
       JOIN sources d ON s.source_uuid = d.source_uuid
       WHERE d.user_uuid = ?
       ORDER BY s.last_updated DESC`,
    )
    .bind(userUuid)
    .all<SaveRow>();

  const notesBySave = await fetchNotesBySave(db, userUuid);
  const gameMap = groupSavesByGame(saveRows.results, notesBySave, filter);
  await attachReferenceModules(plugins, gameMap, filter);

  const games = [...gameMap.values()];
  if (filter && games.length === 0) {
    return errorResult(
      `No games matching "${filter}". Call list_games without a filter to see all available games.`,
    );
  }
  return textResult({ games });
}

const OVERVIEW_SECTION_NAMES = ["character_overview", "player_summary", "overview", "summary"];

export async function getSave(
  db: D1Database,
  snapshots: R2Bucket,
  userUuid: string,
  saveId: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save)
    return errorResult("Save not found. Call list_games to see available saves and their IDs.");

  const state = await loadLatestSnapshot(snapshots, save.source_uuid, saveId);
  if (!state)
    return errorResult(
      "No snapshot data available for this save. The daemon may not have pushed data yet.",
    );

  const sections = Object.entries(state.sections).map(([name, section]) => ({
    name,
    description: section.description,
  }));

  // Find overview section data for quick context
  let overview: unknown = null;
  for (const name of OVERVIEW_SECTION_NAMES) {
    if (state.sections[name]) {
      overview = state.sections[name].data;
      break;
    }
  }
  if (!overview) {
    const firstSection = Object.values(state.sections)[0];
    if (firstSection) {
      overview = firstSection.data;
    }
  }

  // Include note metadata so the AI sees notes without a separate call
  const noteRows = await db
    .prepare(
      "SELECT note_id, title, source, LENGTH(content) as size_bytes FROM notes WHERE save_id = ? AND user_uuid = ? ORDER BY created_at DESC",
    )
    .bind(saveId, userUuid)
    .all<{ note_id: string; title: string; source: string; size_bytes: number }>();

  return textResult({
    save_id: saveId,
    game_id: save.game_id,
    name: save.save_name,
    summary: save.summary,
    overview,
    sections,
    notes: noteRows.results.map((row) => ({
      note_id: row.note_id,
      title: row.title,
      source: row.source,
      size_bytes: row.size_bytes,
    })),
  });
}

function fetchMultipleSections(
  allSections: Record<string, GameStateSection>,
  names: string[],
  saveId: string,
  timestamp?: string,
): ToolResult {
  const result: Record<string, unknown> = {};
  const missing: string[] = [];
  const oversized: string[] = [];
  for (const name of names) {
    const sectionData = allSections[name];
    if (!sectionData) {
      missing.push(name);
      continue;
    }
    const json = JSON.stringify(sectionData.data);
    const byteSize = new TextEncoder().encode(json).length;
    if (byteSize > SECTION_SIZE_LIMIT) {
      oversized.push(`${name} (${String(Math.round(byteSize / 1024))}KB)`);
    } else {
      result[name] = sectionData.data;
    }
  }
  if (missing.length > 0 && Object.keys(result).length === 0 && oversized.length === 0) {
    return errorResult(
      `None of the requested sections were found: ${missing.join(", ")}. Call get_save to see available section names.`,
    );
  }
  const response: Record<string, unknown> = { save_id: saveId, sections: result };
  if (missing.length > 0) response.missing = missing;
  if (oversized.length > 0) response.oversized = oversized;
  if (timestamp) response.timestamp = timestamp;
  return textResult(response);
}

function fetchSingleSection(
  allSections: Record<string, GameStateSection>,
  name: string,
  saveId: string,
  timestamp?: string,
): ToolResult {
  const sectionData = allSections[name];
  if (!sectionData) {
    return errorResult(
      `Section '${name}' not found in this save. Call get_save to see available section names.`,
    );
  }

  const json = JSON.stringify(sectionData.data);
  const byteSize = new TextEncoder().encode(json).length;
  if (byteSize > SECTION_SIZE_LIMIT) {
    const sizeKb = String(Math.round(byteSize / 1024));
    const limitKb = String(SECTION_SIZE_LIMIT / 1024);
    return errorResult(
      `Section '${name}' is too large (${sizeKb}KB, limit is ${limitKb}KB). This section contains too much data for a single response. Try requesting a more specific sub-section from get_save's section listing.`,
    );
  }

  const result: Record<string, unknown> = {
    save_id: saveId,
    section: name,
    data: sectionData.data,
  };
  if (timestamp) result.timestamp = timestamp;
  return textResult(result);
}

export async function getSection(
  db: D1Database,
  snapshots: R2Bucket,
  userUuid: string,
  saveId: string,
  sections: string[],
  timestamp?: string,
): Promise<ToolResult> {
  if (sections.length === 0) {
    return errorResult(
      "Provide at least one section name in the 'sections' array. Call get_save to see available section names.",
    );
  }

  const save = await lookupSave(db, userUuid, saveId);
  if (!save)
    return errorResult("Save not found. Call list_games to see available saves and their IDs.");

  const state = timestamp
    ? await loadSnapshotAtTimestamp(snapshots, save.source_uuid, saveId, timestamp)
    : await loadLatestSnapshot(snapshots, save.source_uuid, saveId);
  if (!state) {
    return errorResult(
      timestamp
        ? `No snapshot found at ${timestamp}. The save may not have been updated at that time.`
        : "No snapshot data available for this save. The daemon may not have pushed data yet.",
    );
  }

  if (sections.length === 1) {
    const sectionName = sections[0] ?? "";
    return fetchSingleSection(state.sections, sectionName, saveId, timestamp);
  }

  return fetchMultipleSections(state.sections, sections, saveId, timestamp);
}

/** Parse a natural language period into milliseconds. Returns null if unrecognized. */
function parsePeriod(period: string): number | null {
  const normalized = period.trim().toLowerCase().replaceAll(/\s+/g, " ");
  const pattern = /^(\d+)\s*(hour|hr|h|day|d|week|wk|w|month|mo|m)s?$/;
  const match = pattern.exec(normalized);
  if (!match) {
    // Named shortcuts
    const shortcuts: Record<string, number> = {
      "last session": 24 * 60 * 60 * 1000,
      today: 24 * 60 * 60 * 1000,
      yesterday: 48 * 60 * 60 * 1000,
      "this week": 7 * 24 * 60 * 60 * 1000,
      "last week": 14 * 24 * 60 * 60 * 1000,
    };
    return shortcuts[normalized] ?? null;
  }

  const amount = Number.parseInt(match[1] ?? "0", 10);
  if (amount <= 0) return null;

  const unit = match[2] ?? "";
  const unitMs: Record<string, number> = {
    hour: 3_600_000,
    hr: 3_600_000,
    h: 3_600_000,
    day: 86_400_000,
    d: 86_400_000,
    week: 604_800_000,
    wk: 604_800_000,
    w: 604_800_000,
    month: 2_592_000_000,
    mo: 2_592_000_000,
    m: 2_592_000_000,
  };

  return amount * (unitMs[unit] ?? 0);
}

/**
 * List available snapshot timestamps for a save in R2, sorted oldest-first.
 * Snapshots live at: sources/{sourceUuid}/saves/{saveId}/snapshots/{timestamp}.json
 */
async function listSnapshotTimestamps(
  snapshots: R2Bucket,
  sourceUuid: string,
  saveId: string,
): Promise<string[]> {
  const prefix = `sources/${sourceUuid}/saves/${saveId}/snapshots/`;
  const allObjects: R2Object[] = [];
  let cursor: string | undefined;

  // Paginate through all R2 results
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- R2 pagination loop
  while (true) {
    const listed = await snapshots.list({ prefix, cursor });
    allObjects.push(...listed.objects);
    if (!listed.truncated) break;
    cursor = listed.cursor;
  }

  return allObjects
    .map((r2Object) => r2Object.key.slice(prefix.length).replaceAll(".json", ""))
    .toSorted((a, b) => a.localeCompare(b));
}

/**
 * Find the snapshot timestamp closest to a target time.
 * Prefers snapshots at or before the target, but if none exist,
 * returns the first snapshot after the target (the oldest available
 * within the period).
 */
function findClosestSnapshot(timestamps: string[], targetIso: string): string | undefined {
  let bestBefore: string | undefined;
  let firstAfter: string | undefined;
  for (const ts of timestamps) {
    if (ts <= targetIso) {
      bestBefore = ts;
    } else if (!firstAfter) {
      firstAfter = ts;
      break;
    }
  }
  return bestBefore ?? firstAfter;
}

/** Format a duration in ms as a human-readable string. */
function formatDuration(ms: number): string {
  if (ms < 86_400_000) return `${String(Math.round(ms / 3_600_000))} hours`;
  if (ms < 604_800_000) return `${String(Math.round(ms / 86_400_000))} days`;
  return `${String(Math.round(ms / 604_800_000))} weeks`;
}

export async function getSectionDiff(
  db: D1Database,
  snapshots: R2Bucket,
  userUuid: string,
  saveId: string,
  section: string,
  period: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save)
    return errorResult("Save not found. Call list_games to see available saves and their IDs.");

  const periodMs = parsePeriod(period);
  if (!periodMs) {
    return errorResult(
      `Unrecognized period: "${period}". Use natural language like "24 hours", "3 days", "1 week", "last session", or "this week".`,
    );
  }

  const timestamps = await listSnapshotTimestamps(snapshots, save.source_uuid, saveId);
  if (timestamps.length < 2) {
    return errorResult(
      "Not enough snapshots to compare. The save needs at least two snapshots for a diff — this happens automatically as the game is played and saves update.",
    );
  }

  const now = new Date();
  const fromTarget = new Date(now.getTime() - periodMs).toISOString();
  const toTimestamp = timestamps.at(-1);
  if (!toTimestamp) {
    return errorResult("Not enough snapshots to compare.");
  }
  const fromTimestamp = findClosestSnapshot(timestamps, fromTarget);

  if (!fromTimestamp || fromTimestamp === toTimestamp) {
    // No snapshot old enough — suggest a shorter range
    const oldestTs = timestamps[0] ?? toTimestamp;
    const availableSpan = now.getTime() - new Date(oldestTs).getTime();
    return errorResult(
      `No snapshot found from ${period} ago. The oldest snapshot is from ${formatDuration(availableSpan)} ago. Try a shorter period like "${formatDuration(availableSpan)}".`,
    );
  }

  const fromState = await loadSnapshotAtTimestamp(
    snapshots,
    save.source_uuid,
    saveId,
    fromTimestamp,
  );
  const toState = await loadSnapshotAtTimestamp(snapshots, save.source_uuid, saveId, toTimestamp);

  if (!fromState || !toState) {
    return errorResult("Failed to load snapshots for comparison.");
  }

  const fromSection = fromState.sections[section];
  if (!fromSection)
    return errorResult(
      `Section '${section}' not found in older snapshot. Call get_save to see available section names.`,
    );

  const toSection = toState.sections[section];
  if (!toSection)
    return errorResult(
      `Section '${section}' not found in newer snapshot. Call get_save to see available section names.`,
    );

  const changes = diffObjects(fromSection.data, toSection.data, "");

  // Check if the diff response is too large
  const changesJson = JSON.stringify(changes);
  const byteSize = new TextEncoder().encode(changesJson).length;
  if (byteSize > SECTION_SIZE_LIMIT) {
    // Suggest a narrower range by halving the period
    const halfPeriod = formatDuration(periodMs / 2);
    return errorResult(
      `The diff for '${section}' over ${period} is too large (${String(Math.round(byteSize / 1024))}KB). Too many changes occurred. Try a shorter period like "${halfPeriod}".`,
    );
  }

  return textResult({
    save_id: saveId,
    section,
    from: fromTimestamp,
    to: toTimestamp,
    period,
    changes,
  });
}

interface DiffChange {
  path: string;
  old: unknown;
  new: unknown;
}

function isComparableObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively diff two objects, producing a flat list of {path, old, new} changes.
 */
function diffObjects(oldObject: unknown, newObject: unknown, prefix: string): DiffChange[] {
  if (oldObject === newObject) return [];

  if (!isComparableObject(oldObject) || !isComparableObject(newObject)) {
    return prefix ? [{ path: prefix, old: oldObject, new: newObject }] : [];
  }

  return diffRecords(oldObject, newObject, prefix);
}

function diffRecords(
  oldRecord: Record<string, unknown>,
  newRecord: Record<string, unknown>,
  prefix: string,
): DiffChange[] {
  const changes: DiffChange[] = [];
  const allKeys = new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]);

  for (const key of allKeys) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    const oldValue = oldRecord[key];
    const newValue = newRecord[key];

    if (isComparableObject(oldValue) && isComparableObject(newValue)) {
      changes.push(...diffObjects(oldValue, newValue, childPath));
    } else if (oldValue !== newValue) {
      changes.push({ path: childPath, old: oldValue, new: newValue });
    }
  }

  return changes;
}

// ── Note tools ───────────────────────────────────────────────

interface NoteRow {
  note_id: string;
  save_id: string;
  user_uuid: string;
  title: string;
  content: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export async function getNote(
  db: D1Database,
  userUuid: string,
  saveId: string,
  noteId: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save)
    return errorResult("Save not found. Call list_games to see available saves and their IDs.");

  const note = await db
    .prepare("SELECT * FROM notes WHERE note_id = ? AND save_id = ? AND user_uuid = ?")
    .bind(noteId, saveId, userUuid)
    .first<NoteRow>();

  if (!note)
    return errorResult(
      "Note not found. Call get_save to see available notes and their IDs for this save.",
    );

  return textResult({
    note_id: note.note_id,
    title: note.title,
    source: note.source,
    content: note.content,
  });
}

export async function createNote(
  db: D1Database,
  userUuid: string,
  saveId: string,
  title: string,
  content: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save)
    return errorResult("Save not found. Call list_games to see available saves and their IDs.");

  // Check 50KB limit
  if (new TextEncoder().encode(content).length > 50 * 1024) {
    return errorResult(
      "Content exceeds the 50KB limit. Try splitting into multiple notes or trimming the content.",
    );
  }

  // Check 10 notes per save limit
  const count = await db
    .prepare("SELECT COUNT(*) as cnt FROM notes WHERE save_id = ? AND user_uuid = ?")
    .bind(saveId, userUuid)
    .first<{ cnt: number }>();

  if (count && count.cnt >= 10) {
    return errorResult(
      "This save already has 10 notes (the maximum). Delete an existing note first using delete_note.",
    );
  }

  const noteId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO notes (note_id, save_id, user_uuid, title, content, source) VALUES (?, ?, ?, ?, ?, 'user')",
    )
    .bind(noteId, saveId, userUuid, title, content)
    .run();

  // Index in FTS5
  await indexNote(db, saveId, save.save_name, noteId, title, content);

  return textResult({ note_id: noteId });
}

export async function updateNote(
  db: D1Database,
  userUuid: string,
  saveId: string,
  noteId: string,
  content?: string,
  title?: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save)
    return errorResult("Save not found. Call list_games to see available saves and their IDs.");

  const existing = await db
    .prepare("SELECT note_id FROM notes WHERE note_id = ? AND save_id = ? AND user_uuid = ?")
    .bind(noteId, saveId, userUuid)
    .first<NoteRow>();

  if (!existing)
    return errorResult(
      "Note not found. Call get_save to see available notes and their IDs for this save.",
    );

  if (content !== undefined && new TextEncoder().encode(content).length > 50 * 1024) {
    return errorResult(
      "Content exceeds the 50KB limit. Try splitting into multiple notes or trimming the content.",
    );
  }

  const updates: string[] = [];
  const values: string[] = [];

  if (title !== undefined) {
    updates.push("title = ?");
    values.push(title);
  }
  if (content !== undefined) {
    updates.push("content = ?");
    values.push(content);
  }

  if (updates.length === 0) {
    return textResult({ note_id: noteId });
  }

  updates.push("updated_at = datetime('now')");

  await db
    .prepare(`UPDATE notes SET ${updates.join(", ")} WHERE note_id = ? AND user_uuid = ?`)
    .bind(...values, noteId, userUuid)
    .run();

  // Re-index in FTS5
  const updated = await db
    .prepare("SELECT title, content FROM notes WHERE note_id = ?")
    .bind(noteId)
    .first<{ title: string; content: string }>();
  if (updated) {
    await indexNote(db, saveId, save.save_name, noteId, updated.title, updated.content);
  }

  return textResult({ note_id: noteId });
}

export async function deleteNote(
  db: D1Database,
  userUuid: string,
  saveId: string,
  noteId: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save)
    return errorResult("Save not found. Call list_games to see available saves and their IDs.");

  const existing = await db
    .prepare("SELECT note_id FROM notes WHERE note_id = ? AND save_id = ? AND user_uuid = ?")
    .bind(noteId, saveId, userUuid)
    .first<NoteRow>();

  if (!existing)
    return errorResult(
      "Note not found. Call get_save to see available notes and their IDs for this save.",
    );

  await db
    .prepare("DELETE FROM notes WHERE note_id = ? AND user_uuid = ?")
    .bind(noteId, userUuid)
    .run();

  // Remove from FTS5 index
  await removeNoteFromIndex(db, noteId);

  return textResult({ deleted: true, note_id: noteId });
}

// ── Refresh ──────────────────────────────────────────────────

export async function refreshSave(
  db: D1Database,
  daemonHub: DurableObjectNamespace,
  userUuid: string,
  saveId: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save)
    return errorResult("Save not found. Call list_games to see available saves and their IDs.");

  const id = daemonHub.idFromName(userUuid);
  const stub = daemonHub.get(id);
  const resp = await stub.fetch(
    new Request("https://do/rescan", {
      method: "POST",
      headers: { "X-User-UUID": userUuid },
      body: JSON.stringify({ gameId: save.game_id }),
    }),
  );

  const result = await resp.json<{ sent: boolean; daemon_online?: boolean }>();

  if (!result.sent) {
    return errorResult(
      "The player's daemon is offline — they need to start the Savecraft desktop app for live save syncing. The last-known data is still available via get_section.",
    );
  }

  return textResult({
    save_id: saveId,
    refreshed: true,
    timestamp: new Date().toISOString(),
  });
}

// ── Search ───────────────────────────────────────────────────

interface SearchRow {
  save_id: string;
  save_name: string;
  type: string;
  ref_id: string;
  ref_title: string;
  content: string;
}

export async function searchSaves(
  db: D1Database,
  userUuid: string,
  query: string,
  saveId?: string,
): Promise<ToolResult> {
  if (!query.trim()) {
    return errorResult(
      "A search query is required. Provide keywords to search across saves and notes.",
    );
  }

  let sql: string;
  const params: string[] = [];

  if (saveId) {
    sql = `SELECT save_id, save_name, type, ref_id, ref_title, snippet(search_index, 5, '**', '**', '...', 32) as snippet
           FROM search_index
           WHERE search_index MATCH ? AND save_id = ?
           ORDER BY rank
           LIMIT 20`;
    params.push(saveId);
  } else {
    sql = `SELECT save_id, save_name, type, ref_id, ref_title, snippet(search_index, 5, '**', '**', '...', 32) as snippet
           FROM search_index
           WHERE search_index MATCH ?
             AND save_id IN (SELECT s.uuid FROM saves s JOIN sources d ON s.source_uuid = d.source_uuid WHERE d.user_uuid = ?)
           ORDER BY rank
           LIMIT 20`;
    params.push(userUuid);
  }

  const rows = await db
    .prepare(sql)
    .bind(query, ...params)
    .all<SearchRow & { snippet: string }>();

  return textResult({
    query,
    results: rows.results.map((row) => ({
      type: row.type,
      save_id: row.save_id,
      save_name: row.save_name,
      ref_id: row.ref_id,
      ref_title: row.ref_title,
      snippet: row.snippet,
    })),
  });
}

// ── Reference Data ───────────────────────────────────────────

export async function queryReference(
  referencePlugins: DispatchNamespace,
  gameId: string,
  module: string,
  query: Record<string, unknown>,
): Promise<ToolResult> {
  let plugin: Fetcher;
  try {
    plugin = referencePlugins.get(`${gameId}-reference`);
  } catch {
    return errorResult(
      `No reference module found for game "${gameId}". Call list_games to see available games and their reference modules.`,
    );
  }

  const queryBody = { ...query, module };
  const queryString = JSON.stringify(queryBody);

  let response: Response;
  try {
    response = await plugin.fetch(
      new Request("https://internal/query", {
        method: "POST",
        body: queryString,
      }),
    );
  } catch {
    return errorResult(
      `Reference module for "${gameId}" is not available. It may not be deployed yet. Call list_games to see available games and their reference modules.`,
    );
  }

  const text = await response.text();

  if (response.status !== 200) {
    // The reference Worker returned an error (exit code != 0)
    try {
      const parsed = JSON.parse(text.trim()) as { type: string; message?: string };
      if (parsed.message) {
        return errorResult(`Reference module error: ${parsed.message}`);
      }
    } catch {
      // Not valid JSON — return raw
    }
    return errorResult(`Reference module returned an error: ${text.trim()}`);
  }

  // Parse the ndjson response — could be multiple lines
  const lines = text
    .trim()
    .split("\n")
    .filter((l: string) => l.length > 0);
  if (lines.length === 1) {
    try {
      const parsed = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
      // If the WASM returned pre-formatted text, pass it through directly
      // instead of JSON.stringify-ing it (which would escape newlines).
      if (parsed.type === "result" && isFormattedResult(parsed.data)) {
        const data = parsed.data as { formatted: string };
        return { content: [{ type: "text" as const, text: data.formatted }] };
      }
      return textResult(parsed);
    } catch {
      return textResult({ raw: lines[0] });
    }
  }

  // Multiple ndjson lines — return as array
  const results = lines.map((line: string) => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      return { raw: line };
    }
  });
  return textResult({ results });
}

function isFormattedResult(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "formatted" in data &&
    typeof (data as { formatted: unknown }).formatted === "string"
  );
}

// ── Setup Help ───────────────────────────────────────────────

interface SourceRow {
  source_uuid: string;
  user_uuid: string | null;
  hostname: string | null;
  os: string | null;
  arch: string | null;
  last_push_at: string | null;
  link_code: string | null;
  link_code_expires_at: string | null;
  can_rescan: number;
  can_receive_config: number;
}

/** Safe subset of source info — never includes token_hash, user PII, etc. */
interface SourceInfo {
  source_uuid: string;
  hostname: string | null;
  os: string | null;
  arch: string | null;
  linked: boolean;
  last_active: string | null;
  activity: "active" | "recently_active" | "inactive" | "never_pushed";
  capabilities: { can_rescan: boolean; can_receive_config: boolean };
}

interface SourceLookupResult {
  found: boolean;
  source_uuid?: string;
  hostname?: string | null;
  os?: string | null;
  arch?: string | null;
  linked?: boolean;
  last_active?: string | null;
  activity?: string;
  link_code_valid?: boolean;
  link_code_expires_at?: string | null;
}

interface PlatformGuide {
  install: string | null;
  details: string;
}

interface SetupGuideResponse {
  sources: SourceInfo[];
  guide: Record<string, PlatformGuide | string>;
  lookup?: SourceLookupResult;
}

const ACTIVE_THRESHOLD_MS = 5 * 60_000; // 5 minutes
const RECENTLY_ACTIVE_THRESHOLD_MS = 60 * 60_000; // 1 hour

function deriveActivity(lastPushAt: string | null): SourceInfo["activity"] {
  if (!lastPushAt) return "never_pushed";
  const age = Date.now() - new Date(lastPushAt).getTime();
  if (age < ACTIVE_THRESHOLD_MS) return "active";
  if (age < RECENTLY_ACTIVE_THRESHOLD_MS) return "recently_active";
  return "inactive";
}

function formatSourceInfo(row: SourceRow): SourceInfo {
  return {
    source_uuid: row.source_uuid,
    hostname: row.hostname,
    os: row.os,
    arch: row.arch,
    linked: row.user_uuid !== null,
    last_active: row.last_push_at,
    activity: deriveActivity(row.last_push_at),
    capabilities: { can_rescan: row.can_rescan === 1, can_receive_config: row.can_receive_config === 1 },
  };
}

function buildLookupResult(row: SourceRow | null, viaCode: boolean): SourceLookupResult {
  if (!row) return { found: false };

  const info = formatSourceInfo(row);
  const result: SourceLookupResult = { found: true, ...info };

  if (viaCode) {
    const expired =
      !row.link_code_expires_at || new Date(row.link_code_expires_at).getTime() < Date.now();
    result.link_code_valid = !expired;
    result.link_code_expires_at = row.link_code_expires_at;
  }

  return result;
}

const PLATFORM_GUIDES: Record<string, PlatformGuide> = {
  linux: {
    install: "curl -fsSL https://install.savecraft.gg | bash",
    details:
      "Downloads signed binaries, verifies Ed25519 signatures, installs to ~/.local/bin/, sets up a systemd user service, and auto-registers the source. The daemon starts immediately and displays a pairing code.",
  },
  windows: {
    install: "Download the installer from https://install.savecraft.gg",
    details: String.raw`Downloads an MSI installer. Installs the daemon and tray app to C:\Program Files\Savecraft\. Both start automatically on login. The tray app displays a pairing code.`,
  },
  macos: {
    install: null,
    details: "macOS support is not yet available. It's on the roadmap.",
  },
};

const PAIRING_GUIDE =
  "After installing, the daemon displays a 6-digit pairing code. Visit https://savecraft.gg/setup and enter the code to link the source to your account. Once paired, your game saves appear automatically. Codes expire after 20 minutes — if yours has expired, the tray app can generate a new one.";

function buildGuide(platform?: string): SetupGuideResponse["guide"] {
  if (platform) {
    const guide = PLATFORM_GUIDES[platform];
    if (guide) {
      return { [platform]: guide, pairing: PAIRING_GUIDE };
    }
  }
  return { ...PLATFORM_GUIDES, pairing: PAIRING_GUIDE };
}

const SOURCE_COLS =
  "source_uuid, user_uuid, hostname, os, arch, last_push_at, link_code, link_code_expires_at, can_rescan, can_receive_config";

export async function getSetupHelp(
  db: D1Database,
  userUuid: string,
  platform?: string,
  linkCode?: string,
  sourceUuid?: string,
): Promise<ToolResult> {
  // 1. User's linked sources
  const sourceRows = await db
    .prepare(`SELECT ${SOURCE_COLS} FROM sources WHERE user_uuid = ? ORDER BY last_push_at DESC NULLS LAST`)
    .bind(userUuid)
    .all<SourceRow>();

  const sources = sourceRows.results.map((row) => formatSourceInfo(row));

  // 2. Optional lookup (source_uuid takes precedence over link_code)
  let lookup: SourceLookupResult | undefined;

  if (sourceUuid) {
    const row = await db
      .prepare(`SELECT ${SOURCE_COLS} FROM sources WHERE source_uuid = ?`)
      .bind(sourceUuid)
      .first<SourceRow>();
    lookup = buildLookupResult(row, false);
  } else if (linkCode) {
    const row = await db
      .prepare(`SELECT ${SOURCE_COLS} FROM sources WHERE link_code = ?`)
      .bind(linkCode)
      .first<SourceRow>();
    lookup = buildLookupResult(row, true);
  }

  // 3. Build response
  const response: SetupGuideResponse = { sources, guide: buildGuide(platform) };
  if (lookup !== undefined) {
    response.lookup = lookup;
  }

  return textResult(response);
}

// ── Search Indexing Helpers ───────────────────────────────────

export async function indexSaveSections(
  db: D1Database,
  saveId: string,
  saveName: string,
  sections: Record<string, { description: string; data: unknown }>,
): Promise<void> {
  // Delete old section index entries for this save
  await db
    .prepare("DELETE FROM search_index WHERE save_id = ? AND type = 'section'")
    .bind(saveId)
    .run();

  // Insert new entries per section
  for (const [name, section] of Object.entries(sections)) {
    await db
      .prepare(
        "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, 'section', ?, ?, ?)",
      )
      .bind(saveId, saveName, name, section.description, JSON.stringify(section.data))
      .run();
  }
}

export async function indexNote(
  db: D1Database,
  saveId: string,
  saveName: string,
  noteId: string,
  title: string,
  content: string,
): Promise<void> {
  // Delete old index entry for this note
  await db
    .prepare("DELETE FROM search_index WHERE ref_id = ? AND type = 'note'")
    .bind(noteId)
    .run();

  await db
    .prepare(
      "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, 'note', ?, ?, ?)",
    )
    .bind(saveId, saveName, noteId, title, content)
    .run();
}

export async function removeNoteFromIndex(db: D1Database, noteId: string): Promise<void> {
  await db
    .prepare("DELETE FROM search_index WHERE ref_id = ? AND type = 'note'")
    .bind(noteId)
    .run();
}
