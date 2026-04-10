/**
 * Pure MCP tool handler functions. Each takes explicit dependencies
 * (D1, user UUID) and returns MCP-compatible tool result objects.
 * Tested independently of the MCP protocol layer.
 */

import { ADAPTER_REFRESH_COOLDOWN_SEC, AdapterError } from "../adapters/adapter";
import { adapters } from "../adapters/registry";
import { resolveCharacterContext } from "../adapters/resolve-character";
import { getNativeGameIds, getNativeModule, getNativeModules } from "../reference/registry";
import type { NativeReferenceModule } from "../reference/types";
import { storePush } from "../store";
import type { Env } from "../types";

import { MANIFEST_LIST, MANIFESTS } from "./manifests.gen.js";
import { VISUAL_MODULES } from "./views.gen.js";

/** MCP tool result — matches the MCP spec's ToolResult shape. */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

/** MCP Apps tool result — includes structuredContent for view rendering. */
export interface ViewToolResult {
  structuredContent: Record<string, unknown>;
  content: { type: "text"; text: string }[];
  _meta?: Record<string, unknown>;
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
  last_source_uuid: string | null;
  refresh_status: string | null;
  refresh_error: string | null;
}

/** Maximum bytes for a single section's JSON before we reject it (~20K tokens). */
export const SECTION_SIZE_LIMIT = 80 * 1024;

interface SectionRow {
  name: string;
  description: string;
  data: string;
}

