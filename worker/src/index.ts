import { authenticateSession, authenticateSource, sha256Hex } from "./auth";
import { indexNote, indexSaveSections, removeNoteFromIndex } from "./mcp/tools";
import { buildOAuthProvider, handleAuthorize, handleCallback } from "./oauth";
import { reapOrphanSources } from "./reaper";
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
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
    (await routePublicEndpoints(request, url, env)) ??
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

    return oauthProvider.fetch(request, env, ctx);
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await reapOrphanSources(env.DB, env.SAVES);
  },
} satisfies ExportedHandler<Env>;

const PLUGIN_DOWNLOAD_RE = /^\/plugins\/([^/]+)\/((parser|reference)\.wasm(?:\.sig)?)$/;

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
  if (url.pathname === "/api/v1/source/register" && request.method === "POST") {
    return handleSourceRegister(request, env);
  }
  if (url.pathname === "/api/v1/source/verify" && request.method === "GET") {
    return handleSourceVerify(request, env);
  }
  return null;
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

  return routeSourceEndpoints(request, url, env);
}

async function routeSourceEndpoints(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  const isSourceRoute =
    (url.pathname === "/api/v1/push" && request.method === "POST") ||
    (url.pathname === "/api/v1/source/link-code" && request.method === "POST") ||
    (url.pathname === "/api/v1/source/unlink" && request.method === "POST") ||
    (url.pathname === "/api/v1/source/status" && request.method === "GET");
  if (!isSourceRoute) return null;

  const auth = await authenticateSource(request, env);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  if (url.pathname === "/api/v1/push") return handlePush(request, env, auth.sourceUuid);
  if (url.pathname === "/api/v1/source/link-code")
    return handleSourceLinkCode(env, auth.sourceUuid);
  if (url.pathname === "/api/v1/source/unlink") return handleSourceUnlink(env, auth.sourceUuid);
  return handleSourceStatus(env, auth.sourceUuid);
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
  if (url.pathname.startsWith("/api/v1/sources/") && url.pathname.endsWith("/config")) {
    return handleSourceConfig(request, url, env, auth.userUuid);
  }
  if (url.pathname.startsWith("/api/v1/notes/")) {
    return handleNotes(request, url, env, auth.userUuid);
  }

  return routeReadEndpoints(request, url, env, auth.userUuid);
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
      // Inject absolute URL for reference binary if present.
      const reference = data.reference as Record<string, unknown> | undefined;
      if (reference) {
        entry.reference = { ...reference, url: `${serverUrl}/plugins/${gameId}/reference.wasm` };
      }
      plugins[gameId] = entry;
    }
  }

  return Response.json({ plugins });
}

