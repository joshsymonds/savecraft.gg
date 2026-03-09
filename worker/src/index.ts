import { ADAPTER_REFRESH_COOLDOWN_SEC, AdapterError, type ApiAdapter } from "./adapters/adapter";
import { discoverAndReconcileSaves } from "./adapters/discover";
import { adapters } from "./adapters/registry";
import { resolveCharacterContext } from "./adapters/resolve-character";
import { handleAdminRoute } from "./admin";
import { authenticateSession, authenticateSource, sha256Hex } from "./auth";
import { indexNote, removeNoteFromIndex } from "./mcp/tools";
import { buildOAuthProvider, handleAuthorize, handleCallback } from "./oauth";
import { Message } from "./proto/savecraft/v1/protocol";
import { reapOrphanSources } from "./reaper";
import { reconcileOrphanSaves, storePush } from "./store";
import type { Env } from "./types";

export { SourceHub } from "./hub";
export { UserHub } from "./user-hub";

function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const allowList = env.ALLOWED_ORIGINS;
  if (!allowList) return "*"; // dev fallback

  const allowed = allowList.split(",").map((s) => s.trim());
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function corsify(response: Response, request: Request, env: Env): Response {
  if (response.status === 101) return response;

  const origin = getAllowedOrigin(request, env);
  if (!origin) return response;

  const patched = new Response(response.body, response);
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    patched.headers.set(key, value);
  }
  return patched;
}

function validateId(id: string | undefined): id is string {
  if (!id?.trim()) return false;
  if (id.length > 256) return false;
  if (id.includes("..") || id.includes("/")) return false;
  return true;
}

/** Returns true when the request targets a dedicated MCP subdomain. */
function isMcpHost(url: URL, env: Env): boolean {
  return !!env.MCP_HOSTNAME && url.hostname === env.MCP_HOSTNAME;
}

/**
 * Serve an HTML page for browser GET requests to the MCP endpoint.
 * Browsers land here when users paste the connector URL into their address bar.
 * Includes OG meta tags (for link preview unfurlers) and a redirect to /connect.
 */