/** Format an ISO timestamp as a human-readable relative string ("2 hours ago"). */
function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${String(days)}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${String(months)}mo ago`;
  const years = Math.floor(days / 365);
  return `${String(years)}y ago`;
}

export function textResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export function viewResult(
  structuredContent: Record<string, unknown>,
  meta?: Record<string, unknown>,
): ViewToolResult {
  return {
    structuredContent,
    // content carries the SAME data as structuredContent so the model can reason
    // about it. Claude's MCP Apps implementation hides structuredContent from the
    // model when a widget renders — without the data in content, the model is blind.
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    ...(meta ? { _meta: meta } : {}),
  };
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
    .prepare("SELECT * FROM saves WHERE uuid = ? AND user_uuid = ? AND removed_at IS NULL")
    .bind(saveId, userUuid)
    .first<SaveRow>();
}

interface NotePreviewRow {
  note_id: string;
  save_id: string;
  title: string;
  preview: string;
}

/** Test if a game matches a filter pattern (case-insensitive substring on id or name). */
function matchesGameFilter(gameId: string, gameName: string, filter: string): boolean {
  const lower = filter.toLowerCase();
  return gameId.toLowerCase().includes(lower) || gameName.toLowerCase().includes(lower);
}

interface GameEntry {
  game_id: string;
  game_name: string;
  game_description?: string;
  icon_url?: string;
  saves: {
    save_id: string;
    name: string;
    summary: string;
    last_updated: string;
    notes: { note_id: string; title: string }[];
  }[];
  removed_saves?: string[];
  references?: {
    id: string;
    name: string;
    description: string;
    visual?: boolean;
  }[];
  /** Hint for AI models: full parameter schemas are in get_save/show_save. */
  reference_schemas?: string;
}

/** Fetch note previews and group by save_id. */
async function fetchNotesBySave(
  db: D1Database,
  userUuid: string,
): Promise<Map<string, { note_id: string; title: string }[]>> {
  const noteRows = await db
    .prepare(
      "SELECT note_id, save_id, title, SUBSTR(content, 1, 100) as preview FROM notes WHERE user_uuid = ? ORDER BY created_at DESC LIMIT 500",
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
      last_updated: relativeTime(row.last_updated),
      notes: notesBySave.get(row.uuid) ?? [],
    });
  }
  return gameMap;
}

/** Resolve a game's icon URL from its embedded manifest. */
export function resolveIconUrl(serverUrl: string, gameId: string): string | undefined {
  const manifest = MANIFESTS.get(gameId);
  if (manifest && (manifest.icon === "icon.png" || manifest.icon === "icon.svg")) {
    return `${serverUrl}/plugins/${gameId}/${manifest.icon}`;
  }
  return undefined;
}

/** Look up WASM section_mappings for a specific module from its embedded manifest. */
export function getWasmSectionMappings(
  gameId: string,
  moduleId: string,
): Record<string, string> | undefined {
  return MANIFESTS.get(gameId)?.reference?.modules?.[moduleId]?.section_mappings;
}

/** Hint text for AI models: directs them from list_games to get_save for full schemas. */
const REFERENCE_SCHEMAS_HINT =
  "Use get_save on any character to see full parameter schemas for these modules.";

/**
 * Build full reference module metadata (with parameter schemas) for a game.
 * Used by get_save/show_save for progressive schema discovery.
 */
interface FullReference {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  visual?: boolean;
}

export function getFullReferences(gameId: string): FullReference[] {
  const references: FullReference[] = [];

  // Start with WASM manifest modules
  const manifest = MANIFESTS.get(gameId);
  if (manifest?.reference?.modules) {
    for (const [id, entry] of Object.entries(manifest.reference.modules)) {
      references.push({
        id,
        name: entry.name,
        description: entry.description,
        parameters: entry.parameters,
        visual: VISUAL_MODULES.has(id),
      });
    }
  }

  // Overlay/append native modules (same id replaces, new ids append)
  const nativeModules = getNativeModules(gameId);
  const indexById = new Map(references.map((r, index) => [r.id, index]));
  for (const native of nativeModules) {
    const existing = indexById.get(native.id);
    if (existing === undefined) {
      references.push(native);
    } else {
      references[existing] = native;
    }
  }

  return references;
}

/** Strip parameters from a ReferenceModuleMetadata for lightweight list_games output. */
function toListReference(source: {
  id: string;
  name: string;
  description: string;
  visual?: boolean;
}): { id: string; name: string; description: string; visual?: boolean } {
  return {
    id: source.id,
    name: source.name,
    description: source.description,
    visual: source.visual,
  };
}

function mergeNativeModules(gameMap: Map<string, GameEntry>, filter?: string): void {
  for (const gameId of getNativeGameIds()) {
    let game = gameMap.get(gameId);
    if (!game) {
      // Native-only game (no WASM manifest) — only add if no filter or filter matches.
      if (filter && !matchesGameFilter(gameId, gameId, filter)) continue;
      game = { game_id: gameId, game_name: gameId, saves: [] };
      gameMap.set(gameId, game);
    }
    const nativeModules = getNativeModules(gameId);
    const existing = game.references ?? [];
    const existingIds = new Set(existing.map((r) => r.id));
    // Replace existing entries with native versions (stripping parameters), append new ones.
    const merged = existing.map((reference) => {
      const native = nativeModules.find((n) => n.id === reference.id);
      return native ? toListReference(native) : reference;
    });
    for (const native of nativeModules) {
      if (!existingIds.has(native.id)) {
        merged.push(toListReference(native));
      }
    }
    game.references = merged;
    if (merged.length > 0) {
      game.reference_schemas = REFERENCE_SCHEMAS_HINT;
    }
  }
}

/** Enrich a single game entry from its manifest data. */
function enrichFromManifest(
  db: D1Database,
  game: GameEntry,
  data: (typeof MANIFEST_LIST)[number],
  userUuid: string,
  serverUrl?: string,
): void {
  const manifestGameName = data.name ?? data.game_id;

  // Update stale game names from manifest (fire-and-forget D1 update)
  if (data.name && game.game_name !== manifestGameName) {
    game.game_name = manifestGameName;
    void db
      .prepare(
        "UPDATE saves SET game_name = ? WHERE game_id = ? AND game_name != ? AND user_uuid = ?",
      )
      .bind(manifestGameName, data.game_id, manifestGameName, userUuid)
      .run();
  }

  if (serverUrl && data.icon && (data.icon === "icon.png" || data.icon === "icon.svg")) {
    game.icon_url = `${serverUrl}/plugins/${data.game_id}/${data.icon}`;
  }

  if (data.description) {
    game.game_description = data.description;
  }

  if (data.reference?.modules) {
    game.references = Object.entries(data.reference.modules).map(([id, entry]) => ({
      id,
      name: entry.name,
      description: entry.description,
      visual: VISUAL_MODULES.has(id),
    }));
    game.reference_schemas = REFERENCE_SCHEMAS_HINT;
  }
}

/** Attach reference modules from embedded manifests to game entries the user owns. */
function attachReferenceModules(
  db: D1Database,
  gameMap: Map<string, GameEntry>,
  userUuid: string,
  filter?: string,
  serverUrl?: string,
): void {
  for (const data of MANIFEST_LIST) {
    const manifestGameName = data.name ?? data.game_id;
    if (filter && !matchesGameFilter(data.game_id, manifestGameName, filter)) continue;

    // Only enrich games the user already has saves for — don't create phantom entries.
    const game = gameMap.get(data.game_id);
    if (!game) continue;

    enrichFromManifest(db, game, data, userUuid, serverUrl);
  }

  mergeNativeModules(gameMap, filter);
}

export async function listGames(
  db: D1Database,
  userUuid: string,
  filter?: string,
  serverUrl?: string,
): Promise<ToolResult> {
  const [saveRows, notesBySave, removedRows] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM saves WHERE user_uuid = ? AND removed_at IS NULL ORDER BY last_updated DESC LIMIT 500`,
      )
      .bind(userUuid)
      .all<SaveRow>(),
    fetchNotesBySave(db, userUuid),
    db
      .prepare(
        `SELECT game_id, save_name FROM saves WHERE user_uuid = ? AND removed_at IS NOT NULL LIMIT 500`,
      )
      .bind(userUuid)
      .all<{ game_id: string; save_name: string }>(),
  ]);

  const gameMap = groupSavesByGame(saveRows.results, notesBySave, filter);

  // Attach removed save names per game
  for (const row of removedRows.results) {
    const game = gameMap.get(row.game_id);
    if (game) {
      game.removed_saves ??= [];
      game.removed_saves.push(row.save_name);
    }
  }

  attachReferenceModules(db, gameMap, userUuid, filter, serverUrl);

  const games = [...gameMap.values()];
  if (filter && games.length === 0) {
    return errorResult(
      `No games matching "${filter}". Try without a filter to see all available games.`,
    );
  }
  return textResult({ games });
}

const OVERVIEW_SECTION_NAMES = ["character_overview", "player_summary", "overview", "summary"];

async function checkRemovedSave(
  db: D1Database,
  userUuid: string,
  saveId: string,
): Promise<string | null> {
  const removed = await db
    .prepare(
      "SELECT save_name FROM saves WHERE uuid = ? AND user_uuid = ? AND removed_at IS NOT NULL",
    )
    .bind(saveId, userUuid)
    .first<{ save_name: string }>();
  return removed?.save_name ?? null;
}

