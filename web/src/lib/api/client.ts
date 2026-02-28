import { PUBLIC_API_URL } from "$env/static/public";
import { getToken } from "$lib/auth/clerk";

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

// ── Device config types ──────────────────────────────────────

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

export async function fetchDeviceConfig(
  deviceId: string,
): Promise<Record<string, GameConfigInput>> {
  const data = await request<{ games: Record<string, GameConfigInput> }>(
    `/api/v1/devices/${deviceId}/config`,
  );
  return data.games;
}

export async function saveDeviceConfig(
  deviceId: string,
  games: Record<string, GameConfigInput>,
): Promise<void> {
  await mutate<{ ok: boolean }>("PUT", `/api/v1/devices/${deviceId}/config`, { games });
}

// ── API Key types ─────────────────────────────────────────────

export interface ApiKey {
  id: string;
  prefix: string;
  label: string;
  created_at: string;
}

export interface CreateApiKeyResponse {
  id: string;
  key: string;
  prefix: string;
  label: string;
}

// ── Pairing ──────────────────────────────────────────────────

export interface PairingCodeResponse {
  code: string;
}

export async function generatePairingCode(): Promise<PairingCodeResponse> {
  return mutate<PairingCodeResponse>("POST", "/api/v1/pair");
}

// ── API Key endpoints ─────────────────────────────────────────

export async function createApiKey(label?: string): Promise<CreateApiKeyResponse> {
  return mutate<CreateApiKeyResponse>("POST", "/api/v1/api-keys", label ? { label } : {});
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const data = await request<{ keys: ApiKey[] }>("/api/v1/api-keys");
  return data.keys;
}

export async function deleteApiKey(keyId: string): Promise<void> {
  await mutate<{ deleted: boolean }>("DELETE", `/api/v1/api-keys/${keyId}`);
}