function escapeHtml(s: string): string {
  return s.replaceAll(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function serveMcpBrowserPage(env: Env): Response {
  const webUrl = env.WEB_URL ?? "https://my.savecraft.gg";
  const connectUrl = escapeHtml(`${webUrl}/connect`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Savecraft Connector</title>
  <meta property="og:title" content="Savecraft — Game Save Connector for AI">
  <meta property="og:description" content="This URL connects your game saves to AI assistants like Claude and ChatGPT. Add it in your AI app's settings — not in the chat.">
  <meta property="og:url" content="${connectUrl}">
  <meta property="og:type" content="website">
  <meta http-equiv="refresh" content="0;url=${connectUrl}">
</head>
<body>
  <p>Redirecting to <a href="${connectUrl}">Savecraft setup instructions</a>&hellip;</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/**
 * Non-MCP, non-OAuth request handler.
 * Called by the library's defaultHandler for all routes it doesn't own.
 */
async function handleNonMcpRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    const origin = getAllowedOrigin(request, env);
    if (!origin) return new Response(null, { status: 204 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  const url = new URL(request.url);
  const response =
    (await handleAdminRoute(request, url, env)) ??
    (await routePublicEndpoints(request, url, env)) ??
    (await routeBattlenetOAuth(request, url, env)) ??
    (await routeDaemonEndpoints(request, url, env)) ??
    (await routeProtectedEndpoints(request, url, env));
  const final = corsify(response, request, env);
  if (final.status !== 101) {
    final.headers.set("X-Savecraft-Version", env.VERSION ?? "dev");
  }
  return final;
}

/**
 * The OAuthProvider wraps the entire Worker.
 *
 * - /mcp: library validates token from KV, passes props.userUuid to MCP handler
 * - /.well-known/*, /oauth/register, /oauth/token: library handles natively
 * - /oauth/authorize, /oauth/callback: defaultHandler delegates to Clerk
 * - Everything else: defaultHandler delegates to handleNonMcpRequest
 */
const oauthProvider = buildOAuthProvider({
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/oauth/authorize") {
      return handleAuthorize(request, env);
    }
    if (url.pathname === "/oauth/callback") {
      return handleCallback(request, env);
    }

    return handleNonMcpRequest(request, env);
  },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const mcpHost = isMcpHost(url, env);

    // Serve protected resource metadata with trailing-slash resource URL.
    // The library generates resource from url.origin (no trailing slash), but
    // MCP clients send resource=https://host/ (with slash) in authorize requests.
    // RFC 8707 uses exact string comparison — mismatch causes Claude Desktop to
    // silently discard the token after a successful OAuth flow.
    if (url.pathname === "/.well-known/oauth-protected-resource") {
      return Response.json({
        resource: `${url.origin}/`,
        authorization_servers: [url.origin],
        bearer_methods_supported: ["header"],
        resource_name: "Savecraft MCP Server",
      });
    }

    // Rewrite MCP subdomain root to /mcp so the library's apiRoute matches
    if (mcpHost && url.pathname === "/") {
      const rewritten = new URL(request.url);
      rewritten.pathname = "/mcp";
      request = new Request(rewritten.toString(), request);
    }

    // Browser GET to MCP subdomain: return help page with OG tags + redirect to /connect.
    // MCP clients always POST with JSON — browsers send GET with Accept: text/html.
    // Only intercept on the dedicated MCP subdomain, not /mcp on the API host.
    if (
      mcpHost &&
      request.method === "GET" &&
      request.headers.get("Accept")?.includes("text/html")
    ) {
      return serveMcpBrowserPage(env);
    }

    return oauthProvider.fetch(request, env, ctx);
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await reapOrphanSources(env);
  },
} satisfies ExportedHandler<Env>;

const PLUGIN_DOWNLOAD_RE =
  /^\/plugins\/([^/]+)\/((parser|reference)\.wasm(?:\.sig)?|icon\.(svg|png))$/;

function routeDownload(request: Request, url: URL, env: Env): Promise<Response> | null {
  const pluginMatch = PLUGIN_DOWNLOAD_RE.exec(url.pathname);
  if (pluginMatch?.[1] && pluginMatch[2] && request.method === "GET") {
    return handlePluginDownload(env, pluginMatch[1], pluginMatch[2]);
  }
  return null;
}

async function routePublicEndpoints(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (url.pathname === "/health") return Response.json({ status: "ok" });
  if (url.pathname === "/api/v1/plugins/manifest" && request.method === "GET") {
    return handlePluginManifest(env);
  }
  const downloadResponse = routeDownload(request, url, env);
  if (downloadResponse) return downloadResponse;
  const referenceMatch = /^\/api\/v1\/reference\/([^/]+)\/query$/.exec(url.pathname);
  if (referenceMatch?.[1] && request.method === "POST") {
    return handleReferenceQuery(request, env, referenceMatch[1]);
  }
  if (url.pathname === "/api/v1/source/verify" && request.method === "GET") {
    return handleSourceVerify(request, env);
  }
  return null;
}

// -- Battle.net OAuth routes --------------------------------------------------

async function routeBattlenetOAuth(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (request.method !== "GET") return null;

  if (url.pathname === "/oauth/battlenet/authorize") {
    // Session-protected: user must be logged in
    const auth = await authenticateSession(request, env);
    if (!auth) return new Response("Unauthorized", { status: 401 });
    return handleBattlenetAuthorize(url, env, auth.userUuid);
  }

  if (url.pathname === "/oauth/battlenet/callback") {
    return handleBattlenetCallback(url, env);
  }

  return null;
}

function validateReturnUrl(raw: string, env: Env, fallbackOrigin: string): string {
  if (!raw) return "";
  try {
    const webOrigin = env.WEB_URL ?? fallbackOrigin;
    const parsed = new URL(raw, webOrigin);
    if (parsed.origin !== new URL(webOrigin).origin) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

async function handleBattlenetAuthorize(url: URL, env: Env, userUuid: string): Promise<Response> {
  const region = url.searchParams.get("region") ?? "us";
  const returnUrl = validateReturnUrl(url.searchParams.get("return_url") ?? "", env, url.origin);
  const adapter = adapters.wow;
  if (!adapter) {
    return Response.json({ error: "WoW adapter not configured" }, { status: 500 });
  }

  const oauthConfig = adapter.getOAuthConfig(region, env);

  // Create adapter source immediately — the user requested this game
  const sourceUuid = await findOrCreateAdapterSource(env, userUuid);

  // Log oauthStarted event and push initial game state to SourceHub in parallel
  await Promise.all([
    logSourceEvent(env, sourceUuid, "oauthStarted", {
      oauthStarted: { gameId: adapter.gameId, region, provider: "battlenet" },
    }),
    pushGameStatus(env, sourceUuid, userUuid, adapter.gameId, adapter.gameName, "watching"),
  ]);

  // Store state in KV (one-time use, 10 min TTL)
  const stateKey = crypto.randomUUID();
  await env.OAUTH_KV.put(
    `battlenet-oauth-state:${stateKey}`,
    JSON.stringify({ userUuid, region, returnUrl, sourceUuid }),
    { expirationTtl: 600 },
  );

  // Build Battle.net authorize URL
  const authorizeUrl = new URL(oauthConfig.authorizeUrl);
  authorizeUrl.searchParams.set("client_id", oauthConfig.clientId);
  authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/oauth/battlenet/callback`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", oauthConfig.scopes.join(" "));
  authorizeUrl.searchParams.set("state", stateKey);

  return Response.json({ url: authorizeUrl.toString() });
}

interface BattlenetTokenResult {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: string | null;
}

async function exchangeBattlenetToken(
  code: string,
  redirectUri: string,
  oauthConfig: { readonly tokenUrl: string; readonly clientId: string },
  env: Env,
): Promise<BattlenetTokenResult | Response> {
  const tokenResp = await fetch(oauthConfig.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: oauthConfig.clientId,
      client_secret: env.BATTLENET_CLIENT_SECRET ?? "",
    }),
  });

  if (!tokenResp.ok) {
    return Response.json({ error: "Failed to exchange code with Battle.net" }, { status: 502 });
  }

  const tokenData = await tokenResp.json<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  }>();

  if (!tokenData.access_token) {
    return Response.json(
      { error: "Battle.net token response missing access_token" },
      { status: 502 },
    );
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    expiresAt,
  };
}

function errorRedirect(redirectUrl: URL, gameId: string, error: string, detail: string): Response {
  redirectUrl.searchParams.set("game_id", gameId);
  redirectUrl.searchParams.set("error", error);
  redirectUrl.searchParams.set("error_detail", detail.slice(0, 200));
  return new Response(null, { status: 302, headers: { Location: redirectUrl.toString() } });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Push adapter game state to SourceHub DO. */
async function pushGameStatus(
  env: Env,
  sourceUuid: string,
  userUuid: string,
  gameId: string,
  gameName: string,
  status: "watching" | "error",
): Promise<void> {
  const doId = env.SOURCE_HUB.idFromName(sourceUuid);
  const stub = env.SOURCE_HUB.get(doId);
  await stub.fetch(
    new Request("https://do/set-game-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Source-UUID": sourceUuid,
        "X-User-UUID": userUuid,
      },
      body: JSON.stringify({ gameId, gameName, status }),
    }),
  );
}

interface OAuthCallbackState {
  userUuid: string;
  region: string;
  returnUrl: string;
  sourceUuid: string;
}

async function handleTokenFailure(
  state: OAuthCallbackState,
  adapter: { gameId: string; gameName: string },
  eventData: Record<string, unknown>,
  env: Env,
): Promise<void> {
  await Promise.all([
    logSourceEvent(env, state.sourceUuid, "oauthTokenFailed", { oauthTokenFailed: eventData }),
    pushGameStatus(
      env,
      state.sourceUuid,
      state.userUuid,
      adapter.gameId,
      adapter.gameName,
      "error",
    ),
  ]);
}

async function exchangeAndStoreToken(
  code: string,
  stateKey: string,
  state: OAuthCallbackState,
  adapter: (typeof adapters)["wow"],
  redirectUrl: URL,
  url: URL,
  env: Env,
): Promise<BattlenetTokenResult | Response> {
  const oauthConfig = adapter.getOAuthConfig(state.region, env);
  const redirectUri = `${url.origin}/oauth/battlenet/callback`;

  // Delete consumed state and exchange token in parallel
  let tokenResult: BattlenetTokenResult | Response;
  try {
    const [, exchangeResult] = await Promise.all([
      env.OAUTH_KV.delete(`battlenet-oauth-state:${stateKey}`),
      exchangeBattlenetToken(code, redirectUri, oauthConfig, env),
    ]);
    tokenResult = exchangeResult;
  } catch (error: unknown) {
    await handleTokenFailure(
      state,
      adapter,
      { gameId: adapter.gameId, region: state.region, error: toErrorMessage(error) },
      env,
    );
    return errorRedirect(
      redirectUrl,
      adapter.gameId,
      "token_failed",
      "Failed to exchange authorization code",
    );
  }

  if (tokenResult instanceof Response) {
    await handleTokenFailure(
      state,
      adapter,
      { gameId: adapter.gameId, region: state.region, status: tokenResult.status },
      env,
    );
    return errorRedirect(
      redirectUrl,
      adapter.gameId,
      "token_failed",
      "Failed to exchange code with Battle.net",
    );
  }

  // Log token exchange and store credentials in parallel
  await Promise.all([
    logSourceEvent(env, state.sourceUuid, "oauthTokenExchanged", {
      oauthTokenExchanged: { gameId: adapter.gameId, region: state.region },
    }),
    env.DB.prepare(
      `INSERT INTO game_credentials (user_uuid, game_id, access_token, refresh_token, expires_at)
       VALUES (?, 'wow', ?, ?, ?)
       ON CONFLICT(user_uuid, game_id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         updated_at = datetime('now')`,
    )
      .bind(
        state.userUuid,
        tokenResult.accessToken,
        tokenResult.refreshToken,
        tokenResult.expiresAt,
      )
      .run(),
  ]);

  return tokenResult;
}

async function handleBattlenetCallback(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get("code");
  const stateKey = url.searchParams.get("state");
  if (!code || !stateKey) {
    return Response.json({ error: "Missing code or state" }, { status: 400 });
  }

  const storedRaw = await env.OAUTH_KV.get(`battlenet-oauth-state:${stateKey}`);
  if (!storedRaw) {
    return Response.json({ error: "Invalid or expired state" }, { status: 400 });
  }
  const state = JSON.parse(storedRaw) as OAuthCallbackState;

  const adapter = adapters.wow;
  if (!adapter) {
    return Response.json({ error: "WoW adapter not configured" }, { status: 500 });
  }

  const webUrl = env.WEB_URL ?? url.origin;
  const validatedReturn = validateReturnUrl(state.returnUrl, env, url.origin);
  const redirectUrl = new URL(validatedReturn || `${webUrl}/`);

  const tokenResult = await exchangeAndStoreToken(
    code,
    stateKey,
    state,
    adapter,
    redirectUrl,
    url,
    env,
  );
  if (tokenResult instanceof Response) return tokenResult;

  // Discover saves and reconcile into D1
  try {
    const reconcileResult = await discoverAndReconcileSaves(
      adapter,
      env,
      tokenResult.accessToken,
      state.region,
      state.userUuid,
      state.sourceUuid,
    );

    await logSourceEvent(env, state.sourceUuid, "characterDiscovery", {
      characterDiscovery: {
        gameId: adapter.gameId,
        region: state.region,
        added: reconcileResult.added.length,
        renamed: reconcileResult.renamed.length,
        deactivated: reconcileResult.deactivated.length,
        reactivated: reconcileResult.reactivated.length,
      },
    });
  } catch (error: unknown) {
    await Promise.all([
      logSourceEvent(env, state.sourceUuid, "characterDiscoveryFailed", {
        characterDiscoveryFailed: {
          gameId: adapter.gameId,
          region: state.region,
          error: toErrorMessage(error),
        },
      }),
      pushGameStatus(
        env,
        state.sourceUuid,
        state.userUuid,
        adapter.gameId,
        adapter.gameName,
        "error",
      ),
    ]);
    redirectUrl.searchParams.set("connected", "true");
    return errorRedirect(
      redirectUrl,
      adapter.gameId,
      "discovery_failed",
      "Failed to discover game characters",
    );
  }

  redirectUrl.searchParams.set("game_id", adapter.gameId);
  redirectUrl.searchParams.set("connected", "true");

  return new Response(null, { status: 302, headers: { Location: redirectUrl.toString() } });
}

async function routeDaemonEndpoints(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (url.pathname === "/api/v1/verify" && request.method === "GET") {
    const auth = await authenticateSource(request, env);
    if (!auth) return new Response("Unauthorized", { status: 401 });
    return Response.json({ status: "ok" });
  }

  return null;
}

async function routeProtectedEndpoints(request: Request, url: URL, env: Env): Promise<Response> {
  return (
    (await routeWebSocketEndpoints(request, url, env)) ??
    (await routeApiEndpoints(request, url, env)) ??
    new Response("Not Found", { status: 404 })
  );
}

async function routeWebSocketEndpoints(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (url.pathname === "/ws/daemon") {
    const auth = await authenticateSource(request, env);
    if (!auth) return new Response("Unauthorized", { status: 401 });
    const id = env.SOURCE_HUB.idFromName(auth.sourceUuid);
    const headers = new Headers(request.headers);
    headers.set("X-Source-UUID", auth.sourceUuid);
    if (auth.userUuid) headers.set("X-User-UUID", auth.userUuid);
    return env.SOURCE_HUB.get(id).fetch(new Request(request, { headers }));
  }
  if (url.pathname === "/ws/register") {
    // Unauthenticated — new sources register here before they have tokens
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    return handleWsRegister(request, env);
  }
  if (url.pathname === "/ws/ui") {
    const auth = await authenticateSession(request, env);
    if (!auth) return new Response("Unauthorized", { status: 401 });
    const id = env.USER_HUB.idFromName(auth.userUuid);
    const headers = new Headers(request.headers);
    headers.set("X-User-UUID", auth.userUuid);
    return env.USER_HUB.get(id).fetch(new Request(request, { headers }));
  }
  return null;
}

async function routeApiEndpoints(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/v1/")) return null;

  const auth = await authenticateSession(request, env);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  if (url.pathname === "/api/v1/source/link" && request.method === "POST") {
    return handleSourceLink(request, env, auth.userUuid);
  }
  if (url.pathname === "/api/v1/api-keys" || url.pathname.startsWith("/api/v1/api-keys/")) {
    return handleApiKeys(request, url, env, auth.userUuid);
  }
  if (url.pathname.startsWith("/api/v1/sources/")) {
    const sourceResp = routeSourceManagement(request, url, env, auth.userUuid);
    if (sourceResp) return sourceResp;
  }
  if (url.pathname.startsWith("/api/v1/games/") && request.method === "DELETE") {
    const gameId = url.pathname.split("/")[4];
    if (!validateId(gameId)) {
      return Response.json({ error: "Invalid game_id" }, { status: 400 });
    }
    return handleDeleteGame(env, auth.userUuid, gameId);
  }
  if (url.pathname.startsWith("/api/v1/notes/")) {
    return handleNotes(request, url, env, auth.userUuid);
  }
  if (url.pathname.startsWith("/api/v1/adapters/") && request.method === "POST") {
    return handleAdapterRoute(url, env, auth.userUuid);
  }

  return routeReadEndpoints(request, url, env, auth.userUuid);
}

function routeSourceManagement(
  request: Request,
  url: URL,
  env: Env,
  userUuid: string,
): Response | Promise<Response> | null {
  const sourceParts = url.pathname.split("/");
  // /api/v1/sources/{sourceId}/config/{gameId} — PATCH per-game config
  if (sourceParts[5] === "config" && sourceParts[6] && request.method === "PATCH") {
    const sourceId = sourceParts[4];
    const gameId = sourceParts[6];
    if (!validateId(sourceId) || !validateId(gameId)) {
      return Response.json({ error: "Invalid source_uuid or game_id" }, { status: 400 });
    }
    return handlePatchGameConfig(request, env, userUuid, sourceId, gameId);
  }
  if (url.pathname.endsWith("/config")) {
    return handleSourceConfig(request, url, env, userUuid);
  }
  if (request.method === "DELETE") {
    const sourceUuid = sourceParts[4];
    if (!validateId(sourceUuid)) {
      return Response.json({ error: "Invalid source_uuid" }, { status: 400 });
    }
    return handleDeleteSource(env, userUuid, sourceUuid);
  }
  return null;
}

function routeReadEndpoints(
  request: Request,
  url: URL,
  env: Env,
  userUuid: string,
): Promise<Response | null> {
  if (url.pathname === "/api/v1/saves" && request.method === "GET") {
    return handleListSaves(env, userUuid);
  }
  if (url.pathname.startsWith("/api/v1/saves/") && request.method === "GET") {
    const saveId = url.pathname.replace("/api/v1/saves/", "");
    if (!validateId(saveId)) {
      return Promise.resolve(Response.json({ error: "Invalid save_id" }, { status: 400 }));
    }
    return handleGetSave(env, userUuid, saveId);
  }
  if (url.pathname === "/api/v1/mcp-status" && request.method === "GET") {
    return handleMcpStatus(env, userUuid);
  }
  return Promise.resolve(null);
}

// -- Adapter Routes ------------------------------------------------

async function handleAdapterRoute(url: URL, env: Env, userUuid: string): Promise<Response> {
  // POST /api/v1/adapters/{gameId}/{action}[/{param}]
  const parts = url.pathname.split("/");
  const gameId = parts[4];
  const action = parts[5];
  const saveUuid = parts[6];

  if (!validateId(gameId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const adapter = adapters[gameId];
  if (!adapter) {
    return Response.json({ error: `No adapter for game: ${gameId}` }, { status: 404 });
  }

  if (action !== "refresh" || !validateId(saveUuid)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return handleAdapterRefresh(env, adapter, userUuid, gameId, saveUuid);
}

interface AdapterSaveRow {
  readonly uuid: string;
  readonly save_name: string;
  readonly last_updated: string | null;
  readonly last_source_uuid: string | null;
  readonly source_kind: string;
  readonly source_uuid: string;
}

async function lookupAdapterSave(
  env: Env,
  saveUuid: string,
  userUuid: string,
  gameId: string,
): Promise<AdapterSaveRow | Response> {
  const save = await env.DB.prepare(
    `SELECT s.uuid, s.save_name, s.last_updated, s.last_source_uuid,
            src.source_kind, src.source_uuid
     FROM saves s
     JOIN sources src ON src.source_uuid = s.last_source_uuid
     WHERE s.uuid = ? AND s.user_uuid = ? AND s.game_id = ?`,
  )
    .bind(saveUuid, userUuid, gameId)
    .first<AdapterSaveRow>();

  if (!save) {
    return Response.json({ error: "Save not found" }, { status: 404 });
  }
  if (save.source_kind !== "adapter") {
    return Response.json({ error: "Save is not adapter-backed" }, { status: 400 });
  }

  return save;
}

function checkRefreshCooldown(lastUpdated: string | null): Response | null {
  if (!lastUpdated) return null;

  const lastUpdatedMs = new Date(lastUpdated).getTime();
  const cooldownMs = ADAPTER_REFRESH_COOLDOWN_SEC * 1000;
  const now = Date.now();
  if (now - lastUpdatedMs < cooldownMs) {
    const retryAfter = Math.ceil((cooldownMs - (now - lastUpdatedMs)) / 1000);
    return Response.json(
      {
        error: "Too many refreshes. Try again later.",
        retry_after: retryAfter,
      },
      { status: 429 },
    );
  }

  return null;
}

function adapterErrorToStatus(code: string): number {
  if (code === "token_expired") return 401;
  if (code === "rate_limited") return 429;
  if (code === "character_not_found") return 404;
  return 502;
}

interface LinkedCharRow {
  readonly character_id: string;
  readonly character_name: string;
  readonly metadata: string | null;
}

async function lookupRefreshContext(
  env: Env,
  userUuid: string,
  gameId: string,
  save: AdapterSaveRow,
): Promise<{ realmSlug: string; region: string; characterName: string } | Response> {
  const linkedChar = await env.DB.prepare(
    `SELECT character_id, character_name, metadata
     FROM linked_characters
     WHERE user_uuid = ? AND game_id = ? AND source_uuid = ? AND active = 1
     AND character_name = ?`,
  )
    // WoW-specific: save_name format is "Name-realm-REGION", character_name is the first segment.
    // Future adapters with different naming conventions will need their own lookup logic.
    .bind(userUuid, gameId, save.source_uuid, save.save_name.split("-")[0] ?? "")
    .first<LinkedCharRow>();

  const ctx = resolveCharacterContext(linkedChar, save.save_name);

  if (!ctx.realmSlug) {
    return Response.json({ error: "Cannot determine character realm" }, { status: 400 });
  }

  return ctx;
}

async function lookupGameCredentials(
  env: Env,
  userUuid: string,
  gameId: string,
): Promise<{
  accessToken: string;
  refreshToken: string | undefined;
  expiresAt: string | undefined;
}> {
  const creds = await env.DB.prepare(
    "SELECT access_token, refresh_token, expires_at FROM game_credentials WHERE user_uuid = ? AND game_id = ?",
  )
    .bind(userUuid, gameId)
    .first<{
      access_token: string;
      refresh_token: string | null;
      expires_at: string | null;
    }>();

  return {
    accessToken: creds?.access_token ?? "",
    refreshToken: creds?.refresh_token ?? undefined,
    expiresAt: creds?.expires_at ?? undefined,
  };
}

async function handleAdapterRefresh(
  env: Env,
  adapter: ApiAdapter,
  userUuid: string,
  gameId: string,
  saveUuid: string,
): Promise<Response> {
  const saveResult = await lookupAdapterSave(env, saveUuid, userUuid, gameId);
  if (saveResult instanceof Response) return saveResult;

  const cooldownResp = checkRefreshCooldown(saveResult.last_updated);
  if (cooldownResp) return cooldownResp;

  const ctxResult = await lookupRefreshContext(env, userUuid, gameId, saveResult);
  if (ctxResult instanceof Response) return ctxResult;

  const credentials = await lookupGameCredentials(env, userUuid, gameId);

  try {
    const gameState = await adapter.fetchState(
      {
        characterId: `${ctxResult.realmSlug}/${ctxResult.characterName}`,
        region: ctxResult.region,
        credentials,
      },
      env,
    );

    const parsedAt = new Date().toISOString();

    const result = await storePush(
      env,
      userUuid,
      saveResult.source_uuid,
      gameId,
      gameState.identity.saveName,
      gameState.summary,
      parsedAt,
      gameState.sections,
    );

    return Response.json(
      {
        save_uuid: result.saveUuid,
        snapshot_timestamp: parsedAt,
        summary: gameState.summary,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AdapterError) {
      return Response.json(
        {
          error: error.message,
          code: error.code,
          retry_after: error.retryAfter,
          user_action: error.userAction,
        },
        { status: adapterErrorToStatus(error.code) },
      );
    }
    throw error;
  }
}

async function findOrCreateAdapterSource(env: Env, userUuid: string): Promise<string> {
  const existingSource = await env.DB.prepare(
    "SELECT source_uuid FROM sources WHERE user_uuid = ? AND source_kind = 'adapter'",
  )
    .bind(userUuid)
    .first<{ source_uuid: string }>();

  if (existingSource) {
    return existingSource.source_uuid;
  }

  const sourceUuid = crypto.randomUUID();
  const tokenHash = await sha256Hex(`sct_adapter_${sourceUuid}`);
  await env.DB.prepare(
    `INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind, can_rescan, can_receive_config)
     VALUES (?, ?, ?, 'adapter', 0, 0)`,
  )
    .bind(sourceUuid, userUuid, tokenHash)
    .run();

  return sourceUuid;
}

/** Write a structured event to source_events for admin debugging. */
async function logSourceEvent(
  env: Env,
  sourceUuid: string,
  eventType: string,
  eventData: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO source_events (source_uuid, event_type, event_data) VALUES (?, ?, ?)",
  )
    .bind(sourceUuid, eventType, JSON.stringify(eventData))
    .run();
}

// -- Plugin Registry -----------------------------------------------

async function handlePluginManifest(env: Env): Promise<Response> {
  const serverUrl = env.SERVER_URL ?? "https://api.savecraft.gg";
  const plugins: Record<string, Record<string, unknown>> = {};

  const listed = await env.PLUGINS.list({ prefix: "plugins/" });

  for (const object of listed.objects) {
    if (!object.key.endsWith("/manifest.json")) continue;

    const manifest = await env.PLUGINS.get(object.key);
    if (!manifest) continue;

    const data = await manifest.json<Record<string, unknown>>();
    const gameId = data.game_id as string | undefined;

    if (gameId) {
      const entry: Record<string, unknown> = {
        ...data,
        url: `${serverUrl}/plugins/${gameId}/parser.wasm`,
      };
      // Inject absolute URL for icon if present (only allow known filenames).
      if (data.icon === "icon.png" || data.icon === "icon.svg") {
        entry.icon_url = `${serverUrl}/plugins/${gameId}/${data.icon}`;
      }
      // Inject absolute URL for reference binary if present.
      const reference = data.reference as Record<string, unknown> | undefined;
      if (reference) {
        entry.reference = { ...reference, url: `${serverUrl}/plugins/${gameId}/reference.wasm` };
      }
      plugins[gameId] = entry;
    }
  }

  return Response.json(
    { plugins },
    {
      headers: { "Cache-Control": "public, max-age=300" },
    },
  );
}

async function handlePluginDownload(env: Env, gameId: string, filename: string): Promise<Response> {
  const key = `plugins/${gameId}/${filename}`;
  const object = await env.PLUGINS.get(key);
  if (!object) {
    return Response.json({ error: "Plugin not found" }, { status: 404 });
  }
  const contentTypes: Record<string, string> = {
    ".wasm": "application/wasm",
    ".sig": "application/octet-stream",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };
  const extension = filename.slice(filename.lastIndexOf("."));
  const contentType = contentTypes[extension] ?? "application/octet-stream";
  const headers: Record<string, string> = { "Content-Type": contentType };
  // Static assets: cache aggressively; images: add security headers.
  if (extension === ".svg" || extension === ".png") {
    headers["Cache-Control"] = "public, max-age=86400";
    headers["X-Content-Type-Options"] = "nosniff";
    headers["Content-Security-Policy"] = "default-src 'none'";
  }
  return new Response(object.body, { headers });
}

// -- Reference Query API (WfP dispatch) ----------------------------

async function handleReferenceQuery(request: Request, env: Env, gameId: string): Promise<Response> {
  let plugin: Fetcher;
  try {
    plugin = env.REFERENCE_PLUGINS.get(`${gameId}-reference`);
  } catch {
    return Response.json({ error: "Reference module not found" }, { status: 404 });
  }

  const query = await request.text();
  const result = await plugin.fetch(
    new Request("https://internal/query", {
      method: "POST",
      body: query,
    }),
  );

  return new Response(result.body, {
    status: result.status,
    headers: { "Content-Type": result.headers.get("Content-Type") ?? "application/json" },
  });
}

// -- Source Config API ---------------------------------------------

interface GameConfigInput {
  savePath: string;
  enabled: boolean;
  fileExtensions: string[];
}

async function handleSourceConfig(
  request: Request,
  url: URL,
  env: Env,
  userUuid: string,
): Promise<Response> {
  const pathParts = url.pathname.split("/");
  const sourceId = pathParts[4];
  if (!validateId(sourceId)) {
    return Response.json({ error: "Invalid source_uuid" }, { status: 400 });
  }

  // Verify source belongs to this user
  const source = await env.DB.prepare("SELECT user_uuid FROM sources WHERE source_uuid = ?")
    .bind(sourceId)
    .first<{ user_uuid: string | null }>();
  if (source?.user_uuid !== userUuid) {
    return Response.json({ error: "Source not found" }, { status: 404 });
  }

  if (request.method === "GET") {
    return handleGetSourceConfig(env, sourceId);
  }
  if (request.method === "PUT") {
    return handlePutSourceConfig(request, env, sourceId);
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function handleGetSourceConfig(env: Env, sourceId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT game_id, save_path, enabled, file_extensions FROM source_configs WHERE source_uuid = ?",
  )
    .bind(sourceId)
    .all<{ game_id: string; save_path: string; enabled: number; file_extensions: string }>();

  const games: Record<string, GameConfigInput> = {};
  for (const row of rows.results) {
    let fileExtensions: string[] = [];
    try {
      fileExtensions = JSON.parse(row.file_extensions) as string[];
    } catch {
      // Malformed JSON in D1
    }
    games[row.game_id] = {
      savePath: row.save_path,
      enabled: row.enabled === 1,
      fileExtensions,
    };
  }

  return Response.json({ games });
}

async function handlePutSourceConfig(
  request: Request,
  env: Env,
  sourceId: string,
): Promise<Response> {
  let body: { games?: Record<string, GameConfigInput> };
  try {
    body = await request.json<{ games?: Record<string, GameConfigInput> }>();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const games = body.games ?? {};

  await env.DB.prepare("DELETE FROM source_configs WHERE source_uuid = ?").bind(sourceId).run();

  for (const [gameId, config] of Object.entries(games)) {
    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )
      .bind(
        sourceId,
        gameId,
        config.savePath,
        config.enabled ? 1 : 0,
        JSON.stringify(config.fileExtensions),
      )
      .run();
  }

  const doId = env.SOURCE_HUB.idFromName(sourceId);
  const doStub = env.SOURCE_HUB.get(doId);
  const doResp = await doStub.fetch(
    new Request("https://do/push-config", {
      method: "POST",
      body: JSON.stringify({ sourceId }),
    }),
  );

  if (!doResp.ok) {
    const detail = await doResp.text();
    return Response.json({ error: "Config push failed", detail }, { status: 502 });
  }

  return Response.json({ ok: true });
}

// -- Per-Game Config Patch -----------------------------------------

async function handlePatchGameConfig(
  request: Request,
  env: Env,
  userUuid: string,
  sourceId: string,
  gameId: string,
): Promise<Response> {
  // Verify source belongs to this user
  const source = await env.DB.prepare("SELECT user_uuid FROM sources WHERE source_uuid = ?")
    .bind(sourceId)
    .first<{ user_uuid: string }>();
  if (!source) return Response.json({ error: "Source not found" }, { status: 404 });
  if (source.user_uuid !== userUuid) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { enabled?: boolean };
  try {
    body = await request.json<{ enabled?: boolean }>();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.enabled === undefined) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const result = await env.DB.prepare(
    "UPDATE source_configs SET enabled = ?, updated_at = datetime('now') WHERE source_uuid = ? AND game_id = ?",
  )
    .bind(body.enabled ? 1 : 0, sourceId, gameId)
    .run();

  if (!result.meta.changes || result.meta.changes === 0) {
    return Response.json({ error: "Config not found" }, { status: 404 });
  }

  // Push updated config to daemon
  const doId = env.SOURCE_HUB.idFromName(sourceId);
  const doStub = env.SOURCE_HUB.get(doId);
  await doStub.fetch(
    new Request("https://do/push-config", {
      method: "POST",
      body: JSON.stringify({ sourceId }),
    }),
  );

  return Response.json({ ok: true });
}

// -- Source Cleanup (shared by delete, deregister, and reaper) -----

export async function cleanupSource(
  env: Env,
  sourceUuid: string,
  userUuid: string | null,
): Promise<void> {
  // Delete saves owned solely by this source.
  // A save is "sole-source" if no OTHER active source in the `sources` table
  // has last_source_uuid pointing to a save with the same identity.
  // Must run BEFORE deleting the sources row (the subquery checks `sources`).
  const savesToDelete = await env.DB.prepare(
    `SELECT uuid FROM saves
     WHERE last_source_uuid = ?
       AND NOT EXISTS (
         SELECT 1 FROM saves s2
         JOIN sources ON sources.source_uuid = s2.last_source_uuid
         WHERE sources.source_uuid != ?
           AND s2.game_id = saves.game_id
           AND s2.save_name = saves.save_name
           AND (s2.user_uuid = saves.user_uuid OR (s2.user_uuid IS NULL AND saves.user_uuid IS NULL))
       )`,
  )
    .bind(sourceUuid, sourceUuid)
    .all<{ uuid: string }>();

  if (savesToDelete.results.length > 0) {
    const uuids = savesToDelete.results.map((r) => r.uuid);
    // Chunk to stay within D1's 100-parameter-per-statement limit
    const CHUNK_SIZE = 50;
    for (let index = 0; index < uuids.length; index += CHUNK_SIZE) {
      const chunk = uuids.slice(index, index + CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(",");
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM search_index WHERE save_id IN (${placeholders})`).bind(
          ...chunk,
        ),
        env.DB.prepare(`DELETE FROM notes WHERE save_id IN (${placeholders})`).bind(...chunk),
        env.DB.prepare(`DELETE FROM sections WHERE save_uuid IN (${placeholders})`).bind(...chunk),
        env.DB.prepare(`DELETE FROM saves WHERE uuid IN (${placeholders})`).bind(...chunk),
      ]);
    }
  }

  // D1 cleanup
  await env.DB.batch([
    env.DB.prepare("DELETE FROM source_events WHERE source_uuid = ?").bind(sourceUuid),
    env.DB.prepare("DELETE FROM source_configs WHERE source_uuid = ?").bind(sourceUuid),
    env.DB.prepare("DELETE FROM sources WHERE source_uuid = ?").bind(sourceUuid),
  ]);

  // Clean up SourceHub DO (close connections, delete alarm, wipe storage)
  const sourceHubId = env.SOURCE_HUB.idFromName(sourceUuid);
  await env.SOURCE_HUB.get(sourceHubId).fetch(
    new Request("https://do/cleanup", { method: "POST" }),
  );

  // Tell UserHub to drop this source's state (only if linked to a user)
  if (userUuid) {
    const userHubId = env.USER_HUB.idFromName(userUuid);
    await env.USER_HUB.get(userHubId).fetch(
      new Request("https://do/remove-source", {
        method: "POST",
        headers: { "X-User-UUID": userUuid },
        body: JSON.stringify({ sourceUuid }),
      }),
    );
  }
}