export async function getSave(
  db: D1Database,
  userUuid: string,
  saveId: string,
  serverUrl?: string,
): Promise<ToolResult> {
  const save = await lookupSave(db, userUuid, saveId);
  if (!save) {
    const removedName = await checkRemovedSave(db, userUuid, saveId);
    if (removedName) {
      return errorResult(
        `"${removedName}" has been removed by the player. They can restore it from the game detail screen on savecraft.gg. Once restored, the daemon will re-parse the save file and data will repopulate automatically.`,
      );
    }
    return errorResult("Save not found. Check the game listing for available saves and their IDs.");
  }

  const sectionRows = await db
    .prepare("SELECT name, description, data FROM sections WHERE save_uuid = ? ORDER BY name")
    .bind(saveId)
    .all<SectionRow>();

  if (sectionRows.results.length === 0) {
    return errorResult(
      "No section data available for this save. The daemon may not have pushed data yet.",
    );
  }

  const sections = sectionRows.results.map((row) => ({
    name: row.name,
    description: row.description,
  }));

  // Find overview section data for quick context
  let overview: Record<string, unknown> | null = null;
  for (const name of OVERVIEW_SECTION_NAMES) {
    const row = sectionRows.results.find((r) => r.name === name);
    if (row) {
      overview = JSON.parse(row.data) as Record<string, unknown>;
      break;
    }
  }
  if (!overview && sectionRows.results[0]) {
    overview = JSON.parse(sectionRows.results[0].data) as Record<string, unknown>;
  }

  // Fetch notes + icon URL in parallel (manifest uses per-isolate cache, typically warm from listGames)
  const [noteRows, iconUrl] = await Promise.all([
    db
      .prepare(
        "SELECT note_id, title, source, LENGTH(content) as size_bytes FROM notes WHERE save_id = ? AND user_uuid = ? ORDER BY created_at DESC",
      )
      .bind(saveId, userUuid)
      .all<{ note_id: string; title: string; source: string; size_bytes: number }>(),
    Promise.resolve(serverUrl ? resolveIconUrl(serverUrl, save.game_id) : undefined),
  ]);

  const result: Record<string, unknown> = {
    save_id: saveId,
    game_id: save.game_id,
    game_name: save.game_name,
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
  };

  if (iconUrl) result.icon_url = iconUrl;

  // Attach full reference module schemas (with parameters) for this game.
  // This is the progressive discovery point: list_games shows summaries,
  // get_save provides the full parameter schemas needed to call query_reference.
  const references = getFullReferences(save.game_id);
  if (references.length > 0) {
    result.references = references;
  }

  // Include refresh status for adapter saves (null for daemon saves)
  if (save.refresh_status) {
    result.refresh_status = save.refresh_status;
    if (save.refresh_error) {
      result.refresh_error = save.refresh_error;
    }
  }

  return textResult(result);
}

