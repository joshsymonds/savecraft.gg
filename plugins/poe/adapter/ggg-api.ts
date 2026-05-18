/**
 * Authenticated GGG (Path of Exile) API access.
 *
 * Centralizes the mandatory User-Agent, rate-limit handling, and the
 * GGG-status → AdapterError mapping so every call (discoverSaves now,
 * fetchState later) behaves consistently.
 */

import { AdapterError } from "../../../worker/src/adapters/adapter";

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