// -- Source Removal ------------------------------------------------

async function handleDeleteSource(
  env: Env,
  userUuid: string,
  sourceUuid: string,
): Promise<Response> {
  const source = await env.DB.prepare("SELECT user_uuid FROM sources WHERE source_uuid = ?")
    .bind(sourceUuid)
    .first<{ user_uuid: string | null }>();

  if (!source) {
    // D1 record gone but UserHub DO may still hold stale state for this
    // source — drop it so the UI stops showing a ghost entry.
    const userHubId = env.USER_HUB.idFromName(userUuid);
    await env.USER_HUB.get(userHubId).fetch(
      new Request("https://do/remove-source", {
        method: "POST",
        headers: { "X-User-UUID": userUuid },
        body: JSON.stringify({ sourceUuid }),
      }),
    );
    return Response.json({ ok: true });
  }

  if (source.user_uuid !== userUuid) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await cleanupSource(env, sourceUuid, userUuid);

  return Response.json({ ok: true });
}

// -- Game Removal --------------------------------------------------

async function handleDeleteGame(env: Env, userUuid: string, gameId: string): Promise<Response> {
  // Find all saves for this user + game
  const saves = await env.DB.prepare("SELECT uuid FROM saves WHERE user_uuid = ? AND game_id = ?")
    .bind(userUuid, gameId)
    .all<{ uuid: string }>();

  if (saves.results.length === 0) {
    return Response.json({ error: "No saves found for this game" }, { status: 404 });
  }

  // Batch D1 cleanup: delete notes + search_index for all saves in one round-trip
  const uuids = saves.results.map((s) => s.uuid);
  const CHUNK_SIZE = 50;
  let totalNotes = 0;
  for (let index = 0; index < uuids.length; index += CHUNK_SIZE) {
    const chunk = uuids.slice(index, index + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const batchResults = await env.DB.batch([
      env.DB.prepare(`DELETE FROM notes WHERE save_id IN (${placeholders})`).bind(...chunk),
      env.DB.prepare(`DELETE FROM search_index WHERE save_id IN (${placeholders})`).bind(...chunk),
    ]);
    totalNotes += batchResults[0]?.meta.changes ?? 0;
  }

  // Delete all saves for this game (sections cascade via FK)
  await env.DB.prepare("DELETE FROM saves WHERE user_uuid = ? AND game_id = ?")
    .bind(userUuid, gameId)
    .run();

  // Disable source_configs for this game across all user's sources
  await env.DB.prepare(
    `UPDATE source_configs SET enabled = 0
     WHERE game_id = ? AND source_uuid IN (
       SELECT source_uuid FROM sources WHERE user_uuid = ?
     )`,
  )
    .bind(gameId, userUuid)
    .run();

  // Push updated config to each connected source
  const sources = await env.DB.prepare("SELECT source_uuid FROM sources WHERE user_uuid = ?")
    .bind(userUuid)
    .all<{ source_uuid: string }>();

  for (const source of sources.results) {
    try {
      const doId = env.SOURCE_HUB.idFromName(source.source_uuid);
      const doStub = env.SOURCE_HUB.get(doId);
      await doStub.fetch(
        new Request("https://do/push-config", {
          method: "POST",
          body: JSON.stringify({ sourceId: source.source_uuid }),
        }),
      );
    } catch {
      // Don't let config push failures block deletion
    }
  }

  // Notify UserHub to rebroadcast updated state to UI clients
  const userHubId = env.USER_HUB.idFromName(userUuid);
  const userHubStub = env.USER_HUB.get(userHubId);
  await userHubStub.fetch(new Request("https://do/refresh-state", { method: "POST" }));

  return Response.json({
    ok: true,
    deleted: { saves: saves.results.length, notes: totalNotes },
  });
}

// -- Notes REST API ------------------------------------------------

async function handleNotes(
  request: Request,
  url: URL,
  env: Env,
  userUuid: string,
): Promise<Response> {
  const parts = url.pathname.replace("/api/v1/notes/", "").split("/");
  const saveId = parts[0];
  const noteId = parts[1];

  if (!validateId(saveId)) {
    return Response.json({ error: "Invalid save_id" }, { status: 400 });
  }

  const save = await env.DB.prepare("SELECT uuid FROM saves WHERE uuid = ? AND user_uuid = ?")
    .bind(saveId, userUuid)
    .first<{ uuid: string }>();

  if (!save) {
    return Response.json({ error: "Save not found" }, { status: 404 });
  }

  if (noteId) {
    if (!validateId(noteId)) {
      return Response.json({ error: "Invalid note_id" }, { status: 400 });
    }
    return handleSingleNote(request, env, userUuid, saveId, noteId);
  }

  return handleNoteCollection(request, env, userUuid, saveId);
}

async function handleNoteCollection(
  request: Request,
  env: Env,
  userUuid: string,
  saveId: string,
): Promise<Response> {
  if (request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT note_id, title, content, source, LENGTH(content) as size_bytes, updated_at FROM notes WHERE save_id = ? AND user_uuid = ? ORDER BY updated_at DESC",
    )
      .bind(saveId, userUuid)
      .all<{
        note_id: string;
        title: string;
        content: string;
        source: string;
        size_bytes: number;
        updated_at: string;
      }>();

    return Response.json({ notes: rows.results });
  }

  if (request.method === "POST") {
    let body: { title?: string; content?: string };
    try {
      body = await request.json<{ title?: string; content?: string }>();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.title || !body.content) {
      return Response.json({ error: "title and content required" }, { status: 400 });
    }

    if (new TextEncoder().encode(body.content).length > 50 * 1024) {
      return Response.json({ error: "Content exceeds 50KB limit" }, { status: 413 });
    }

    const count = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM notes WHERE save_id = ? AND user_uuid = ?",
    )
      .bind(saveId, userUuid)
      .first<{ cnt: number }>();

    if (count && count.cnt >= 10) {
      return Response.json({ error: "Maximum 10 notes per save" }, { status: 409 });
    }

    const noteId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO notes (note_id, save_id, user_uuid, title, content, source) VALUES (?, ?, ?, ?, ?, 'user')",
    )
      .bind(noteId, saveId, userUuid, body.title, body.content)
      .run();

    const saveRow = await env.DB.prepare("SELECT save_name FROM saves WHERE uuid = ?")
      .bind(saveId)
      .first<{ save_name: string }>();
    await indexNote(env.DB, saveId, saveRow?.save_name ?? "", noteId, body.title, body.content);

    return Response.json({ note_id: noteId }, { status: 201 });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