export async function getSection(
  db: D1Database,
  userUuid: string,
  saveId: string,
  sections: string[],
): Promise<ToolResult> {
  if (sections.length === 0) {
    return errorResult(
      "Provide at least one section name in the 'sections' array. Call get_save to see available section names.",
    );
  }

  const save = await lookupSave(db, userUuid, saveId);
  if (!save)
    return errorResult("Save not found. Check the game listing for available saves and their IDs.");

  // Query requested sections from D1
  const placeholders = sections.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT name, data FROM sections WHERE save_uuid = ? AND name IN (${placeholders})`)
    .bind(saveId, ...sections)
    .all<{ name: string; data: string }>();

  if (rows.results.length === 0) {
    const deckSuggestion = await deckMissError(db, saveId, sections);
    if (deckSuggestion) return deckSuggestion;
    return errorResult(
      `None of the requested sections were found: ${sections.join(", ")}. Call get_save to see available section names.`,
    );
  }

  // Single section — return flat result
  if (sections.length === 1 && rows.results[0]) {
    const row = rows.results[0];
    const byteSize = new TextEncoder().encode(row.data).length;
    if (byteSize > SECTION_SIZE_LIMIT) {
      const sizeKb = String(Math.round(byteSize / 1024));
      const limitKb = String(SECTION_SIZE_LIMIT / 1024);
      return errorResult(
        `Section '${row.name}' is too large (${sizeKb}KB, limit is ${limitKb}KB). This section contains too much data for a single response.`,
      );
    }
    return textResult({
      save_id: saveId,
      section: row.name,
      data: JSON.parse(row.data) as Record<string, unknown>,
    });
  }

  // Multiple sections
  const result: Record<string, Record<string, unknown>> = {};
  const oversized: string[] = [];
  for (const row of rows.results) {
    const byteSize = new TextEncoder().encode(row.data).length;
    if (byteSize > SECTION_SIZE_LIMIT) {
      oversized.push(`${row.name} (${String(Math.round(byteSize / 1024))}KB)`);
    } else {
      result[row.name] = JSON.parse(row.data) as Record<string, unknown>;
    }
  }

  const found = new Set(rows.results.map((r) => r.name));
  const missing = sections.filter((s) => !found.has(s));

  const response: Record<string, unknown> = { save_id: saveId, sections: result };
  if (missing.length > 0) response.missing = missing;
  if (oversized.length > 0) response.oversized = oversized;
  return textResult(response);
}

/** If any requested section starts with "deck:", suggest close matches. */
async function deckMissError(
  db: D1Database,
  saveUuid: string,
  sections: string[],
): Promise<ToolResult | null> {
  const firstDeckMiss = sections.find((s) => s.startsWith("deck:"));
  if (!firstDeckMiss) return null;
  const suggestions = await suggestDeckSections(db, saveUuid, firstDeckMiss);
  if (suggestions.length === 0) return null;
  return errorResult(
    `Section '${firstDeckMiss}' not found. Did you mean: ${suggestions.join(", ")}?`,
  );
}

/**
 * Find deck sections with names similar to the requested one.
 * Uses Levenshtein distance on the name portion after "deck:", returning up to 3 suggestions.
 */
async function suggestDeckSections(
  db: D1Database,
  saveUuid: string,
  requested: string,
): Promise<string[]> {
  const allDecks = await db
    .prepare("SELECT name FROM sections WHERE save_uuid = ? AND name LIKE 'deck:%'")
    .bind(saveUuid)
    .all<{ name: string }>();

  if (allDecks.results.length === 0) return [];

  const query = requested.slice(5).toLowerCase();

  // Score by Levenshtein distance, normalized to [0, 1]. Filter out poor matches.
  const maxDistance = Math.max(query.length, 1);
  const scored = allDecks.results
    .map((row) => ({
      name: row.name,
      distance: levenshtein(query, row.name.slice(5).toLowerCase()),
    }))
    .filter((s) => s.distance / Math.max(s.name.length - 5, maxDistance) < 0.7)
    .toSorted((a, b) => a.distance - b.distance);

  return scored.slice(0, 3).map((s) => s.name);
}

/** Levenshtein edit distance between two strings. */
function levenshtein(source: string, target: string): number {
  if (source.length === 0) return target.length;
  if (target.length === 0) return source.length;

  // Single-row DP: previous[col] holds distance for (row-1, col).
  let previous: number[] = Array.from({ length: target.length + 1 }, (_, column) => column);
  for (let row = 1; row <= source.length; row++) {
    const current: number[] = [row];
    for (let column = 1; column <= target.length; column++) {
      const cost = source[row - 1] === target[column - 1] ? 0 : 1;
      current[column] = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[target.length] ?? 0;
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
    return errorResult("Save not found. Check the game listing for available saves and their IDs.");

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
    return errorResult("Save not found. Check the game listing for available saves and their IDs.");

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
    return errorResult("Save not found. Check the game listing for available saves and their IDs.");

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
    return errorResult("Save not found. Check the game listing for available saves and their IDs.");

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

export async function refreshSave(env: Env, userUuid: string, saveId: string): Promise<ToolResult> {
  const save = await lookupSave(env.DB, userUuid, saveId);
  if (!save)
    return errorResult("Save not found. Check the game listing for available saves and their IDs.");

  if (!save.last_source_uuid) {
    return errorResult(
      "No source has pushed data for this save yet. The daemon may not be running.",
    );
  }

  // Check if this save is adapter-backed
  const source = await env.DB.prepare("SELECT source_kind FROM sources WHERE source_uuid = ?")
    .bind(save.last_source_uuid)
    .first<{ source_kind: string }>();

  if (source?.source_kind === "adapter") {
    return refreshAdapterSave(env, userUuid, save, save.last_source_uuid);
  }

  // Daemon-backed: send rescan via SourceHub
  const id = env.SOURCE_HUB.idFromName(save.last_source_uuid);
  const stub = env.SOURCE_HUB.get(id);
  const resp = await stub.fetch(
    new Request("https://do/rescan", {
      method: "POST",
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

interface LinkedCharRow {
  character_id: string;
  character_name: string;
  metadata: string | null;
}

interface CredentialRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

function checkAdapterCooldown(save: SaveRow): ToolResult | null {
  if (!save.last_updated) return null;
  const lastUpdated = new Date(save.last_updated).getTime();
  const cooldownMs = ADAPTER_REFRESH_COOLDOWN_SEC * 1000;
  const now = Date.now();
  if (now - lastUpdated < cooldownMs) {
    const retryAfter = Math.ceil((cooldownMs - (now - lastUpdated)) / 1000);
    return errorResult(
      `This character was refreshed recently. Try again in ${String(retryAfter)} seconds.`,
    );
  }
  return null;
}

function buildCredentials(creds: CredentialRow | null): {
  accessToken: string;
  refreshToken: string | undefined;
  expiresAt: string | undefined;
} {
  return {
    accessToken: creds?.access_token ?? "",
    refreshToken: creds?.refresh_token ?? undefined,
    expiresAt: creds?.expires_at ?? undefined,
  };
}

function handleAdapterError(error: {
  code: string;
  message: string;
  userAction?: string;
  retryAfter?: number;
}): ToolResult {
  if (error.code === "token_expired") {
    return errorResult(
      `Battle.net token expired. ${error.userAction ?? "The player needs to reconnect their Battle.net account at savecraft.gg/settings."}`,
    );
  }
  if (error.code === "rate_limited") {
    return errorResult(
      `Blizzard API rate limited. Try again in ${String(error.retryAfter ?? 60)} seconds.`,
    );
  }
  if (error.code === "character_not_found") {
    return errorResult(
      "Character not found on Blizzard's servers. They may have been deleted or transferred.",
    );
  }
  return errorResult(`Game API error: ${error.message}`);
}

async function refreshAdapterSave(
  env: Env,
  userUuid: string,
  save: SaveRow,
  sourceUuid: string,
): Promise<ToolResult> {
  const adapter = adapters[save.game_id];
  if (!adapter) {
    return errorResult(`No adapter registered for game: ${save.game_id}`);
  }

  const cooldownResult = checkAdapterCooldown(save);
  if (cooldownResult) return cooldownResult;

  const linkedChar = await env.DB.prepare(
    `SELECT character_id, character_name, metadata
     FROM linked_characters
     WHERE user_uuid = ? AND game_id = ? AND source_uuid = ? AND active = 1
     AND character_name = ?`,
  )
    // WoW-specific: save_name format is "Name-realm-REGION", character_name is the first segment.
    // Future adapters with different naming conventions will need their own lookup logic.
    .bind(userUuid, save.game_id, sourceUuid, save.save_name.split("-")[0] ?? "")
    .first<LinkedCharRow>();

  const ctx = resolveCharacterContext(linkedChar, save.save_name);
  if (!ctx.realmSlug) {
    return errorResult("Cannot determine character realm. The character may need to be re-linked.");
  }

  const creds = await env.DB.prepare(
    "SELECT access_token, refresh_token, expires_at FROM game_credentials WHERE user_uuid = ? AND game_id = ?",
  )
    .bind(userUuid, save.game_id)
    .first<CredentialRow>();

  try {
    const gameState = await adapter.fetchState(
      {
        characterId: `${ctx.realmSlug}/${ctx.characterName}`,
        region: ctx.region,
        credentials: buildCredentials(creds),
      },
      env,
    );

    const parsedAt = new Date().toISOString();

    await storePush(
      env,
      userUuid,
      sourceUuid,
      save.game_id,
      gameState.identity.saveName,
      gameState.summary,
      parsedAt,
      gameState.sections,
    );

    return textResult({
      save_id: save.uuid,
      refreshed: true,
      summary: gameState.summary,
      timestamp: parsedAt,
    });
  } catch (error) {
    if (error instanceof AdapterError) {
      return handleAdapterError(error);
    }
    throw error;
  }
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
): Promise<ToolResult | ViewToolResult> {
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
             AND save_id IN (SELECT uuid FROM saves WHERE user_uuid = ? AND removed_at IS NULL)
           ORDER BY rank
           LIMIT 20`;
    params.push(saveId, userUuid);
  } else {
    sql = `SELECT save_id, save_name, type, ref_id, ref_title, snippet(search_index, 5, '**', '**', '...', 32) as snippet
           FROM search_index
           WHERE search_index MATCH ?
             AND save_id IN (SELECT uuid FROM saves WHERE user_uuid = ? AND removed_at IS NULL)
           ORDER BY rank
           LIMIT 20`;
    params.push(userUuid);
  }

  const rows = await db
    .prepare(sql)
    .bind(query, ...params)
    .all<SearchRow & { snippet: string }>();

  const data = {
    query,
    results: rows.results.map((row) => ({
      type: row.type,
      save_id: row.save_id,
      save_name: row.save_name,
      ref_id: row.ref_id,
      ref_title: row.ref_title,
      snippet: row.snippet,
    })),
  };

  return viewResult(data);
}

