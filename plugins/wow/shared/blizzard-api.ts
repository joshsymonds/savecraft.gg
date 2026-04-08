/**
 * Shared Blizzard API helpers for WoW adapter and reference modules.
 *
 * Provides app-token auth (client credentials flow) and a typed fetch wrapper.
 * Reuse this instead of duplicating auth logic in each module.
 */

import type { Env } from "../../../worker/src/types";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class BlizzardApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "BlizzardApiError";
  }
}

// ---------------------------------------------------------------------------
// OAuth token URL mapping
// ---------------------------------------------------------------------------

const TOKEN_URLS: Record<string, string> = {
  us: "https://oauth.battle.net/token",
  eu: "https://oauth.battle.net/token",
  kr: "https://apac.oauth.battle.net/token",
  tw: "https://apac.oauth.battle.net/token",
};

// ---------------------------------------------------------------------------
// App token (client credentials)
// ---------------------------------------------------------------------------

let cachedAppToken: { token: string; expiresAt: number } | null = null;

/** Clear the cached token (for tests). */
export function resetTokenCache(): void {
  cachedAppToken = null;
}

/**
 * Get a Blizzard app-level access token via client credentials flow.
 * Tokens are cached per-isolate with a 5-minute safety margin.
 */
export async function getAppToken(env: Env): Promise<string> {
  if (cachedAppToken && Date.now() < cachedAppToken.expiresAt - 5 * 60 * 1000) {
    return cachedAppToken.token;
  }

  if (!env.BATTLENET_CLIENT_ID || !env.BATTLENET_CLIENT_SECRET) {
    throw new BlizzardApiError(
      "Battle.net credentials not configured (BATTLENET_CLIENT_ID and BATTLENET_CLIENT_SECRET required)",
    );
  }

  const tokenUrl =
    TOKEN_URLS[env.BATTLENET_REGION ?? "us"] ?? "https://oauth.battle.net/token";

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.BATTLENET_CLIENT_ID,
      client_secret: env.BATTLENET_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    throw new BlizzardApiError(
      `Failed to get Blizzard app token: HTTP ${res.status}`,
      res.status,
    );
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new BlizzardApiError(
      "Blizzard token response missing access_token",
    );
  }

  const expiresInMs = (data.expires_in ?? 86400) * 1000;
  cachedAppToken = {
    token: data.access_token,
    expiresAt: Date.now() + expiresInMs,
  };

  return data.access_token;
}

// ---------------------------------------------------------------------------
// Typed fetch
// ---------------------------------------------------------------------------

/**
 * Fetch a Blizzard API endpoint with Bearer token auth.
 * Returns parsed JSON data and Last-Modified header.
 * Throws BlizzardApiError on non-200 responses.
 */
export async function blizzardFetch<T>(
  url: string,
  token: string,
): Promise<{ data: T; lastModified: string | null }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new BlizzardApiError(
      `Blizzard API error ${res.status}: ${url}`,
      res.status,
    );
  }

  const data = (await res.json()) as T;
  const lastModified = res.headers.get("Last-Modified");
  return { data, lastModified };
}
