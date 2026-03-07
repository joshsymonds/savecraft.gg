import { getOAuthApi } from "@cloudflare/workers-oauth-provider";
import { env, SELF } from "cloudflare:test";

import { OAUTH_ENDPOINTS } from "../src/oauth";
import type { OAuthProps } from "../src/oauth";

/** D1 tables in FK-safe deletion order (children before parents). */
export const CLEANUP_TABLES = [
  "search_index",
  "notes",
  "source_configs",
  "source_events",
  "mcp_activity",
  "api_keys",
  "saves",
  "sources",
] as const;

/**
 * Clean all shared state (D1 + R2) between tests.
 * Delete order: children before parents (FK-safe).
 */
export async function cleanAll(): Promise<void> {
  for (const table of CLEANUP_TABLES) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  for (const bucket of [env.SAVES, env.PLUGINS]) {
    const listed = await bucket.list();
    for (const object of listed.objects) {
      await bucket.delete(object.key);
    }
  }
}

/**
 * Connect a UI WebSocket through the Worker routes.
 * Authenticates with stub auth (bearer token = user UUID).
 */
export async function connectWs(path: string, userUuid: string): Promise<WebSocket> {
  const resp = await SELF.fetch(`https://test-host${path}`, {
    headers: {
      Upgrade: "websocket",
      Authorization: `Bearer ${userUuid}`,
    },
  });

  const ws = resp.webSocket;
  if (!ws) {
    throw new Error(
      `WebSocket upgrade failed for ${path}: ${String(resp.status)} ${resp.statusText}`,
    );
  }
  ws.accept();
  return ws;
}

/**
 * Connect a daemon WebSocket using a source token.
 * authenticateSource() does D1 lookup — source must be seeded first via seedSource().
 */
export async function connectDaemonWs(sourceToken: string): Promise<WebSocket> {
  const resp = await SELF.fetch("https://test-host/ws/daemon", {
    headers: {
      Upgrade: "websocket",
      Authorization: `Bearer ${sourceToken}`,
    },
  });

  const ws = resp.webSocket;
  if (!ws) {
    throw new Error(`Daemon WebSocket upgrade failed: ${String(resp.status)} ${resp.statusText}`);
  }
  ws.accept();
  return ws;
}

/**
 * Close a WebSocket and wait for the server-side handler to settle.
 * Without the delay, vitest-pool-workers may invalidate the DO between
 * test files while webSocketClose is still running async storage ops,
 * causing workerd inputGateBroken errors.
 */
export async function closeWs(ws: WebSocket): Promise<void> {
  ws.close();
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}

/**
 * Wait for the next message on a WebSocket.
 * Returns the parsed JSON message, or rejects on timeout.
 */
export function waitForMessage<T = unknown>(ws: WebSocket, timeoutMs = 2000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for WebSocket message after ${String(timeoutMs)}ms`));
    }, timeoutMs);

    ws.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(event.data as string) as T);
        } catch {
          reject(new Error(`Failed to parse WebSocket message: ${String(event.data)}`));
        }
      },
      { once: true },
    );
  });
}

/**
 * Wait for a WebSocket message that satisfies a predicate, discarding any
 * messages that don't match. Prevents flaky tests caused by interleaved
 * event/state messages arriving in unpredictable order.
 */
export function waitForMessageMatching<T = unknown>(
  ws: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler);
      reject(new Error(`Timed out waiting for matching WebSocket message after ${String(timeoutMs)}ms`));
    }, timeoutMs);

    function handler(event: MessageEvent) {
      try {
        const parsed = JSON.parse(event.data as string) as Record<string, unknown>;
        if (predicate(parsed)) {
          clearTimeout(timer);
          ws.removeEventListener("message", handler);
          resolve(parsed as T);
        }
        // Otherwise: discard and keep listening
      } catch {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        reject(new Error(`Failed to parse WebSocket message: ${String(event.data)}`));
      }
    }

    ws.addEventListener("message", handler);
  });
}

// -- Source helpers for tests --------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create a source in D1 linked to a user. Returns sourceUuid and a real source token
 * that will pass authenticateSource().
 */
export async function seedSource(
  userUuid: string | null = null,
): Promise<{ sourceUuid: string; sourceToken: string }> {
  const sourceUuid = crypto.randomUUID();
  const sourceToken = `sct_${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(sourceToken);
  const randomBytes = new Uint32Array(1);
  crypto.getRandomValues(randomBytes);
  const linkCode = String((randomBytes[0]! % 900_000) + 100_000);
  const linkCodeExpiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sources (source_uuid, user_uuid, token_hash, link_code, link_code_expires_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(sourceUuid, userUuid, tokenHash, linkCode, linkCodeExpiresAt)
    .run();
  return { sourceUuid, sourceToken };
}

// -- OAuth token helpers for MCP tests ----------------------------------------

/**
 * Get OAuthHelpers for direct token operations in tests.
 * Uses getOAuthApi() to create helpers that share the same OAUTH_KV as the worker,
 * bypassing the authorize handler entirely (no Clerk needed in tests).
 */
function getTestOAuthHelpers() {
  return getOAuthApi(
    {
      ...OAUTH_ENDPOINTS,
      apiHandler: { fetch: () => Promise.resolve(new Response()) },
      defaultHandler: { fetch: () => Promise.resolve(new Response()) },
    },
    env,
  );
}

async function generatePkce(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCodePoint(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return { codeVerifier, codeChallenge };
}

/**
 * Acquire a valid OAuth access token for MCP requests.
 *
 * Creates a client + authorization code directly in KV via getOAuthApi(),
 * then exchanges the code for a token through the library's /oauth/token endpoint.
 * No Clerk redirect needed — tokens are real library tokens validated identically to production.
 */
export async function getOAuthToken(userUuid: string): Promise<string> {
  const helpers = getTestOAuthHelpers();
  const { codeVerifier, codeChallenge } = await generatePkce();

  const client = await helpers.createClient({
    redirectUris: ["https://test.example.com/callback"],
    clientName: "Test Client",
    tokenEndpointAuthMethod: "none",
  });

  const { redirectTo } = await helpers.completeAuthorization({
    request: {
      responseType: "code",
      clientId: client.clientId,
      redirectUri: "https://test.example.com/callback",
      scope: [],
      state: "test-state",
      codeChallenge,
      codeChallengeMethod: "S256",
    },
    userId: userUuid,
    metadata: {},
    scope: [],
    props: { userUuid } satisfies OAuthProps,
  });

  const code = new URL(redirectTo).searchParams.get("code");
  if (!code) throw new Error("No authorization code in redirect URL");

  const tokenResp = await SELF.fetch("https://test-host/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://test.example.com/callback",
      client_id: client.clientId,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    throw new Error(`Token exchange failed: ${String(tokenResp.status)} ${text}`);
  }

  const tokenData = await tokenResp.json<{ access_token: string }>();
  return tokenData.access_token;
}