function handleSingleNote(
  request: Request,
  env: Env,
  userUuid: string,
  saveId: string,
  noteId: string,
): Promise<Response> {
  switch (request.method) {
    case "GET": {
      return getOneNote(env, userUuid, saveId, noteId);
    }
    case "PUT": {
      return updateOneNote(request, env, userUuid, saveId, noteId);
    }
    case "DELETE": {
      return deleteOneNote(env, userUuid, saveId, noteId);
    }
    default: {
      return Promise.resolve(new Response("Method Not Allowed", { status: 405 }));
    }
  }
}

async function getOneNote(
  env: Env,
  userUuid: string,
  saveId: string,
  noteId: string,
): Promise<Response> {
  const note = await env.DB.prepare(
    "SELECT note_id, title, content, source, created_at, updated_at FROM notes WHERE note_id = ? AND save_id = ? AND user_uuid = ?",
  )
    .bind(noteId, saveId, userUuid)
    .first<{
      note_id: string;
      title: string;
      content: string;
      source: string;
      created_at: string;
      updated_at: string;
    }>();

  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  return Response.json(note);
}

async function updateOneNote(
  request: Request,
  env: Env,
  userUuid: string,
  saveId: string,
  noteId: string,
): Promise<Response> {
  let body: { title?: string; content?: string };
  try {
    body = await request.json<{ title?: string; content?: string }>();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.content && new TextEncoder().encode(body.content).length > 50 * 1024) {
    return Response.json({ error: "Content exceeds 50KB limit" }, { status: 413 });
  }

  const existing = await env.DB.prepare(
    "SELECT note_id FROM notes WHERE note_id = ? AND save_id = ? AND user_uuid = ?",
  )
    .bind(noteId, saveId, userUuid)
    .first();

  if (!existing) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  const updates: string[] = [];
  const values: string[] = [];

  if (body.title !== undefined) {
    updates.push("title = ?");
    values.push(body.title);
  }
  if (body.content !== undefined) {
    updates.push("content = ?");
    values.push(body.content);
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    await env.DB.prepare(
      `UPDATE notes SET ${updates.join(", ")} WHERE note_id = ? AND user_uuid = ?`,
    )
      .bind(...values, noteId, userUuid)
      .run();

    const updated = await env.DB.prepare(
      "SELECT n.title, n.content, s.save_name FROM notes n JOIN saves s ON n.save_id = s.uuid WHERE n.note_id = ?",
    )
      .bind(noteId)
      .first<{ title: string; content: string; save_name: string }>();
    if (updated) {
      await indexNote(env.DB, saveId, updated.save_name, noteId, updated.title, updated.content);
    }
  }

  return Response.json({ note_id: noteId });
}

