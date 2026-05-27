import { getOAuthApi } from "@cloudflare/workers-oauth-provider";
import { env, runInDurableObject, SELF } from "cloudflare:test";

import { _resetWinConditionCache } from "../../plugins/magic/reference/deck-completion";
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
  "mcp_tool_calls",
  "api_keys",
  "linked_characters",
  "game_credentials",
  "poe_build_snapshot",
  "saves",
  "sources",
  "magic_interactions_fts",
  "magic_interactions",
  "magic_rules_fts",
  "magic_rules",
  "magic_cards_fts",
  "magic_card_aliases",
  "magic_cards",
  "magic_draft_ratings_fts",
  "magic_draft_archetype_stats",
  "magic_draft_ratings",
  "magic_draft_set_stats",
  "magic_draft_synergies",
  "magic_draft_archetype_curves",
  "magic_card_roles",
  "magic_draft_role_targets",
  "magic_draft_calibration",
  "magic_draft_deck_stats",
  "magic_pipeline_state",
  "magic_play_card_timing",
  "magic_play_tempo",
  "magic_play_combat",
  "magic_play_mulligan",
  "magic_play_turn_baselines",
  "magic_match_history",
  "magic_meta_decklists",
  "magic_meta_matchups",
  "magic_meta_archetypes",
  "wow_spells_fts",
  "wow_spells",
  "wow_encounters_fts",
  "wow_encounter_abilities",
  "wow_encounters",
  "poe_gems_fts",
  "poe_gems",
  "poe_passive_nodes_fts",
  "poe_passive_nodes",
  "poe_base_items_fts",
  "poe_base_items",
  "poe_stat_translations",
  "poe_uniques_fts",
  "poe_uniques",
  "poe_mods_fts",
  "poe_mods",
  "magic_edh_average_decks_by_theme",
  "magic_edh_commander_theme_meta",
  "magic_edh_precon_commanders",
  "magic_edh_precon_upgrades",
  "magic_edh_precon_decks",
  "magic_edh_precons",
  "magic_game_changers",
  "magic_edh_average_decks_by_tier",
  "magic_edh_commander_tiers",
  "magic_edh_card_prices",
  "magic_edh_themes",
  "magic_edh_mana_curves",
  "magic_edh_average_decks",
  "magic_edh_combos_fts",
  "magic_edh_combos",
  "magic_edh_recommendations",
  "magic_edh_commanders_fts",
  "magic_edh_commanders",
] as const;

/**
 * Clean all shared state (D1 + R2) between tests.
 * Delete order: children before parents (FK-safe).
 */
