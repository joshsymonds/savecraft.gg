import { authenticate } from "./auth";
import { handleMcpRequest } from "./mcp/handler";
import { indexNote, indexSaveSections, removeNoteFromIndex } from "./mcp/tools";
import type { Env } from "./types";

export { DaemonHub } from "./hub";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function corsify(response: Response): Response {
  const patched = new Response(response.body, response);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    patched.headers.set(key, value);
  }
  return patched;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    const response =
      (await routePublicEndpoints(request, url, env)) ??
      (await routeProtectedEndpoints(request, url, env));
    return corsify(response);
  },
} satisfies ExportedHandler<Env>;

const PLUGIN_DOWNLOAD_RE = /^\/plugins\/([^/]+)\/(parser\.wasm(?:\.sig)?)$/;

async function routePublicEndpoints(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (url.pathname === "/health") return Response.json({ status: "ok" });
  if (url.pathname === "/.well-known/oauth-protected-resource") {
    return handleOAuthResourceMetadata(env);
  }
  if (url.pathname === "/api/v1/plugins/manifest" && request.method === "GET") {
    return handlePluginManifest(env);
  }
  if (url.pathname === "/api/v1/push" && request.method === "POST") {
    return handlePush(request, env);
  }
  // Match /plugins/:gameId/parser.wasm or /plugins/:gameId/parser.wasm.sig
  const pluginMatch = PLUGIN_DOWNLOAD_RE.exec(url.pathname);
  if (pluginMatch?.[1] && pluginMatch[2] && request.method === "GET") {
    return handlePluginDownload(env, pluginMatch[1], pluginMatch[2]);
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
  if (url.pathname === "/ws/daemon" || url.pathname === "/ws/ui") {
    const auth = await authenticate(request, env);
    if (!auth) return new Response("Unauthorized", { status: 401 });
    const id = env.DAEMON_HUB.idFromName(auth.userUuid);
    // Pass real userUuid to DO (id.toString() is a hex hash, not the original string)
    const headers = new Headers(request.headers);
    headers.set("X-User-UUID", auth.userUuid);
    return env.DAEMON_HUB.get(id).fetch(new Request(request, { headers }));
  }
  if (url.pathname === "/mcp") {
    const auth = await authenticate(request, env);
    if (!auth) return unauthorizedMcp(env);
    return handleMcpRequest(request, env, auth.userUuid);
  }
  return null;
}

async function routeApiEndpoints(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/v1/")) return null;

  const auth = await authenticate(request, env);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  if (url.pathname.startsWith("/api/v1/devices/") && url.pathname.endsWith("/config")) {
    return handleDeviceConfig(request, url, env, auth.userUuid);
  }
  if (url.pathname.startsWith("/api/v1/notes/")) {
    return handleNotes(request, url, env, auth.userUuid);
  }
  if (url.pathname === "/api/v1/saves" && request.method === "GET") {
    return handleListSaves(env, auth.userUuid);
  }
  if (url.pathname.startsWith("/api/v1/saves/") && request.method === "GET") {
    const saveId = url.pathname.replace("/api/v1/saves/", "");
    if (!saveId) return Response.json({ error: "Missing save_id" }, { status: 400 });
    return handleGetSave(env, auth.userUuid, saveId);
  }
  return null;
}

/**
 * Returns 401 with MCP-spec WWW-Authenticate header pointing
 * to the OAuth protected resource metadata endpoint.
 */
function unauthorizedMcp(env: Env): Response {
  const serverUrl = env.SERVER_URL ?? "https://mcp.savecraft.gg";
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Bearer resource_metadata="${serverUrl}/.well-known/oauth-protected-resource"`,
    },
  });
}

/**
 * RFC 9728 OAuth Protected Resource Metadata.
 * Points MCP clients to the authorization server (Clerk).
 */
function handleOAuthResourceMetadata(env: Env): Response {
  const serverUrl = env.SERVER_URL ?? "https://mcp.savecraft.gg";
  const clerkIssuer = env.CLERK_ISSUER ?? "https://clerk.savecraft.gg";

  return Response.json(
    {
      resource: serverUrl,
      authorization_servers: [clerkIssuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["savecraft:read"],
      resource_name: "Savecraft MCP Server",
    },
    {
      headers: { "Access-Control-Allow-Origin": "*" },
    },
  );
}

// -- Plugin Registry -----------------------------------------------

async function handlePluginManifest(env: Env): Promise<Response> {
  const serverUrl = env.SERVER_URL ?? "https://mcp.savecraft.gg";
  const plugins: Record<string, Record<string, unknown>> = {};

  // List all plugin manifests in R2
  const listed = await env.PLUGINS.list({ prefix: "plugins/" });

  for (const object of listed.objects) {
    if (!object.key.endsWith("/manifest.json")) continue;

    const manifest = await env.PLUGINS.get(object.key);
    if (!manifest) continue;

    const data = await manifest.json<Record<string, unknown>>();
    const gameId = data.game_id as string | undefined;

    if (gameId) {
      plugins[gameId] = {
        ...data,
        url: `${serverUrl}/plugins/${gameId}/parser.wasm`,
      };
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

// -- Device Config API ---------------------------------------------

interface GameConfigInput {
  savePath: string;
  enabled: boolean;
  fileExtensions: string[];
}

async function handleDeviceConfig(
  request: Request,
  url: URL,
  env: Env,
  userUuid: string,
): Promise<Response> {
  // Parse device ID from /api/v1/devices/:deviceId/config
  const pathParts = url.pathname.split("/");
  const deviceId = pathParts[4];
  if (!deviceId) {
    return Response.json({ error: "Missing device_id" }, { status: 400 });
  }

  if (request.method === "GET") {
    return handleGetDeviceConfig(env, userUuid, deviceId);
  }
  if (request.method === "PUT") {
    return handlePutDeviceConfig(request, env, userUuid, deviceId);
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function handleGetDeviceConfig(
  env: Env,
  userUuid: string,
  deviceId: string,
): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT game_id, save_path, enabled, file_extensions FROM device_configs WHERE user_uuid = ? AND device_id = ?",
  )
    .bind(userUuid, deviceId)
    .all<{ game_id: string; save_path: string; enabled: number; file_extensions: string }>();

  const games: Record<string, GameConfigInput> = {};
  for (const row of rows.results) {
    games[row.game_id] = {
      savePath: row.save_path,
      enabled: row.enabled === 1,
      fileExtensions: JSON.parse(row.file_extensions) as string[],
    };
  }

  return Response.json({ games });
}

async function handlePutDeviceConfig(
  request: Request,
  env: Env,
  userUuid: string,
  deviceId: string,
): Promise<Response> {
  let body: { games?: Record<string, GameConfigInput> };
  try {
    body = await request.json<{ games?: Record<string, GameConfigInput> }>();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const games = body.games ?? {};

  // Delete existing configs for this device, then insert new ones.
  // This ensures removed games are cleaned up.
  await env.DB.prepare("DELETE FROM device_configs WHERE user_uuid = ? AND device_id = ?")
    .bind(userUuid, deviceId)
    .run();

  for (const [gameId, config] of Object.entries(games)) {
    await env.DB.prepare(
      `INSERT INTO device_configs (user_uuid, device_id, game_id, save_path, enabled, file_extensions, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
      .bind(
        userUuid,
        deviceId,
        gameId,
        config.savePath,
        config.enabled ? 1 : 0,
        JSON.stringify(config.fileExtensions),
      )
      .run();
  }

  // Poke the user's DaemonHub DO to push the config to connected daemons.
  const doId = env.DAEMON_HUB.idFromName(userUuid);
  const doStub = env.DAEMON_HUB.get(doId);
  const doResp = await doStub.fetch(
    new Request("https://do/push-config", {
      method: "POST",
      headers: { "X-User-UUID": userUuid },
      body: JSON.stringify({ deviceId }),
    }),
  );
  await doResp.text();

  return Response.json({ ok: true });
}

// -- Notes REST API ------------------------------------------------

async function handleNotes(
  request: Request,
  url: URL,
  env: Env,
  userUuid: string,
): Promise<Response> {
  // Parse path: /api/v1/notes/{save_id} or /api/v1/notes/{save_id}/{note_id}
  const parts = url.pathname.replace("/api/v1/notes/", "").split("/");
  const saveId = parts[0];
  const noteId = parts[1];

  if (!saveId) {
    return Response.json({ error: "Missing save_id" }, { status: 400 });
  }

  // Verify save exists and belongs to user
  const save = await env.DB.prepare("SELECT uuid FROM saves WHERE uuid = ? AND user_uuid = ?")
    .bind(saveId, userUuid)
    .first<{ uuid: string }>();

  if (!save) {
    return Response.json({ error: "Save not found" }, { status: 404 });
  }

  if (noteId) {
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
      "SELECT note_id, title, source, LENGTH(content) as size_bytes FROM notes WHERE save_id = ? AND user_uuid = ? ORDER BY created_at DESC",
    )
      .bind(saveId, userUuid)
      .all<{ note_id: string; title: string; source: string; size_bytes: number }>();

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

    // 50KB content limit
    if (new TextEncoder().encode(body.content).length > 50 * 1024) {
      return Response.json({ error: "Content exceeds 50KB limit" }, { status: 413 });
    }

    // 10 notes per save limit
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

    // Index note in FTS5
    const saveRow = await env.DB.prepare("SELECT character_name FROM saves WHERE uuid = ?")
      .bind(saveId)
      .first<{ character_name: string }>();
    await indexNote(
      env.DB,
      userUuid,
      saveId,
      saveRow?.character_name ?? "",
      noteId,
      body.title,
      body.content,
    );

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

    // Re-index note in FTS5
    const updated = await env.DB.prepare(
      "SELECT n.title, n.content, s.character_name FROM notes n JOIN saves s ON n.save_id = s.uuid WHERE n.note_id = ?",
    )
      .bind(noteId)
      .first<{ title: string; content: string; character_name: string }>();
    if (updated) {
      await indexNote(
        env.DB,
        userUuid,
        saveId,
        updated.character_name,
        noteId,
        updated.title,
        updated.content,
      );
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

  // Remove from FTS5 index
  await removeNoteFromIndex(env.DB, userUuid, noteId);

  return Response.json({ deleted: true });
}

// -- Saves REST API ------------------------------------------------

async function handleListSaves(env: Env, userUuid: string): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT uuid, game_id, character_name, summary, last_updated FROM saves WHERE user_uuid = ? ORDER BY last_updated DESC",
  )
    .bind(userUuid)
    .all<{
      uuid: string;
      game_id: string;
      character_name: string;
      summary: string;
      last_updated: string;
    }>();

  return Response.json({
    saves: rows.results.map((row) => ({
      id: row.uuid,
      game_id: row.game_id,
      character_name: row.character_name,
      summary: row.summary,
      last_updated: row.last_updated,
    })),
  });
}

