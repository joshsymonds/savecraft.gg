import { getOAuthApi } from "@cloudflare/workers-oauth-provider";
import { env, SELF } from "cloudflare:test";

import { clearToolCaches } from "../src/mcp/tools";
import { OAUTH_ENDPOINTS } from "../src/oauth";
import type { OAuthProps } from "../src/oauth";
import { type DeepPartial, Message, RelayedMessage } from "../src/proto/savecraft/v1/protocol";
import { clearNativeRegistry } from "../src/reference/registry";
import { storePush } from "../src/store";
import type { SectionInput } from "../src/store";

/** D1 tables in FK-safe deletion order (children before parents). */
export const CLEANUP_TABLES = [
  "search_index",
  "notes",
  "sections",
  "source_configs",
  "source_events",
  "mcp_activity",
  "api_keys",
  "linked_characters",
  "game_credentials",
  "saves",
  "sources",
  "mtga_rules_fts",
  "mtga_card_rulings_fts",
  "mtga_rules",
  "mtga_card_rulings",
  "mtga_cards_fts",
  "mtga_cards",
  "mtga_draft_ratings_fts",
  "mtga_draft_color_stats",
  "mtga_draft_ratings",
  "mtga_draft_set_stats",
  "mtga_draft_synergies",
  "mtga_draft_archetype_curves",
  "mtga_card_roles",
  "mtga_draft_role_targets",
  "mtga_draft_calibration",
  "mtga_set_metadata",
] as const;

/**
 * Clean all shared state (D1 + R2) between tests.
 * Delete order: children before parents (FK-safe).
 */
export async function cleanAll(): Promise<void> {
  for (const table of CLEANUP_TABLES) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  for (const bucket of [env.PLUGINS]) {
    const listed = await bucket.list();
    for (const object of listed.objects) {
      await bucket.delete(object.key);
    }
  }
  clearToolCaches();
  clearNativeRegistry();
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

// -- Binary proto WebSocket helpers -------------------------------------------

/**
 * Send a binary proto Message over a WebSocket.
 * Normalizes through fromPartial so callers can use partial object literals
 * without worrying about default values for new fields.
 */
export function sendProto(ws: WebSocket, msg: DeepPartial<Message>): void {
  const normalized = Message.fromPartial(msg);
  const bytes = Message.encode(normalized).finish();
  ws.send(bytes);
}

/**
 * Wait for a binary proto RelayedMessage on a UI WebSocket.
 * Returns the decoded RelayedMessage.
 */
export function waitForRelayedMessage(ws: WebSocket, timeoutMs = 2000): Promise<RelayedMessage> {
  return new Promise<RelayedMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for RelayedMessage after ${String(timeoutMs)}ms`));
    }, timeoutMs);

    ws.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer);
        try {
          const data = event.data as ArrayBuffer;
          resolve(RelayedMessage.decode(new Uint8Array(data)));
        } catch (error) {
          reject(new Error(`Failed to decode RelayedMessage: ${String(error)}`));
        }
      },
      { once: true },
    );
  });
}

/**
 * Wait for a binary proto Message on a daemon WebSocket (for commands from server).
 */
export function waitForProtoMessage(ws: WebSocket, timeoutMs = 2000): Promise<Message> {
  return new Promise<Message>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for proto Message after ${String(timeoutMs)}ms`));
    }, timeoutMs);

    ws.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer);
        try {
          const data = event.data as ArrayBuffer;
          resolve(Message.decode(new Uint8Array(data)));
        } catch (error) {
          reject(new Error(`Failed to decode proto Message: ${String(error)}`));
        }
      },
      { once: true },
    );
  });
}

/**
 * Wait for a RelayedMessage matching a predicate, discarding non-matches.
 */
export function waitForRelayedMessageMatching(
  ws: WebSocket,
  predicate: (msg: RelayedMessage) => boolean,
  timeoutMs = 5000,
): Promise<RelayedMessage> {
  return new Promise<RelayedMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler);
      reject(
        new Error(`Timed out waiting for matching RelayedMessage after ${String(timeoutMs)}ms`),
      );
    }, timeoutMs);

    function handler(event: MessageEvent) {
      try {
        const data = event.data as ArrayBuffer;
        const msg = RelayedMessage.decode(new Uint8Array(data));
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.removeEventListener("message", handler);
          resolve(msg);
        }
      } catch {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        reject(new Error(`Failed to decode RelayedMessage: ${String(event.data)}`));
      }
    }

    ws.addEventListener("message", handler);
  });
}

