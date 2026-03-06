import { PUBLIC_API_URL } from "$env/static/public";
import { getToken } from "$lib/auth/clerk";
import type { NoteSource, NoteSummary } from "$lib/types/source";
import { relativeTime } from "$lib/utils/time";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Not authenticated");

  const response = await fetch(`${PUBLIC_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body);
  }

  return response.json() as Promise<T>;
}

async function mutate<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Not authenticated");

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const hasBody = body !== undefined;
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${PUBLIC_API_URL}${path}`, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text);
  }

  return response.json() as Promise<T>;
}

// ── Save types (match worker REST response) ──────────────────

export interface ApiSave {
  id: string;
  game_id: string;
  save_name: string;
  summary: string;
  last_updated: string;
}

export interface ApiSaveDetail extends ApiSave {
  sections: { name: string; description: string }[];
}

// ── Plugin manifest types ────────────────────────────────────

export interface PluginManifest {
  game_id: string;
  name: string;
  version: string;
  file_extensions: string[];
  default_paths: { windows?: string; linux?: string; darwin?: string };
  coverage: string;
}

// ── Source config types ──────────────────────────────────────

export interface GameConfigInput {
  savePath: string;
  enabled: boolean;
  fileExtensions: string[];
}

// ── Endpoints ────────────────────────────────────────────────

export async function fetchSaves(): Promise<ApiSave[]> {
  const data = await request<{ saves: ApiSave[] }>("/api/v1/saves");
  return data.saves;
}

export async function fetchSave(saveId: string): Promise<ApiSaveDetail> {
  return request<ApiSaveDetail>(`/api/v1/saves/${saveId}`);
}

/** Public endpoint — no auth required. */
export async function fetchPluginManifest(): Promise<Record<string, PluginManifest>> {
  const response = await fetch(`${PUBLIC_API_URL}/api/v1/plugins/manifest`);
  if (!response.ok) {
    throw new ApiError(response.status, "Failed to fetch plugin manifest");
  }
  const data = (await response.json()) as { plugins: Record<string, PluginManifest> };
  return data.plugins;
}

export async function fetchSourceConfig(
  sourceId: string,
): Promise<Record<string, GameConfigInput>> {
  const data = await request<{ games: Record<string, GameConfigInput> }>(
    `/api/v1/sources/${sourceId}/config`,
  );
  return data.games;
}

export async function saveSourceConfig(
  sourceId: string,
  games: Record<string, GameConfigInput>,
): Promise<void> {
  await mutate<{ ok: boolean }>("PUT", `/api/v1/sources/${sourceId}/config`, { games });
}

export async function patchGameConfig(
  sourceId: string,
  gameId: string,
  fields: { enabled: boolean },
): Promise<void> {
  await mutate<{ ok: boolean }>("PATCH", `/api/v1/sources/${sourceId}/config/${gameId}`, fields);
}

// ── Notes ─────────────────────────────────────────────────────

export interface ApiNote {
  note_id: string;
  title: string;
  content: string;
  source: string;
  size_bytes: number;
  updated_at: string;
}

export async function fetchNotes(saveId: string): Promise<ApiNote[]> {
  const data = await request<{ notes: ApiNote[] }>(`/api/v1/notes/${saveId}`);
  return data.notes;
}

export async function createNote(saveId: string, title: string, content: string): Promise<string> {
  const data = await mutate<{ note_id: string }>("POST", `/api/v1/notes/${saveId}`, {
    title,
    content,
  });
  return data.note_id;
}

export async function updateNote(
  saveId: string,
  noteId: string,
  fields: { title?: string; content?: string },
): Promise<void> {
  await mutate<{ updated: boolean }>("PUT", `/api/v1/notes/${saveId}/${noteId}`, fields);
}

export async function deleteNote(saveId: string, noteId: string): Promise<void> {
  await mutate<{ deleted: boolean }>("DELETE", `/api/v1/notes/${saveId}/${noteId}`);
}

export function toNoteSummary(note: ApiNote): NoteSummary {
  return {
    id: note.note_id,
    title: note.title,
    content: note.content,
    source: note.source as NoteSource,
    sizeBytes: note.size_bytes,
    updatedAt: relativeTime(note.updated_at),
  };
}

// ── Source Linking ────────────────────────────────────────────

export interface LinkSourceResponse {
  source_uuid: string;
}

export async function linkSource(code: string): Promise<LinkSourceResponse> {
  return mutate<LinkSourceResponse>("POST", "/api/v1/source/link", { code });
}

// ── Source & Game Removal ──────────────────────────────────────

export async function deleteSource(sourceUuid: string): Promise<void> {
  await mutate<{ ok: boolean }>("DELETE", `/api/v1/sources/${sourceUuid}`);
}

export async function deleteGame(gameId: string): Promise<{ saves: number; notes: number }> {
  const data = await mutate<{ ok: boolean; deleted: { saves: number; notes: number } }>(
    "DELETE",
    `/api/v1/games/${gameId}`,
  );
  return data.deleted;
}

// ── MCP Status ────────────────────────────────────────────────

export interface McpStatus {
  connected: boolean;
}

export async function fetchMcpStatus(): Promise<McpStatus> {
  return request<McpStatus>("/api/v1/mcp-status");
}