async function handleGetSave(env: Env, userUuid: string, saveId: string): Promise<Response> {
  const save = await env.DB.prepare(
    "SELECT uuid, game_id, character_name, summary, last_updated FROM saves WHERE uuid = ? AND user_uuid = ?",
  )
    .bind(saveId, userUuid)
    .first<{
      uuid: string;
      game_id: string;
      character_name: string;
      summary: string;
      last_updated: string;
    }>();

  if (!save) return Response.json({ error: "Save not found" }, { status: 404 });

  // Load section list from latest snapshot
  const key = `users/${userUuid}/saves/${saveId}/latest.json`;
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
    character_name: save.character_name,
    summary: save.summary,
    last_updated: save.last_updated,
    sections,
  });
}

/**
 * Check if the incoming parsedAt timestamp is newer than the current latest.json.
 * Returns true if there is no existing latest or the incoming timestamp is strictly newer.
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

async function handlePush(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }

  const gameId = request.headers.get("X-Game");
  if (!gameId) {
    return Response.json({ error: "Missing X-Game header" }, { status: 400 });
  }

  const parsedAt = request.headers.get("X-Parsed-At") ?? new Date().toISOString();

  // Validate body
  let body: Record<string, unknown>;
  try {
    body = await request.json<Record<string, unknown>>();
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

  const characterName = (identity.character_name as string | undefined) ?? "";
  if (!characterName) {
    return Response.json({ error: "identity.character_name is required" }, { status: 400 });
  }

  // Size check (5MB limit)
  const bodyString = JSON.stringify(body);
  if (bodyString.length > 5 * 1024 * 1024) {
    return Response.json({ error: "Body exceeds 5MB limit" }, { status: 413 });
  }

  // Upsert save in D1, get save UUID
  const existingSave = await env.DB.prepare(
    "SELECT uuid FROM saves WHERE user_uuid = ? AND game_id = ? AND character_name = ?",
  )
    .bind(auth.userUuid, gameId, characterName)
    .first<{ uuid: string }>();

  let saveUuid: string;
  if (existingSave) {
    saveUuid = existingSave.uuid;
  } else {
    saveUuid = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO saves (uuid, user_uuid, game_id, character_name, summary, last_updated) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(saveUuid, auth.userUuid, gameId, characterName, summary, parsedAt)
      .run();
  }

  // Write snapshot to R2 (always — snapshots are immutable)
  const snapshotKey = `users/${auth.userUuid}/saves/${saveUuid}/snapshots/${parsedAt}.json`;
  await env.SAVES.put(snapshotKey, bodyString);

  // Update latest pointer only if incoming timestamp is newer
  const latestKey = `users/${auth.userUuid}/saves/${saveUuid}/latest.json`;
  const isNewer = await isNewerThanLatest(env.SAVES, latestKey, parsedAt);
  if (isNewer) {
    await env.SAVES.put(latestKey, bodyString, {
      customMetadata: { parsedAt },
    });
    // Update D1 summary only when latest changes
    if (existingSave) {
      await env.DB.prepare("UPDATE saves SET summary = ?, last_updated = ? WHERE uuid = ?")
        .bind(summary, parsedAt, saveUuid)
        .run();
    }
    // Re-index save sections in FTS5
    const sectionData = sections as Record<string, { description: string; data: unknown }>;
    await indexSaveSections(env.DB, auth.userUuid, saveUuid, characterName, sectionData);
  }

  return Response.json({ save_uuid: saveUuid, snapshot_timestamp: parsedAt }, { status: 201 });
}