async function deleteOneNote(
  env: Env,
  userUuid: string,
  saveId: string,
  noteId: string,
): Promise<Response> {
  const existing = await env.DB.prepare(
    "SELECT note_id FROM notes WHERE note_id = ? AND save_id = ? AND user_uuid = ?",
  )
    .bind(noteId, saveId, userUuid)
    .first();

  if (!existing) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  await env.DB.prepare("DELETE FROM notes WHERE note_id = ? AND user_uuid = ?")
    .bind(noteId, userUuid)
    .run();

  await removeNoteFromIndex(env.DB, noteId);

  return Response.json({ deleted: true });
}

// -- Saves REST API ------------------------------------------------

async function handleListSaves(env: Env, userUuid: string): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT uuid, game_id, save_name, summary, last_updated FROM saves WHERE user_uuid = ? ORDER BY last_updated DESC",
  )
    .bind(userUuid)
    .all<{
      uuid: string;
      game_id: string;
      save_name: string;
      summary: string;
      last_updated: string;
    }>();

  return Response.json({
    saves: rows.results.map((row) => ({
      id: row.uuid,
      game_id: row.game_id,
      save_name: row.save_name,
      summary: row.summary,
      last_updated: row.last_updated,
    })),
  });
}

async function handleGetSave(env: Env, userUuid: string, saveId: string): Promise<Response> {
  const save = await env.DB.prepare(
    "SELECT uuid, game_id, save_name, summary, last_updated FROM saves WHERE uuid = ? AND user_uuid = ?",
  )
    .bind(saveId, userUuid)
    .first<{
      uuid: string;
      game_id: string;
      save_name: string;
      summary: string;
      last_updated: string;
    }>();

  if (!save) return Response.json({ error: "Save not found" }, { status: 404 });

  const sectionRows = await env.DB.prepare(
    "SELECT name, description FROM sections WHERE save_uuid = ? ORDER BY name",
  )
    .bind(saveId)
    .all<{ name: string; description: string }>();

  return Response.json({
    id: save.uuid,
    game_id: save.game_id,
    save_name: save.save_name,
    summary: save.summary,
    last_updated: save.last_updated,
    sections: sectionRows.results,
  });
}

