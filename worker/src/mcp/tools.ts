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
  user_uuid: string;
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
    .prepare("SELECT * FROM saves WHERE uuid = ? AND user_uuid = ?")
    .bind(saveId, userUuid)
    .first<SaveRow>();
}

async function loadLatestSnapshot(
  snapshots: R2Bucket,
  userUuid: string,
  saveId: string,
): Promise<GameState | null> {
  const key = `users/${userUuid}/saves/${saveId}/latest.json`;
  const object = await snapshots.get(key);
  if (!object) return null;
  return object.json<GameState>();
}

async function loadSnapshotAtTimestamp(
  snapshots: R2Bucket,
  userUuid: string,
  saveId: string,
  timestamp: string,
): Promise<GameState | null> {
  const key = `users/${userUuid}/saves/${saveId}/snapshots/${timestamp}.json`;
  const object = await snapshots.get(key);
  if (!object) return null;
  return object.json<GameState>();
}

export async function listSaves(db: D1Database, userUuid: string): Promise<ToolResult> {
  const rows = await db
    .prepare(
      "SELECT uuid, game_id, game_name, save_name, summary, last_updated FROM saves WHERE user_uuid = ? ORDER BY last_updated DESC",
    )
    .bind(userUuid)
    .all<SaveRow>();

  const saves = rows.results.map((row) => ({
    save_id: row.uuid,
    game_id: row.game_id,
    game_name: row.game_name || row.game_id,
    name: row.save_name,
    summary: row.summary,
    last_updated: row.last_updated,
  }));

  return textResult({ saves });
}

const OVERVIEW_SECTION_NAMES = ["character_overview", "player_summary", "overview", "summary"];

export async function getSaveSections(
  db: D1Database,
  snapshots: R2Bucket,
  userUuid: string,
  saveId: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save) return errorResult("Save not found. Call list_saves to see available saves and their IDs.");

  const state = await loadLatestSnapshot(snapshots, userUuid, saveId);
  if (!state) return errorResult("No snapshot data available for this save. The daemon may not have pushed data yet.");

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

  return textResult({
    save_id: saveId,
    game_id: save.game_id,
    name: save.save_name,
    summary: save.summary,
    overview,
    sections,
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
  for (const name of names) {
    const sectionData = allSections[name];
    if (sectionData) {
      result[name] = sectionData.data;
    } else {
      missing.push(name);
    }
  }
  if (missing.length > 0 && Object.keys(result).length === 0) {
    return errorResult(`None of the requested sections were found: ${missing.join(", ")}. Call get_save_sections to see available section names.`);
  }
  const response: Record<string, unknown> = { save_id: saveId, sections: result };
  if (missing.length > 0) response.missing = missing;
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
    return errorResult(`Section '${name}' not found in this save. Call get_save_sections to see available section names.`);
  }
  const result: Record<string, unknown> = { save_id: saveId, section: name, data: sectionData.data };
  if (timestamp) result.timestamp = timestamp;
  return textResult(result);
}

export async function getSection(
  db: D1Database,
  snapshots: R2Bucket,
  userUuid: string,
  saveId: string,
  section?: string,
  sections?: string[],
  timestamp?: string,
): Promise<ToolResult> {
  if (!section && (!sections || sections.length === 0)) {
    return errorResult("Provide either 'section' (single name) or 'sections' (array of names).");
  }

  const save = await lookupSave(db, userUuid, saveId);
  if (!save) return errorResult("Save not found. Call list_saves to see available saves and their IDs.");

  const state = timestamp
    ? await loadSnapshotAtTimestamp(snapshots, userUuid, saveId, timestamp)
    : await loadLatestSnapshot(snapshots, userUuid, saveId);
  if (!state) {
    return errorResult(
      timestamp
        ? `No snapshot found at ${timestamp}. The save may not have been updated at that time.`
        : "No snapshot data available for this save. The daemon may not have pushed data yet.",
    );
  }

  if (sections && sections.length > 0) {
    return fetchMultipleSections(state.sections, sections, saveId, timestamp);
  }

  // Guard at function entry ensures section is defined when sections is not
  return fetchSingleSection(state.sections, section ?? "", saveId, timestamp);
}