// -- Payload extraction helpers -----------------------------------------------

/** Union of all valid $case values in Message.payload. */
type PayloadCase = NonNullable<Message["payload"]>["$case"];

/** Extract the specific union variant for a given $case value. */
type PayloadVariant<C extends PayloadCase> = Extract<NonNullable<Message["payload"]>, { $case: C }>;

/** Extract the inner payload type for a given $case value. */
type PayloadValue<C extends PayloadCase> =
  PayloadVariant<C> extends { $case: C } & infer R
    ? R extends Record<C, infer V>
      ? V
      : never
    : never;

/**
 * Type-safe payload extraction from a Message.
 * Narrows the discriminated union by checking $case at runtime and returning
 * the correctly typed inner value. Throws if $case doesn't match.
 */
export function requirePayload<C extends PayloadCase>(msg: Message, $case: C): PayloadValue<C> {
  if (msg.payload?.$case !== $case) {
    throw new Error(`Expected payload $case "${$case}" but got "${String(msg.payload?.$case)}"`);
  }
  // After the $case check, we know the variant matches. TS can't prove the
  // generic key indexing is safe, so we use a controlled assertion here.
  const variant = msg.payload as Record<string, unknown>;
  return variant[$case] as PayloadValue<C>;
}

/**
 * Type-safe payload extraction from a RelayedMessage's inner Message.
 * Shorthand for requirePayload(msg.message!, $case) with null checks.
 */
export function requireInnerPayload<C extends PayloadCase>(
  relayed: RelayedMessage,
  $case: C,
): PayloadValue<C> {
  if (!relayed.message) {
    throw new Error(`RelayedMessage has no inner message`);
  }
  return requirePayload(relayed.message, $case);
}

/**
 * Sends a SourceOnline message and drains the link state notification
 * (sourceLinked or refreshLinkCodeResult) that the server pushes in response.
 * Returns the drained link state message for inspection if needed.
 */
export async function sendSourceOnlineAndDrainLinkState(
  ws: WebSocket,
  version = "0.1.0",
  platform = "",
): Promise<Message> {
  sendProto(ws, {
    payload: {
      $case: "sourceOnline",
      sourceOnline: {
        version,
        timestamp: undefined,
        platform,
        os: "",
        arch: "",
        hostname: "",
        device: "",
      },
    },
  });
  // The server now pushes a link state notification after SourceOnline.
  return waitForProtoMessage(ws);
}

/**
 * Drain queued RelayedMessages from a UI WebSocket with a short timeout.
 * Consumes up to 50 messages, stopping when no message arrives within timeoutMs.
 */
export async function drainRelayedMessages(ws: WebSocket, timeoutMs = 200): Promise<void> {
  for (let index = 0; index < 50; index++) {
    try {
      await waitForRelayedMessage(ws, timeoutMs);
    } catch {
      break;
    }
  }
}

/**
 * Seed a save with sections, search_index, and notes data in D1.
 * Returns the generated save UUID.
 */
export async function seedSaveWithData(
  userUuid: string | null,
  gameId: string,
  saveName: string,
  options?: { sourceUuid?: string },
): Promise<string> {
  const saveUuid = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_source_uuid)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      saveUuid,
      userUuid,
      gameId,
      gameId,
      saveName,
      `${saveName} summary`,
      options?.sourceUuid ?? null,
    )
    .run();

  await env.DB.prepare(
    "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, 'overview', 'Overview', '{}')",
  )
    .bind(saveUuid)
    .run();

  await env.DB.prepare(
    `INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content)
     VALUES (?, ?, 'section', ?, ?, ?)`,
  )
    .bind(saveUuid, saveName, "overview", "Overview", "test content")
    .run();

  return saveUuid;
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

// -- Seed push helper for tests -----------------------------------------------

/**
 * Seed a save directly via storePush (bypasses HTTP, used for test data setup).
 */
export async function seedPush(
  userUuid: string | null,
  sourceUuid: string,
  gameId: string,
  saveName: string,
  summary: string,
  parsedAt: string,
  sections: Record<string, SectionInput>,
): Promise<string> {
  const { saveUuid } = await storePush(
    env,
    userUuid,
    sourceUuid,
    gameId,
    saveName,
    summary,
    parsedAt,
    sections,
  );
  return saveUuid;
}