// -- MCP Status ------------------------------------------------------------

async function handleMcpStatus(env: Env, userUuid: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT 1 FROM mcp_activity WHERE user_uuid = ?")
    .bind(userUuid)
    .first();
  return Response.json({ connected: row !== null });
}

// -- API Key CRUD -------------------------------------------------------

async function handleApiKeys(
  request: Request,
  url: URL,
  env: Env,
  userUuid: string,
): Promise<Response> {
  if (url.pathname === "/api/v1/api-keys" && request.method === "POST") {
    return createApiKey(request, env, userUuid);
  }
  if (url.pathname === "/api/v1/api-keys" && request.method === "GET") {
    return listApiKeys(env, userUuid);
  }
  if (url.pathname.startsWith("/api/v1/api-keys/") && request.method === "DELETE") {
    const keyId = url.pathname.replace("/api/v1/api-keys/", "");
    if (!validateId(keyId)) return Response.json({ error: "Invalid key_id" }, { status: 400 });
    return deleteApiKey(env, userUuid, keyId);
  }

  return new Response("Method Not Allowed", { status: 405 });
}

interface GeneratedApiKey {
  id: string;
  key: string;
  prefix: string;
  label: string;
}

interface PreparedApiKey {
  id: string;
  key: string;
  prefix: string;
  label: string;
  keyHash: string;
}