async function handlePluginDownload(env: Env, gameId: string, filename: string): Promise<Response> {
  const key = `plugins/${gameId}/${filename}`;
  const object = await env.PLUGINS.get(key);
  if (!object) {
    return Response.json({ error: "Plugin not found" }, { status: 404 });
  }
  const contentType = filename.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
  return new Response(object.body, {
    headers: { "Content-Type": contentType },
  });
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

  if (request.method === "GET") {
    return handleGetSourceConfig(env, userUuid, sourceId);
  }
  if (request.method === "PUT") {
    return handlePutSourceConfig(request, env, userUuid, sourceId);
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function handleGetSourceConfig(
  env: Env,
  userUuid: string,
  sourceId: string,
): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT game_id, save_path, enabled, file_extensions FROM source_configs WHERE user_uuid = ? AND source_uuid = ?",
  )
    .bind(userUuid, sourceId)
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
  userUuid: string,
  sourceId: string,
): Promise<Response> {
  let body: { games?: Record<string, GameConfigInput> };
  try {
    body = await request.json<{ games?: Record<string, GameConfigInput> }>();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const games = body.games ?? {};

  await env.DB.prepare("DELETE FROM source_configs WHERE user_uuid = ? AND source_uuid = ?")
    .bind(userUuid, sourceId)
    .run();

  for (const [gameId, config] of Object.entries(games)) {
    await env.DB.prepare(
      `INSERT INTO source_configs (user_uuid, source_uuid, game_id, save_path, enabled, file_extensions, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
      .bind(
        userUuid,
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
      headers: { "X-User-UUID": userUuid },
      body: JSON.stringify({ sourceId }),
    }),
  );
  await doResp.text();

  return Response.json({ ok: true, config_pushed: doResp.ok });
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

  const save = await env.DB.prepare(
    `SELECT s.uuid FROM saves s
     JOIN sources src ON s.source_uuid = src.source_uuid
     WHERE s.uuid = ? AND src.user_uuid = ?`,
  )
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
    `SELECT s.uuid, s.game_id, s.save_name, s.summary, s.last_updated
     FROM saves s
     JOIN sources src ON s.source_uuid = src.source_uuid
     WHERE src.user_uuid = ?
     ORDER BY s.last_updated DESC`,
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
    `SELECT s.uuid, s.source_uuid, s.game_id, s.save_name, s.summary, s.last_updated
     FROM saves s
     JOIN sources src ON s.source_uuid = src.source_uuid
     WHERE s.uuid = ? AND src.user_uuid = ?`,
  )
    .bind(saveId, userUuid)
    .first<{
      uuid: string;
      source_uuid: string;
      game_id: string;
      save_name: string;
      summary: string;
      last_updated: string;
    }>();

  if (!save) return Response.json({ error: "Save not found" }, { status: 404 });

  const key = `sources/${save.source_uuid}/saves/${saveId}/latest.json`;
  const object = await env.SAVES.get(key);
  let sections: { name: string; description: string }[] = [];
  if (object) {
    const state = await object.json<{
      sections: Record<string, { description: string }>;
    }>();
    sections = Object.entries(state.sections).map(([name, s]) => ({
      name,
      description: s.description,
    }));
  }

  return Response.json({
    id: save.uuid,
    game_id: save.game_id,
    save_name: save.save_name,
    summary: save.summary,
    last_updated: save.last_updated,
    sections,
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

async function handleSourceLinkCode(env: Env, sourceUuid: string): Promise<Response> {
  const linkCode = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000).toISOString();

  await env.DB.prepare(
    "UPDATE sources SET link_code = ?, link_code_expires_at = ? WHERE source_uuid = ?",
  )
    .bind(linkCode, expiresAt, sourceUuid)
    .run();

  return Response.json({ link_code: linkCode, expires_at: expiresAt });
}

async function handleSourceUnlink(env: Env, sourceUuid: string): Promise<Response> {
  const linkCode = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000).toISOString();

  await env.DB.prepare(
    "UPDATE sources SET user_uuid = NULL, user_email = NULL, user_display_name = NULL, link_code = ?, link_code_expires_at = ? WHERE source_uuid = ?",
  )
    .bind(linkCode, expiresAt, sourceUuid)
    .run();

  return Response.json({ link_code: linkCode, link_code_expires_at: expiresAt });
}

async function handleSourceStatus(env: Env, sourceUuid: string): Promise<Response> {
  const source = await env.DB.prepare(
    "SELECT user_uuid, user_email, user_display_name, link_code, link_code_expires_at FROM sources WHERE source_uuid = ?",
  )
    .bind(sourceUuid)
    .first<{
      user_uuid: string | null;
      user_email: string | null;
      user_display_name: string | null;
      link_code: string | null;
      link_code_expires_at: string | null;
    }>();

  if (!source) {
    return Response.json({ error: "Source not found" }, { status: 404 });
  }

  const linked = source.user_uuid !== null;
  const result: Record<string, unknown> = { linked };

  if (linked) {
    result.user = {
      email: source.user_email,
      display_name: source.user_display_name,
    };
  }

  if (source.link_code) {
    result.link_code = source.link_code;
    result.link_code_expires_at = source.link_code_expires_at;
  }

  return Response.json(result);
}

async function handleSourceRegister(request: Request, env: Env): Promise<Response> {
  let body: { hostname?: string; os?: string; arch?: string } = {};
  const text = await request.text();
  if (text) {
    try {
      body = JSON.parse(text) as { hostname?: string; os?: string; arch?: string };
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const sourceUuid = crypto.randomUUID();
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const hex = [...randomBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const sourceToken = `sct_${hex}`;
  const tokenHash = await sha256Hex(sourceToken);

  const linkCode = generateSixDigitCode();
  const linkCodeExpiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000).toISOString();

  await env.DB.prepare(
    `INSERT INTO sources (source_uuid, token_hash, link_code, link_code_expires_at, hostname, os, arch)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      sourceUuid,
      tokenHash,
      linkCode,
      linkCodeExpiresAt,
      body.hostname ?? null,
      body.os ?? null,
      body.arch ?? null,
    )
    .run();

  return Response.json(
    {
      source_uuid: sourceUuid,
      source_token: sourceToken,
      link_code: linkCode,
      link_code_expires_at: linkCodeExpiresAt,
    },
    { status: 201 },
  );
}

/**
 * Check if the incoming parsedAt timestamp is newer than the current latest.json.
 */
async function isNewerThanLatest(
  snapshots: R2Bucket,
  latestKey: string,
  parsedAt: string,
): Promise<boolean> {
  const head = await snapshots.head(latestKey);
  if (!head) return true;
  const existingParsedAt = head.customMetadata?.parsedAt;
  if (!existingParsedAt) return true;
  return parsedAt > existingParsedAt;
}

async function resolveGameName(plugins: R2Bucket, gameId: string): Promise<string> {
  const manifest = await plugins.get(`plugins/${gameId}/manifest.json`);
  if (!manifest) return gameId;
  const data = await manifest.json<{ name?: string }>();
  return data.name ?? gameId;
}

async function readPushBody(request: Request): Promise<Record<string, unknown>> {
  let raw: string;
  if (request.headers.get("Content-Encoding") === "gzip" && request.body) {
    const ds = new DecompressionStream("gzip");
    const decompressed = request.body.pipeThrough(ds);
    raw = await new Response(decompressed).text();
  } else {
    raw = await request.text();
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

async function storePush(
  env: Env,
  sourceUuid: string,
  gameId: string,
  saveName: string,
  summary: string,
  parsedAt: string,
  bodyString: string,
  sections: unknown,
): Promise<{ saveUuid: string }> {
  const existingSave = await env.DB.prepare(
    "SELECT uuid FROM saves WHERE source_uuid = ? AND game_id = ? AND save_name = ?",
  )
    .bind(sourceUuid, gameId, saveName)
    .first<{ uuid: string }>();

  let saveUuid: string;
  if (existingSave) {
    saveUuid = existingSave.uuid;
  } else {
    saveUuid = crypto.randomUUID();
    const gameName = await resolveGameName(env.PLUGINS, gameId);
    await env.DB.prepare(
      "INSERT INTO saves (uuid, source_uuid, game_id, game_name, save_name, summary, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(saveUuid, sourceUuid, gameId, gameName, saveName, summary, parsedAt)
      .run();
  }

  const snapshotKey = `sources/${sourceUuid}/saves/${saveUuid}/snapshots/${parsedAt}.json`;
  await env.SAVES.put(snapshotKey, bodyString);

  const latestKey = `sources/${sourceUuid}/saves/${saveUuid}/latest.json`;
  const isNewer = await isNewerThanLatest(env.SAVES, latestKey, parsedAt);
  if (isNewer) {
    await env.SAVES.put(latestKey, bodyString, { customMetadata: { parsedAt } });
    if (existingSave) {
      await env.DB.prepare("UPDATE saves SET summary = ?, last_updated = ? WHERE uuid = ?")
        .bind(summary, parsedAt, saveUuid)
        .run();
    }
    const sectionData = sections as Record<string, { description: string; data: unknown }>;
    await indexSaveSections(env.DB, saveUuid, saveName, sectionData);
  }

  return { saveUuid };
}

async function handlePush(request: Request, env: Env, sourceUuid: string): Promise<Response> {
  const gameId = request.headers.get("X-Game");
  if (!gameId) {
    return Response.json({ error: "Missing X-Game header" }, { status: 400 });
  }

  const parsedAt = request.headers.get("X-Parsed-At") ?? new Date().toISOString();

  let body: Record<string, unknown>;
  try {
    body = await readPushBody(request);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const identity = body.identity as Record<string, unknown> | undefined;
  const sections = body.sections;
  const summary = (body.summary as string | undefined) ?? "";

  if (!identity || !sections) {
    return Response.json(
      { error: "Body must contain 'identity' and 'sections' keys" },
      { status: 400 },
    );
  }

  const saveName = (identity.saveName as string | undefined) ?? "";
  if (!saveName) {
    return Response.json({ error: "identity.saveName is required" }, { status: 400 });
  }

  const bodyString = JSON.stringify(body);
  if (bodyString.length > 5 * 1024 * 1024) {
    return Response.json({ error: "Body exceeds 5MB limit" }, { status: 413 });
  }

  try {
    const { saveUuid } = await storePush(
      env,
      sourceUuid,
      gameId,
      saveName,
      summary,
      parsedAt,
      bodyString,
      sections,
    );

    // Update last activity timestamp on successful push (best-effort)
    try {
      await env.DB.prepare(
        "UPDATE sources SET last_push_at = datetime('now') WHERE source_uuid = ?",
      )
        .bind(sourceUuid)
        .run();
    } catch {
      // Don't let timestamp update failures break the push response
    }

    return Response.json({ save_uuid: saveUuid, snapshot_timestamp: parsedAt }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Push failed: ${message}` }, { status: 500 });
  }
}