export async function getSectionDiff(
  db: D1Database,
  snapshots: R2Bucket,
  userUuid: string,
  saveId: string,
  section: string,
  fromTimestamp: string,
  toTimestamp: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save) return errorResult("Save not found. Call list_saves to see available saves and their IDs.");

  const fromState = await loadSnapshotAtTimestamp(snapshots, userUuid, saveId, fromTimestamp);
  if (!fromState) return errorResult(`No snapshot found at ${fromTimestamp}. The save may not have been updated at that time.`);

  const toState = await loadSnapshotAtTimestamp(snapshots, userUuid, saveId, toTimestamp);
  if (!toState) return errorResult(`No snapshot found at ${toTimestamp}. The save may not have been updated at that time.`);

  const fromSection = fromState.sections[section];
  if (!fromSection)
    return errorResult(`Section '${section}' not found in snapshot ${fromTimestamp}. Call get_save_sections to see available section names.`);

  const toSection = toState.sections[section];
  if (!toSection) return errorResult(`Section '${section}' not found in snapshot ${toTimestamp}. Call get_save_sections to see available section names.`);

  const changes = diffObjects(fromSection.data, toSection.data, "");

  return textResult({
    save_id: saveId,
    section,
    from: fromTimestamp,
    to: toTimestamp,
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

export async function listNotes(
  db: D1Database,
  userUuid: string,
  saveId: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save) return errorResult("Save not found. Call list_saves to see available saves and their IDs.");

  const rows = await db
    .prepare(
      "SELECT note_id, title, source, LENGTH(content) as size_bytes, created_at FROM notes WHERE save_id = ? AND user_uuid = ? ORDER BY created_at DESC",
    )
    .bind(saveId, userUuid)
    .all<{
      note_id: string;
      title: string;
      source: string;
      size_bytes: number;
      created_at: string;
    }>();

  return textResult({
    save_id: saveId,
    notes: rows.results.map((row) => ({
      note_id: row.note_id,
      title: row.title,
      source: row.source,
      size_bytes: row.size_bytes,
    })),
  });
}

export async function getNote(
  db: D1Database,
  userUuid: string,
  saveId: string,
  noteId: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save) return errorResult("Save not found. Call list_saves to see available saves and their IDs.");

  const note = await db
    .prepare("SELECT * FROM notes WHERE note_id = ? AND save_id = ? AND user_uuid = ?")
    .bind(noteId, saveId, userUuid)
    .first<NoteRow>();

  if (!note) return errorResult("Note not found. Call list_notes to see available notes for this save.");

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
  if (!save) return errorResult("Save not found. Call list_saves to see available saves and their IDs.");

  // Check 50KB limit
  if (new TextEncoder().encode(content).length > 50 * 1024) {
    return errorResult("Content exceeds the 50KB limit. Try splitting into multiple notes or trimming the content.");
  }

  // Check 10 notes per save limit
  const count = await db
    .prepare("SELECT COUNT(*) as cnt FROM notes WHERE save_id = ? AND user_uuid = ?")
    .bind(saveId, userUuid)
    .first<{ cnt: number }>();

  if (count && count.cnt >= 10) {
    return errorResult("This save already has 10 notes (the maximum). Delete an existing note first using delete_note.");
  }

  const noteId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO notes (note_id, save_id, user_uuid, title, content, source) VALUES (?, ?, ?, ?, ?, 'user')",
    )
    .bind(noteId, saveId, userUuid, title, content)
    .run();

  // Index in FTS5
  await indexNote(db, userUuid, saveId, save.save_name, noteId, title, content);

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
  if (!save) return errorResult("Save not found. Call list_saves to see available saves and their IDs.");

  const existing = await db
    .prepare("SELECT note_id FROM notes WHERE note_id = ? AND save_id = ? AND user_uuid = ?")
    .bind(noteId, saveId, userUuid)
    .first<NoteRow>();

  if (!existing) return errorResult("Note not found. Call list_notes to see available notes for this save.");

  if (content !== undefined && new TextEncoder().encode(content).length > 50 * 1024) {
    return errorResult("Content exceeds the 50KB limit. Try splitting into multiple notes or trimming the content.");
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
    await indexNote(
      db,
      userUuid,
      saveId,
      save.save_name,
      noteId,
      updated.title,
      updated.content,
    );
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
  if (!save) return errorResult("Save not found. Call list_saves to see available saves and their IDs.");

  const existing = await db
    .prepare("SELECT note_id FROM notes WHERE note_id = ? AND save_id = ? AND user_uuid = ?")
    .bind(noteId, saveId, userUuid)
    .first<NoteRow>();

  if (!existing) return errorResult("Note not found. Call list_notes to see available notes for this save.");

  await db
    .prepare("DELETE FROM notes WHERE note_id = ? AND user_uuid = ?")
    .bind(noteId, userUuid)
    .run();

  // Remove from FTS5 index
  await removeNoteFromIndex(db, userUuid, noteId);

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
  if (!save) return errorResult("Save not found. Call list_saves to see available saves and their IDs.");

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
    return errorResult("A search query is required. Provide keywords to search across saves and notes.");
  }

  let sql: string;
  const params: string[] = [userUuid];

  if (saveId) {
    sql = `SELECT save_id, save_name, type, ref_id, ref_title, snippet(search_index, 6, '**', '**', '...', 32) as snippet
           FROM search_index
           WHERE search_index MATCH ? AND user_uuid = ? AND save_id = ?
           ORDER BY rank
           LIMIT 20`;
    params.push(saveId);
  } else {
    sql = `SELECT save_id, save_name, type, ref_id, ref_title, snippet(search_index, 6, '**', '**', '...', 32) as snippet
           FROM search_index
           WHERE search_index MATCH ? AND user_uuid = ?
           ORDER BY rank
           LIMIT 20`;
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

// ── Search Indexing Helpers ───────────────────────────────────

export async function indexSaveSections(
  db: D1Database,
  userUuid: string,
  saveId: string,
  saveName: string,
  sections: Record<string, { description: string; data: unknown }>,
): Promise<void> {
  // Delete old section index entries for this save
  await db
    .prepare("DELETE FROM search_index WHERE save_id = ? AND user_uuid = ? AND type = 'section'")
    .bind(saveId, userUuid)
    .run();

  // Insert new entries per section
  for (const [name, section] of Object.entries(sections)) {
    await db
      .prepare(
        "INSERT INTO search_index (user_uuid, save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, 'section', ?, ?, ?)",
      )
      .bind(
        userUuid,
        saveId,
        saveName,
        name,
        section.description,
        JSON.stringify(section.data),
      )
      .run();
  }
}

export async function indexNote(
  db: D1Database,
  userUuid: string,
  saveId: string,
  saveName: string,
  noteId: string,
  title: string,
  content: string,
): Promise<void> {
  // Delete old index entry for this note
  await db
    .prepare("DELETE FROM search_index WHERE ref_id = ? AND user_uuid = ? AND type = 'note'")
    .bind(noteId, userUuid)
    .run();

  await db
    .prepare(
      "INSERT INTO search_index (user_uuid, save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, 'note', ?, ?, ?)",
    )
    .bind(userUuid, saveId, saveName, noteId, title, content)
    .run();
}

export async function removeNoteFromIndex(
  db: D1Database,
  userUuid: string,
  noteId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM search_index WHERE ref_id = ? AND user_uuid = ? AND type = 'note'")
    .bind(noteId, userUuid)
    .run();
}