async function prepareApiKey(label: string): Promise<PreparedApiKey> {
  const id = crypto.randomUUID();
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const hex = [...randomBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `sav_${hex}`;
  const prefix = key.slice(0, 8);
  const keyHash = await sha256Hex(key);
  return { id, key, prefix, label, keyHash };
}

function apiKeyInsertStatement(
  env: Env,
  prepared: PreparedApiKey,
  userUuid: string,
): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT INTO api_keys (id, key_prefix, key_hash, user_uuid, label) VALUES (?, ?, ?, ?, ?)",
  ).bind(prepared.id, prepared.prefix, prepared.keyHash, userUuid, prepared.label);
}

async function generateApiKeyForUser(
  env: Env,
  userUuid: string,
  label: string,
): Promise<GeneratedApiKey> {
  const prepared = await prepareApiKey(label);
  await apiKeyInsertStatement(env, prepared, userUuid).run();
  return { id: prepared.id, key: prepared.key, prefix: prepared.prefix, label: prepared.label };
}

async function createApiKey(request: Request, env: Env, userUuid: string): Promise<Response> {
  let body: { label?: string } = {};
  const text = await request.text();
  if (text) {
    try {
      body = JSON.parse(text) as { label?: string };
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const generated = await generateApiKeyForUser(env, userUuid, body.label ?? "default");
  return Response.json(generated, { status: 201 });
}

async function listApiKeys(env: Env, userUuid: string): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT id, key_prefix, label, created_at FROM api_keys WHERE user_uuid = ? ORDER BY created_at DESC",
  )
    .bind(userUuid)
    .all<{ id: string; key_prefix: string; label: string; created_at: string }>();

  const keys = rows.results.map((row) => ({
    id: row.id,
    prefix: row.key_prefix,
    label: row.label,
    created_at: row.created_at,
  }));

  return Response.json({ keys });
}

