/**
 * Authenticated GGG (Path of Exile) API access.
 *
 * Centralizes the mandatory User-Agent, rate-limit handling, and the
 * GGG-status → AdapterError mapping so every call (discoverSaves now,
 * fetchState later) behaves consistently.
 */

import { AdapterError, type GameCredentials } from "../../../worker/src/adapters/adapter";
import type { Env } from "../../../worker/src/types";

const GGG_API_BASE = "https://api.pathofexile.com";

// GGG requires `OAuth {clientId}/{version} (contact: {email})`. The id
// segment is our registered OAuth app slug (not a secret); the access
// token is the actual credential. Keep in sync with the registered app.
const GGG_USER_AGENT = "OAuth savecraft/1.0 (contact: oauth@savecraft.gg)";

/**
 * GET a GGG API path with the user's access token. Maps GGG failure
 * statuses to typed AdapterErrors; returns the parsed JSON on success.
 *
 * @throws {AdapterError} token_expired (401), rate_limited (429,
 *   honoring Retry-After), api_unavailable (other non-2xx / network).
 */
export async function gggGet<T>(path: string, accessToken: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${GGG_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": GGG_USER_AGENT,
        Accept: "application/json",
      },
    });
  } catch (cause) {
    throw new AdapterError(
      "api_unavailable",
      `GGG API request to ${path} failed: ${String(cause)}`,
    );
  }

  if (res.status === 401) {
    throw new AdapterError("token_expired", "GGG token expired or revoked", {
      userAction: "Reconnect your Path of Exile account at savecraft.gg/settings",
    });
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "");
    throw new AdapterError("rate_limited", "GGG API rate limit reached", {
      retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
  }
  if (!res.ok) {
    throw new AdapterError(
      "api_unavailable",
      `GGG API ${path} returned ${res.status}`,
    );
  }

  return res.json<T>();
}

const GGG_TOKEN_URL = "https://www.pathofexile.com/oauth/token";

/** Refreshed GGG tokens to persist back to game_credentials. */
export interface RefreshedCreds {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

/**
 * Return a usable access token, refreshing in-adapter (confidential
 * client) when the stored one has expired. WoW-style: no global
 * refresher. When a refresh happens, `refreshed` carries the new
 * tokens so the caller (via identity.extra → postPushHooks) can
 * persist them to game_credentials.
 *
 * @throws {AdapterError} token_expired when expired and unrefreshable.
 */
export async function ensureGggAccessToken(
  creds: GameCredentials,
  env: Env,
): Promise<{ accessToken: string; refreshed?: RefreshedCreds }> {
  const stillValid =
    !creds.expiresAt || new Date(creds.expiresAt).getTime() > Date.now();
  if (stillValid) {
    return { accessToken: creds.accessToken };
  }
  if (!creds.refreshToken) {
    throw new AdapterError("token_expired", "GGG token expired", {
      userAction: "Reconnect your Path of Exile account at savecraft.gg/settings",
    });
  }

  const res = await fetch(GGG_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": GGG_USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
      client_id: env.GGG_CLIENT_ID ?? "",
      client_secret: env.GGG_CLIENT_SECRET ?? "",
    }),
  });
  if (!res.ok) {
    throw new AdapterError("token_expired", `GGG token refresh failed (${res.status})`, {
      userAction: "Reconnect your Path of Exile account at savecraft.gg/settings",
    });
  }
  const tok = await res.json<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  }>();
  if (!tok.access_token) {
    throw new AdapterError("token_expired", "GGG refresh response missing access_token");
  }
  const expiresAt = tok.expires_in
    ? new Date(Date.now() + tok.expires_in * 1000).toISOString()
    : null;
  return {
    accessToken: tok.access_token,
    refreshed: {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? creds.refreshToken,
      expiresAt,
    },
  };
}
