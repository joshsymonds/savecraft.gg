/**
 * Authenticated GGG (Grinding Gear Games) API access and OAuth
 * constants, shared by every game on the "ggg" provider (see
 * providers.ts) — currently PoE, with PoE2 next.
 *
 * Centralizes the OAuth endpoints/scopes, the mandatory User-Agent,
 * rate-limit handling, and the GGG-status → AdapterError mapping so
 * every call (discoverSaves, fetchState, token refresh) behaves
 * consistently across adapters.
 */

import type { Env } from "../types";

import { AdapterError, type GameCredentials, reconnectAdapterAction } from "./adapter";

const GGG_API_BASE = "https://api.pathofexile.com";

// Caps any single GGG HTTP call so a hung socket can't pin a cron
// fan-out slot for the Worker's full wall-clock budget.
const GGG_REQUEST_TIMEOUT_MS = 30_000;

// GGG requires `OAuth {clientId}/{version} (contact: {email})`. The id
// segment is our registered OAuth app slug (not a secret); the access
// token is the actual credential. Keep in sync with the registered app.
export const GGG_USER_AGENT = "OAuth savecraft/1.0 (contact: oauth@savecraft.gg)";

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
      // A hung GGG socket otherwise holds a cron fan-out slot for the
      // Worker's whole wall-clock budget (mirrors the pob-server call).
      signal: AbortSignal.timeout(GGG_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AdapterError(
      "api_unavailable",
      `GGG API request to ${path} failed: ${String(error)}`,
    );
  }

  if (res.status === 401) {
    throw new AdapterError("token_expired", "GGG token expired or revoked", {
      userAction: reconnectAdapterAction("Path of Exile"),
    });
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "");
    throw new AdapterError("rate_limited", "GGG API rate limit reached", {
      retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
  }
  if (!res.ok) {
    throw new AdapterError("api_unavailable", `GGG API ${path} returned ${String(res.status)}`);
  }

  return res.json<T>();
}

export const GGG_AUTHORIZE_URL = "https://www.pathofexile.com/oauth/authorize";
export const GGG_TOKEN_URL = "https://www.pathofexile.com/oauth/token";

// account:characters returns the full build (gear + passives + jewels);
// account:profile gives the correctly-cased account name needed for the
// case-sensitive character sub-endpoints.
export const GGG_SCOPES = ["account:characters", "account:profile"];

/**
 * Return a usable access token, refreshing in-adapter (confidential
 * client) when the stored one has expired. WoW-style: no global
 * refresher. GGG rotates the refresh token on every use, so a
 * successful exchange is handed to `persistCredentials` and awaited
 * BEFORE this function returns — a failure later in the fetch must
 * never discard the only valid refresh token.
 *
 * @throws {AdapterError} token_expired when expired and unrefreshable.
 */
export async function ensureGggAccessToken(
  creds: GameCredentials,
  env: Env,
  persistCredentials: (creds: GameCredentials) => Promise<void>,
): Promise<string> {
  const stillValid = !creds.expiresAt || new Date(creds.expiresAt).getTime() > Date.now();
  if (stillValid) {
    return creds.accessToken;
  }
  if (!creds.refreshToken) {
    throw new AdapterError("token_expired", "GGG token expired", {
      userAction: reconnectAdapterAction("Path of Exile"),
    });
  }
  // Server misconfiguration, not a user problem: refuse before sending
  // GGG an empty client_id (which it rejects as invalid_client).
  if (!env.GGG_CLIENT_ID || !env.GGG_CLIENT_SECRET) {
    throw new AdapterError(
      "api_unavailable",
      "GGG credentials not configured (GGG_CLIENT_ID and GGG_CLIENT_SECRET required)",
    );
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
      client_id: env.GGG_CLIENT_ID,
      client_secret: env.GGG_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(GGG_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new AdapterError("token_expired", `GGG token refresh failed (${String(res.status)})`, {
      userAction: reconnectAdapterAction("Path of Exile"),
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
  const rotated: GameCredentials = {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? creds.refreshToken,
    expiresAt: tok.expires_in
      ? new Date(Date.now() + tok.expires_in * 1000).toISOString()
      : undefined,
  };
  // GGG invalidated the old refresh token the moment the exchange
  // succeeded — persist the rotated pair before anything else can fail.
  await persistCredentials(rotated);
  return rotated.accessToken;
}