async function deleteApiKey(env: Env, userUuid: string, keyId: string): Promise<Response> {
  const existing = await env.DB.prepare("SELECT id FROM api_keys WHERE id = ? AND user_uuid = ?")
    .bind(keyId, userUuid)
    .first();

  if (!existing) {
    return Response.json({ error: "Key not found" }, { status: 404 });
  }

  await env.DB.prepare("DELETE FROM api_keys WHERE id = ? AND user_uuid = ?")
    .bind(keyId, userUuid)
    .run();

  return Response.json({ deleted: true });
}

function generateSixDigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const code = ((buf[0] ?? 0) % 900_000) + 100_000;
  return code.toString();
}

async function handleSourceVerify(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateSource(request, env);
  if (!auth) return new Response("Unauthorized", { status: 401 });
  return Response.json({
    status: "ok",
    source_uuid: auth.sourceUuid,
    user_uuid: auth.userUuid,
  });
}

const LINK_CODE_TTL_MINUTES = 20;

async function handleSourceLink(request: Request, env: Env, userUuid: string): Promise<Response> {
  let body: { code?: string; email?: string; display_name?: string };
  try {
    body = await request.json<{ code?: string; email?: string; display_name?: string }>();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.code || !/^\d{6}$/.test(body.code)) {
    return Response.json({ error: "Invalid code" }, { status: 400 });
  }

  const source = await env.DB.prepare(
    "SELECT source_uuid FROM sources WHERE link_code = ? AND link_code_expires_at > datetime('now')",
  )
    .bind(body.code)
    .first<{ source_uuid: string }>();

  if (!source) {
    return Response.json({ error: "Invalid or expired code" }, { status: 404 });
  }

  await env.DB.prepare(
    "UPDATE sources SET user_uuid = ?, user_email = ?, user_display_name = ?, link_code = NULL, link_code_expires_at = NULL WHERE source_uuid = ?",
  )
    .bind(userUuid, body.email ?? null, body.display_name ?? null, source.source_uuid)
    .run();

  // Adopt any orphan saves this source pushed while unlinked
  await reconcileOrphanSaves(env, source.source_uuid, userUuid);

  // Notify the SourceHub DO so it starts forwarding to UserHub
  const doId = env.SOURCE_HUB.idFromName(source.source_uuid);
  const setUserResp = await env.SOURCE_HUB.get(doId).fetch(
    new Request("https://do/set-user", {
      method: "POST",
      body: JSON.stringify({ userUuid }),
    }),
  );
  await setUserResp.text();

  return Response.json({ source_uuid: source.source_uuid });
}

/**
 * Handle WebSocket-based source registration.
 * Unauthenticated — new sources connect, send a Register message,
 * receive RegisterResult with credentials, then disconnect.
 */
const REGISTER_RATE_LIMIT = 10; // max unlinked registrations per IP per hour

function handleWsRegister(request: Request, env: Env): Response {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Real-IP");

  server.accept();
  server.addEventListener("message", (event: MessageEvent) => {
    void (async () => {
      try {
        // Rate-limit by IP before processing
        if (!ip) {
          server.close(1008, "Cannot determine client IP");
          return;
        }
        const recent = await env.DB.prepare(
          "SELECT COUNT(*) as cnt FROM sources WHERE ip = ? AND user_uuid IS NULL AND created_at > datetime('now', '-1 hour')",
        )
          .bind(ip)
          .first<{ cnt: number }>();
        if (recent && recent.cnt >= REGISTER_RATE_LIMIT) {
          server.close(1008, "Too many registrations");
          return;
        }

        const data =
          typeof event.data === "string"
            ? new TextEncoder().encode(event.data)
            : new Uint8Array(event.data as ArrayBuffer);

        const msg = Message.decode(data);
        if (msg.payload?.$case !== "register") {
          server.close(1008, "Expected Register message");
          return;
        }

        const { hostname, os, arch } = msg.payload.register;

        const sourceUuid = crypto.randomUUID();
        const randomBytes = new Uint8Array(16);
        crypto.getRandomValues(randomBytes);
        const hex = [...randomBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
        const sourceToken = `sct_${hex}`;
        const tokenHash = await sha256Hex(sourceToken);

        const linkCode = generateSixDigitCode();
        const linkCodeExpiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);

        await env.DB.prepare(
          `INSERT INTO sources (source_uuid, token_hash, link_code, link_code_expires_at, hostname, os, arch, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            sourceUuid,
            tokenHash,
            linkCode,
            linkCodeExpiresAt.toISOString(),
            hostname || null,
            os || null,
            arch || null,
            ip,
          )
          .run();

        const resultMsg = Message.encode({
          payload: {
            $case: "registerResult",
            registerResult: {
              sourceUuid,
              sourceToken,
              linkCode,
              linkCodeExpiresAt,
            },
          },
        }).finish();

        server.send(resultMsg);
        server.close(1000, "Registration complete");
      } catch (error) {
        // eslint-disable-next-line no-console -- handleWsRegister runs outside a DO; no ring buffer available
        console.error("Registration failed:", error instanceof Error ? error.message : error);
        server.close(1011, "Registration failed");
      }
    })();
  });

  return new Response(null, { status: 101, webSocket: client });
}