// ── Reference Data ───────────────────────────────────────────

/** Execute a native reference module and wrap the result as a ToolResult. */
async function executeNativeModule(
  nativeModule: NativeReferenceModule,
  query: Record<string, unknown>,
  env: Env,
): Promise<ToolResult | ViewToolResult> {
  try {
    const result = await nativeModule.execute(query, env);
    if (result.type === "text") {
      return { content: [{ type: "text", text: result.content }] };
    }
    return viewResult(result.data);
  } catch (error) {
    return errorResult(
      `Reference module error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function queryReference(
  referencePlugins: DispatchNamespace,
  gameId: string,
  module: string,
  query: Record<string, unknown>,
  env?: Env,
): Promise<ToolResult | ViewToolResult> {
  // Check native module registry first — native modules run in-process
  // with full platform bindings (D1, Vectorize, Workers AI).
  const nativeModule = getNativeModule(gameId, module);
  if (nativeModule && env) {
    return executeNativeModule(nativeModule, query, env);
  }

  // Fall through to Workers for Platforms dispatch for WASM modules.
  let plugin: Fetcher;
  try {
    plugin = referencePlugins.get(`${gameId}-reference`);
  } catch {
    return errorResult(
      `No reference module found for game "${gameId}". Check the game listing for available games and their reference modules.`,
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
      `Reference module for "${gameId}" is not available. It may not be deployed yet. Check the game listing for available games and their reference modules.`,
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

  return parseWasmResponse(text);
}

/** Parse WASM ndjson response into a ToolResult or ViewToolResult.
 *
 * When a WASM result contains `{type: "result", data: {...}}` with a
 * non-null object data field, returns a ViewToolResult with data as
 * structuredContent. Otherwise returns a plain text ToolResult.
 */
export function parseWasmResponse(text: string): ToolResult | ViewToolResult {
  const lines = text
    .trim()
    .split("\n")
    .filter((l: string) => l.length > 0);

  if (lines.length === 1) {
    try {
      const parsed = JSON.parse(lines[0] ?? "") as Record<string, unknown>;

      // Unwrap ndjson envelope: {type: "result", data: {...}} → ViewToolResult
      if (
        parsed.type === "result" &&
        typeof parsed.data === "object" &&
        parsed.data !== null &&
        !Array.isArray(parsed.data)
      ) {
        return viewResult(parsed.data as Record<string, unknown>);
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

// ── Savecraft Info ───────────────────────────────────────────

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
  source_kind: string;
}

/** Safe subset of source info — never includes token_hash, user PII, etc. */
interface ConfiguredGame {
  game_id: string;
  save_path: string;
  config_status: string;
  resolved_path: string;
  last_error: string;
  result_at: string | null;
}

interface AdapterCredential {
  game_id: string;
  status: "connected" | "expired" | "missing";
}

interface SourceInfo {
  source_uuid: string;
  source_kind: string;
  hostname: string | null;
  os: string | null;
  arch: string | null;
  linked: boolean;
  last_active: string | null;
  activity: "active" | "recently_active" | "inactive" | "never_pushed";
  capabilities: { can_rescan: boolean; can_receive_config: boolean };
  configured_games: ConfiguredGame[];
  adapter_credentials?: AdapterCredential[];
}

interface SourceLookupResult {
  found: boolean;
  source_uuid?: string;
  source_kind?: string;
  hostname?: string | null;
  os?: string | null;
  arch?: string | null;
  linked?: boolean;
  last_active?: string | null;
  activity?: string;
  daemon_online?: boolean;
  link_code_valid?: boolean;
  link_code_expires_at?: string | null;
}

interface PlatformGuide {
  install: string | null;
  details: string;
}

interface ApiGamesGuide {
  setup: string;
  available_games: AdapterGameInfo[];
}

interface CategoryDescription {
  description: string;
}

type GuideEntry = PlatformGuide | string | ApiGamesGuide;

interface InfoResponse {
  sources: SourceInfo[];
  categories?: Record<string, CategoryDescription>;
  games?: SupportedGameInfo[];
  setup?: Record<string, GuideEntry>;
  privacy?: string;
  about?: string;
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
    source_kind: row.source_kind,
    hostname: row.hostname,
    os: row.os,
    arch: row.arch,
    linked: row.user_uuid !== null,
    last_active: row.last_push_at,
    activity: deriveActivity(row.last_push_at),
    capabilities: {
      can_rescan: row.can_rescan === 1,
      can_receive_config: row.can_receive_config === 1,
    },
    configured_games: [],
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
      "Downloads signed binaries, verifies Ed25519 signatures, installs to ~/.local/bin/, sets up a systemd user service, and auto-registers the source. The daemon starts immediately and prints a pairing link.",
  },
  windows: {
    install:
      "Visit https://install.savecraft.gg in a browser to download the Savecraft installer. Run the downloaded MSI to install.",
    details: String.raw`Downloads a signed MSI installer. Installs the daemon and tray to %LOCALAPPDATA%\Savecraft\, registers autostart via the registry, and launches the tray for pairing. No admin required. The installer is Authenticode-signed — no SmartScreen warnings.`,
  },
  macos: {
    install: null,
    details: "macOS support is not yet available. It's on the roadmap.",
  },
};

const PAIRING_GUIDE =
  "After installing, the daemon self-registers and displays a pairing link (https://my.savecraft.gg/link/<code>). Click the link, use the tray app's 'Link Account' button, or enter the 6-digit code on the my.savecraft.gg homepage. Once paired, your game saves appear automatically. Codes expire after 20 minutes — restart the daemon to generate a new one.";

const ADAPTER_SETUP_GUIDE =
  "Some games connect through their official API instead of local save files — for example, World of Warcraft connects through Battle.net. These are called adapter sources. No local daemon install is needed. To set up an API-backed game: visit savecraft.gg, select the game, choose your region if prompted, and complete the OAuth authorization with the game's provider (e.g. Battle.net for WoW). Once authorized, Savecraft discovers your characters automatically. Each adapter source includes an adapter_credentials array showing credential status per game: 'connected' means the OAuth token is valid, 'expired' means the token needs re-authorization at savecraft.gg, and 'missing' means the game is linked but OAuth hasn't been completed yet.";

const CATEGORIES_MENU: Record<string, CategoryDescription> = {
  games: {
    description:
      "All supported games with source type, coverage, limitations, and setup instructions. Use when the player asks what games Savecraft supports or how to set up a specific game.",
  },
  setup: {
    description:
      "Installation instructions, pairing guide, and API game setup. Use when the player needs help connecting.",
  },
  privacy: {
    description:
      "What data Savecraft collects, where it's stored, and what it does NOT collect. Use when the player asks about safety or privacy.",
  },
  about: {
    description:
      "Who made Savecraft, how it works, open source links. Use when the player asks what Savecraft is or who's behind it.",
  },
};

const PRIVACY_INFO = `Savecraft collects the minimum data needed to connect your game saves to AI assistants. We store your email address, your game save data (which you push to us), notes you create, and — for API-connected games like World of Warcraft — OAuth tokens from game platform accounts solely to verify character ownership and refresh data on demand. We do not run analytics, do not track you, do not sell your data, and do not see your conversations with AI assistants. Our code is open source (https://github.com/joshsymonds/savecraft.gg) — you can verify all of this yourself.

Where data is stored: Cloudflare (Workers, D1/SQLite, R2 for plugin binaries, KV for OAuth tokens). Encryption at rest and in transit. Device auth tokens are SHA-256 hashed. WASM plugins are sandboxed.

What we do NOT collect: No analytics or telemetry. No IP addresses. No conversation history — we never see what you say to the AI. No device fingerprinting. No behavioral tracking.

Data deletion: You can delete individual saves, notes, and devices through the web UI or MCP tools. Email privacy@savecraft.gg to delete your entire account and all associated data.

Full privacy policy: https://savecraft.gg/privacy`;

const ABOUT_INFO = `Savecraft is an open source project that connects your video game save files to AI assistants via the Model Context Protocol (MCP).

How it works: For local games (e.g. Diablo II, Stardew Valley), a daemon runs on your machine, watches save files, parses them with sandboxed WASM plugins, and pushes structured game state to the cloud. For API-backed games (e.g. World of Warcraft via Battle.net), server-side adapters connect through OAuth — no local install needed. Either way, AI assistants access your game data through MCP tools.

Open source: https://github.com/joshsymonds/savecraft.gg
Author: Josh Symonds (https://joshsymonds.com)
Contact: josh@savecraft.gg
Discord: https://discord.gg/YnC8stpEmF
License: Source-available on GitHub`;

interface AdapterGameInfo {
  game_id: string;
  name: string;
}

interface SupportedGameInfo {
  game_id: string;
  name: string;
  description: string;
  sources: string[];
  channel: string;
  coverage: string;
  limitations: string[];
  setup: string;
}

const DEFAULT_SETUP_BLURB =
  "Install the Savecraft daemon on your machine. It watches your save files, parses them with a sandboxed WASM plugin, and pushes structured game state to Savecraft automatically. Your save files never leave your device — only the parsed data is sent.";

const SOURCE_SETUP_BLURBS: Record<string, string> = {
  wasm: "Install the Savecraft daemon on your machine. It watches your save files, parses them with a sandboxed WASM plugin, and pushes structured game state to Savecraft automatically. Your save files never leave your device — only the parsed data is sent.",
  api: "No local install needed. Visit savecraft.gg, select this game, choose your region if prompted, and complete OAuth authorization with the game's provider. Savecraft discovers your characters automatically.",
  mod: "Subscribe to the Savecraft mod on Steam Workshop. The mod runs inside the game, connects to Savecraft directly, and pushes game state on every save. No external daemon needed.",
};

/** Build a setup blurb by joining blurbs for each source type. */
function buildSetupBlurb(sources: string[]): string {
  const blurbs = sources.map((s) => SOURCE_SETUP_BLURBS[s]).filter((b): b is string => !!b);
  return blurbs.length > 0 ? blurbs.join(" Additionally: ") : DEFAULT_SETUP_BLURB;
}

function buildDaemonGuide(platform?: string): Record<string, PlatformGuide | string> {
  if (platform) {
    const guide = PLATFORM_GUIDES[platform];
    if (guide) {
      return { [platform]: guide, pairing: PAIRING_GUIDE };
    }
  }
  return { ...PLATFORM_GUIDES, pairing: PAIRING_GUIDE };
}

function buildGuide(sourceKinds: Set<string>, platform?: string): Record<string, GuideEntry> {
  const hasDaemon = sourceKinds.has("daemon");
  const hasAdapter = sourceKinds.has("adapter");
  const hasNone = sourceKinds.size === 0;

  const guide: Record<string, GuideEntry> = {};

  if (hasDaemon || hasNone) {
    Object.assign(guide, buildDaemonGuide(platform));
  }

  if (hasAdapter || hasNone) {
    const apiGames = getApiGamesFromManifests();
    if (apiGames.length > 0) {
      guide.api_games = { setup: ADAPTER_SETUP_GUIDE, available_games: apiGames };
    }
  }

  return guide;
}

function getApiGamesFromManifests(): AdapterGameInfo[] {
  return MANIFEST_LIST.filter((m) => m.sources?.includes("api")).map((m) => ({
    game_id: m.game_id,
    name: m.name ?? m.game_id,
  }));
}

function getAllGamesFromManifests(): SupportedGameInfo[] {
  return MANIFEST_LIST.map((m) => ({
    game_id: m.game_id,
    name: m.name ?? m.game_id,
    description: m.description ?? "",
    sources: m.sources ?? ["wasm"],
    channel: m.channel ?? "beta",
    coverage: m.coverage ?? "partial",
    limitations: m.limitations ?? [],
    setup: buildSetupBlurb(m.sources ?? ["wasm"]),
  })).toSorted((a, b) => a.name.localeCompare(b.name));
}

const SOURCE_COLS =
  "source_uuid, user_uuid, hostname, os, arch, last_push_at, link_code, link_code_expires_at, can_rescan, can_receive_config, source_kind";

async function resolveLookup(
  db: D1Database,
  env: Env,
  sourceUuid?: string,
  linkCode?: string,
): Promise<SourceLookupResult | undefined> {
  let row: SourceRow | null;
  let viaCode: boolean;

  if (sourceUuid) {
    row = await db
      .prepare(`SELECT ${SOURCE_COLS} FROM sources WHERE source_uuid = ?`)
      .bind(sourceUuid)
      .first<SourceRow>();
    viaCode = false;
  } else if (linkCode) {
    row = await db
      .prepare(`SELECT ${SOURCE_COLS} FROM sources WHERE link_code = ?`)
      .bind(linkCode)
      .first<SourceRow>();
    viaCode = true;
  } else {
    return undefined;
  }

  const lookup = buildLookupResult(row, viaCode);

  if (lookup.found && row) {
    try {
      const doId = env.SOURCE_HUB.idFromName(row.source_uuid);
      const resp = await env.SOURCE_HUB.get(doId).fetch(
        new Request("https://do/status", { method: "GET" }),
      );
      if (resp.ok) {
        const status = await resp.json<{ daemon_online: boolean }>();
        lookup.daemon_online = status.daemon_online;
      }
    } catch {
      // Don't let live status check failures break setup help
    }
  }

  return lookup;
}

async function attachAdapterCredentials(
  db: D1Database,
  userUuid: string,
  sources: SourceInfo[],
): Promise<void> {
  const [credRows, linkedGameRows] = await Promise.all([
    db
      .prepare(`SELECT game_id, expires_at FROM game_credentials WHERE user_uuid = ?`)
      .bind(userUuid)
      .all<{ game_id: string; expires_at: string }>(),
    db
      .prepare(`SELECT DISTINCT game_id FROM linked_characters WHERE user_uuid = ? AND active = 1`)
      .bind(userUuid)
      .all<{ game_id: string }>(),
  ]);

  const now = Date.now();
  const credByGame = new Map<string, "connected" | "expired">(
    credRows.results.map((row) => [
      row.game_id,
      new Date(row.expires_at).getTime() > now ? "connected" : "expired",
    ]),
  );

  const linkedGameIds = new Set(linkedGameRows.results.map((r) => r.game_id));
  for (const gameId of credByGame.keys()) {
    linkedGameIds.add(gameId);
  }

  const credentials: AdapterCredential[] = [...linkedGameIds].map((gameId) => ({
    game_id: gameId,
    status: credByGame.get(gameId) ?? "missing",
  }));

  for (const source of sources) {
    if (source.source_kind === "adapter") {
      source.adapter_credentials = credentials;
    }
  }
}

export async function getInfo(
  env: Env,
  userUuid: string,
  category?: string,
  platform?: string,
  linkCode?: string,
  sourceUuid?: string,
): Promise<ToolResult> {
  const db = env.DB;

  // 1. User's linked sources (always returned)
  const sourceRows = await db
    .prepare(
      `SELECT ${SOURCE_COLS} FROM sources WHERE user_uuid = ? ORDER BY last_push_at DESC NULLS LAST LIMIT 100`,
    )
    .bind(userUuid)
    .all<SourceRow>();

  const sources = sourceRows.results.map((row) => formatSourceInfo(row));

  // 1b. Attach per-source config status
  if (sources.length > 0) {
    const configStmt = db.prepare(
      `SELECT game_id, save_path, config_status, resolved_path, last_error, result_at
       FROM source_configs WHERE source_uuid = ?`,
    );
    const configBatch = sourceRows.results.map((row) => configStmt.bind(row.source_uuid));
    const configResults = await db.batch<ConfiguredGame>(configBatch);
    for (const [index, source] of sources.entries()) {
      source.configured_games = configResults[index]?.results ?? [];
    }
  }

  // 1c. Attach credential status for adapter sources.
  if (sources.some((s) => s.source_kind === "adapter")) {
    await attachAdapterCredentials(db, userUuid, sources);
  }

  // 2. Optional lookup (runs regardless of category)
  const lookup = await resolveLookup(db, env, sourceUuid, linkCode);

  // 3. Build response based on category
  const response: InfoResponse = { sources };

  switch (category) {
    case undefined: {
      response.categories = CATEGORIES_MENU;
      break;
    }
    case "games": {
      response.games = getAllGamesFromManifests();
      break;
    }
    case "setup": {
      const sourceKinds = new Set(sourceRows.results.map((r) => r.source_kind));
      response.setup = buildGuide(sourceKinds, platform);
      break;
    }
    case "privacy": {
      response.privacy = PRIVACY_INFO;
      break;
    }
    case "about": {
      response.about = ABOUT_INFO;
      break;
    }
    // No default needed — unknown categories just return sources
  }

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
  sections: Record<string, { description: string; data: Record<string, unknown> }>,
): Promise<void> {
  const batch: D1PreparedStatement[] = [
    db.prepare("DELETE FROM search_index WHERE save_id = ? AND type = 'section'").bind(saveId),
  ];

  for (const [name, section] of Object.entries(sections)) {
    batch.push(
      db
        .prepare(
          "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, 'section', ?, ?, ?)",
        )
        .bind(saveId, saveName, name, section.description, JSON.stringify(section.data)),
    );
  }

  await db.batch(batch);
}

export async function indexNote(
  db: D1Database,
  saveId: string,
  saveName: string,
  noteId: string,
  title: string,
  content: string,
): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM search_index WHERE ref_id = ? AND type = 'note'").bind(noteId),
    db
      .prepare(
        "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, 'note', ?, ?, ?)",
      )
      .bind(saveId, saveName, noteId, title, content),
  ]);
}

export async function removeNoteFromIndex(db: D1Database, noteId: string): Promise<void> {
  await db
    .prepare("DELETE FROM search_index WHERE ref_id = ? AND type = 'note'")
    .bind(noteId)
    .run();
}