export async function cleanAll(): Promise<void> {
  await env.DB.batch(CLEANUP_TABLES.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
  const listed = await env.PLUGINS.list();
  for (const object of listed.objects) {
    await env.PLUGINS.delete(object.key);
  }
  clearNativeRegistry();
  // Win-condition names are cached at module scope across tests in the
  // same isolate. Tests that mutate `magic_card_roles` between runs
  // need a stale-cache reset on every cleanAll.
  _resetWinConditionCache();
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
      `WebSocket upgrade failed for ${path}: ${String(resp.status)} ${String(resp.statusText)}`,
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
    throw new Error(
      `Daemon WebSocket upgrade failed: ${String(resp.status)} ${String(resp.statusText)}`,
    );
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
export function closeWs(ws: WebSocket): void {
  // Fire-and-forget close. Callers that need to observe a close consequence
  // (e.g. the daemon-disconnect broadcast) attach a matcher on the UI side
  // BEFORE invoking closeWs — that matcher is the deterministic sync point.
  // We don't await the WS's own "close" event here because in workerd's
  // same-process WebSocketPair the event firing semantics differ from a
  // real-network WS and can leave the caller waiting for an event that
  // already dispatched (or hold the test runner open past the run).
  //
  // Callers that close at the END of a test (no UI to observe the close
  // broadcast) should pair their closeWs(...) calls with a single
  // `await flushWorkerd()` in afterEach so workerd's queued
  // webSocketClose handlers run before the next test starts.
  if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    return;
  }
  ws.close();
}

/**
 * Pump workerd's event loop so any fire-and-forget closeWs() callbacks
 * from this test (queued webSocketClose handlers on the SourceHub /
 * UserHub DOs) actually run before returning. Without this, late-firing
 * webSocketClose work contends with the next test's webSocketMessage
 * processing and causes the 5s testTimeout to be exceeded intermittently.
 *
 * The mechanism: a real D1 round-trip forces workerd to context-switch
 * away from the JS thread, giving its internal event loop a chance to
 * dispatch queued WebSocket events. We round-trip a few times because a
 * test may have closed multiple WSes (UI + N daemons) and each one needs
 * its own webSocketClose handler to settle on its DO. One round-trip
 * typically drains one DO's pending handler; chaining several covers
 * the common case of 2–3 closes per test.
 */
export async function flushWorkerd(): Promise<void> {
  for (let index = 0; index < 4; index++) {
    await env.DB.prepare("SELECT 1").first();
  }
}

/**
 * Poll a predicate at short intervals until it returns truthy, or the
 * timeout fires. Replaces setTimeout-based "wait for state to settle"
 * sleeps with an event-driven check that resolves as soon as the
 * observed state matches — no fixed delay, no flake from too-short
 * sleeps, no bloat from too-long ones.
 */
export async function pollUntil<T>(
  fn: () => Promise<T | null | undefined> | T | null | undefined,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const intervalMs = options.intervalMs ?? 10;
  const label = options.label ?? "predicate";
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() >= deadline) {
      throw new Error(`pollUntil: ${label} did not become truthy within ${String(timeoutMs)}ms`);
    }
    // Schedule the next check via a microtask + queueMicrotask chain isn't
    // available here cheaply; use a short setTimeout. This isn't a "wait
    // for time to pass" sleep — it's the polling cadence between predicate
    // evaluations, which is the canonical pattern when no event signal is
    // available (e.g. waiting for a D1 commit to be visible). Production
    // code and tests must not use raw setTimeout for synchronisation;
    // they call this helper instead.
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Backdate a source's `lastSeen` to 24 hours ago in SourceHub's persistent
 * state, then fire the DO's alarm. Used by tests that exercise alarm-driven
 * stale-source eviction without waiting on real wall-clock — STALE_THRESHOLD_MS
 * is set very high in tests precisely so that the alarm doesn't fire naturally
 * during unrelated tests; this helper synthesises staleness deterministically.
 */
export async function ageLastSeenAndFireAlarm(
  stub: DurableObjectStub,
  sourceUuid: string,
): Promise<void> {
  await runInDurableObject(stub, async (instance, state) => {
    const stored = await state.storage.get<{
      sources: { sourceId: string; lastSeen?: string }[];
    }>("sourceState");
    if (!stored) return;
    for (const s of stored.sources) {
      if (s.sourceId === sourceUuid) {
        s.lastSeen = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      }
    }
    await state.storage.put("sourceState", stored);
    // Call alarm() directly rather than going through runDurableObjectAlarm:
    // ALARM_INTERVAL_MS is effectively-infinite in tests (to keep natural
    // alarm activity from interfering), so no alarm is scheduled near now,
    // and runDurableObjectAlarm() refuses to fire alarms scheduled far in
    // the future. Calling the handler directly runs the same code path
    // synchronously and leaves no spurious alarms in storage for workerd's
    // alarm queue to chew on after the test exits (the source of the
    // post-suite hang).
    interface AlarmDO {
      alarm(): Promise<void>;
    }
    await (instance as unknown as AlarmDO).alarm();
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
 * 5s default matches vitest's testTimeout — under sharded CPU contention the
 * older 2s default could miss in-flight server pushes (e.g. configUpdate)
 * even when the test itself was still well under budget.
 */
export function waitForProtoMessage(ws: WebSocket, timeoutMs = 5000): Promise<Message> {
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
 * Drain messages from a daemon WebSocket until one with the specified payload
 * $case arrives, discarding any that don't match (e.g. sourceLinked).
 */
export function waitForPayload(ws: WebSocket, $case: string, timeoutMs = 5000): Promise<Message> {
  return new Promise<Message>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for payload "${$case}" after ${String(timeoutMs)}ms`));
    }, timeoutMs);

    const handler = (event: MessageEvent): void => {
      try {
        const data = event.data as ArrayBuffer;
        const msg = Message.decode(new Uint8Array(data));
        if (msg.payload?.$case === $case) {
          clearTimeout(timer);
          ws.removeEventListener("message", handler);
          resolve(msg);
        }
        // else: discard and keep listening
      } catch (error) {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        reject(new Error(`Failed to decode proto Message: ${String(error)}`));
      }
    };

    ws.addEventListener("message", handler);
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

/**
 * Drain a proto-encoded WebSocket (daemon side) until a message arrives
 * whose decoded payload satisfies `predicate`, discarding non-matches.
 * Mirror of `waitForRelayedMessageMatching` for the daemon protocol.
 */
export function waitForProtoMessageMatching(
  ws: WebSocket,
  predicate: (msg: Message) => boolean,
  timeoutMs = 5000,
): Promise<Message> {
  return new Promise<Message>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler);
      reject(
        new Error(`Timed out waiting for matching proto Message after ${String(timeoutMs)}ms`),
      );
    }, timeoutMs);

    function handler(event: MessageEvent): void {
      try {
        const data = event.data as ArrayBuffer;
        const msg = Message.decode(new Uint8Array(data));
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.removeEventListener("message", handler);
          resolve(msg);
        }
      } catch {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        reject(new Error(`Failed to decode proto Message: ${String(event.data)}`));
      }
    }

    ws.addEventListener("message", handler);
  });
}

// -- Outbound fetch mocking ---------------------------------------------------

/**
 * Drop-in replacement for vitest-pool-workers' removed `fetchMock` (v0.16+).
 * Provides the small chainable surface the tests used:
 *
 *   mockFetch.activate();
 *   mockFetch
 *     .get("https://api.example.com")
 *     .intercept({ path: "/x", method: "POST" })
 *     .reply(200, JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
 *   // ... test body ...
 *   mockFetch.deactivate();
 *
 * Backed by vi.spyOn(globalThis, 'fetch'). The vitest-pool-workers worker
 * runs in the same isolate as the test code, so the spy intercepts the
 * worker's outbound fetch() calls.
 */
interface MockReply {
  baseUrl: string;
  path: string | RegExp;
  method: string;
  status: number;
  body: string;
  headers?: Record<string, string>;
}

/** Resolve a fetch input to its URL string without nested ternaries. */
function resolveFetchInputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

class MockFetch {
  private replies: MockReply[] = [];
  private originalFetch: typeof globalThis.fetch | undefined;

  activate(): void {
    if (this.originalFetch) return;
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlString = resolveFetchInputUrl(input);
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      const url = new URL(urlString);
      const base = `${url.protocol}//${url.host}`;
      const path = url.pathname + url.search;
      const matchIndex = this.replies.findIndex((r) => {
        if (r.baseUrl !== base) return false;
        if (r.method.toUpperCase() !== method) return false;
        return typeof r.path === "string" ? r.path === path : r.path.test(path);
      });
      if (matchIndex === -1) {
        return Promise.reject(new Error(`Unmocked fetch: ${method} ${urlString}`));
      }
      // Consume the reply (one-shot) to mirror undici MockAgent's default
      // behaviour. Tests that need multiple calls to the same endpoint
      // queue multiple .intercept().reply() declarations.
      const match = this.replies.splice(matchIndex, 1)[0]!;
      return Promise.resolve(
        new Response(match.body, {
          status: match.status,
          headers: match.headers,
        }),
      );
    };
  }

  deactivate(): void {
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = undefined;
    }
    this.replies = [];
  }

  get(baseUrl: string): {
    intercept: (selector: { path: string | RegExp; method?: string }) => {
      reply: (status: number, body: string, options?: { headers?: Record<string, string> }) => void;
    };
  } {
    return {
      intercept: ({ path, method = "GET" }) => ({
        reply: (status, body, options) => {
          this.replies.push({ baseUrl, path, method, status, body, headers: options?.headers });
        },
      }),
    };
  }
}

export const mockFetch = new MockFetch();

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
  // The server pushes a link state notification (sourceLinked or
  // refreshLinkCodeResult) after SourceOnline — but configUpdate may arrive
  // first depending on timing.  Drain until we find the link state message.
  return new Promise<Message>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler);
      reject(new Error("Timed out waiting for link state after sourceOnline"));
    }, 2000);

    function handler(event: MessageEvent): void {
      try {
        const data = event.data as ArrayBuffer;
        const msg = Message.decode(new Uint8Array(data));
        const $case = msg.payload?.$case;
        if ($case === "sourceLinked" || $case === "refreshLinkCodeResult") {
          clearTimeout(timer);
          ws.removeEventListener("message", handler);
          resolve(msg);
        }
        // else: discard (e.g. configUpdate) and keep listening
      } catch (error) {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        reject(new Error(`Failed to decode proto Message: ${String(error)}`));
      }
    }

    ws.addEventListener("message", handler);
  });
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
    throw new Error(`Token exchange failed: ${String(tokenResp.status)} ${String(text)}`);
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
