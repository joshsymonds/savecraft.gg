import type { Env } from "../types";

import { handleSeedCharacter } from "./seed-character";
import { handleSeedSave } from "./seed-save";
import { handleSeedSource } from "./seed-source";

const encoder = new TextEncoder();

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) {
    // Compare against self to keep constant time, then return false
    crypto.subtle.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.subtle.timingSafeEqual(aBuf, bBuf);
}

const ALLOWED_DEBUG_SUBPATHS = new Set([
  "debug/state",
  "debug/connections",
  "debug/log",
  "debug/storage",
]);

function authenticateAdmin(request: Request, env: Env): Response | null {
  const apiKey = env.ADMIN_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Admin API not configured" }, { status: 503 });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authorization.slice(7);
  if (!timingSafeEqual(token, apiKey)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

async function proxyDoDebug(
  doNamespace: DurableObjectNamespace,
  entityId: string,
  subpath: string,
): Promise<Response | null> {
  if (!ALLOWED_DEBUG_SUBPATHS.has(subpath)) return null;
  const id = doNamespace.idFromName(entityId);
  const stub = doNamespace.get(id);
  const doResponse = await stub.fetch(new Request(`https://do/${subpath}`, { method: "GET" }));
  return new Response(doResponse.body, doResponse);
}

const NOT_FOUND = (): Response => Response.json({ error: "Not found" }, { status: 404 });

async function proxyDoPost(
  doNamespace: DurableObjectNamespace,
  entityId: string,
  path: string,
  body: unknown,
): Promise<Response> {
  const id = doNamespace.idFromName(entityId);
  const stub = doNamespace.get(id);
  const doResponse = await stub.fetch(
    new Request(`https://do/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return new Response(doResponse.body, doResponse);
}

async function routeSourceAdmin(
  request: Request,
  env: Env,
  url: URL,
  sourceUuid: string,
  subpath: string,
): Promise<Response> {
  if (subpath === "events") {
    return handleSourceEvents(env, sourceUuid, url);
  }
  if (subpath === "push-update" && request.method === "POST") {
    const body = await request.json();
    return proxyDoPost(env.SOURCE_HUB, sourceUuid, "push-update", body);
  }
  return (await proxyDoDebug(env.SOURCE_HUB, sourceUuid, subpath)) ?? NOT_FOUND();
}

type AdminHandler = (request: Request, env: Env, url: URL) => Promise<Response>;

const postRoutes = new Map<string, AdminHandler>([
  ["/admin/seed-character", (req, env) => handleSeedCharacter(req, env)],
  ["/admin/seed-save", (req, env) => handleSeedSave(req, env)],
  ["/admin/seed-source", (req, env) => handleSeedSource(req, env)],
  ["/admin/seed-note", (req, env) => handleSeedNote(req, env)],
  ["/admin/clean-user", (req, env) => handleCleanUser(req, env)],
]);

const getRoutes = new Map<string, AdminHandler>([
  ["/admin/sources", (_req, env) => handleListSources(env)],
]);

function routesByMethod(method: string): Map<string, AdminHandler> | undefined {
  if (method === "POST") return postRoutes;
  if (method === "GET") return getRoutes;
  return undefined;
}

async function routeDynamicAdmin(request: Request, env: Env, url: URL): Promise<Response | null> {
  const sourceMatch = /^\/admin\/source\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (sourceMatch) {
    return routeSourceAdmin(request, env, url, sourceMatch[1] ?? "", sourceMatch[2] ?? "");
  }

  const userMatch = /^\/admin\/user\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (userMatch) {
    return (
      (await proxyDoDebug(env.USER_HUB, userMatch[1] ?? "", userMatch[2] ?? "")) ?? NOT_FOUND()
    );
  }

  return null;
}

export async function handleAdminRoute(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/admin/")) return null;

  const authError = authenticateAdmin(request, env);
  if (authError) return authError;

  const handler = routesByMethod(request.method)?.get(url.pathname);
  if (handler) return handler(request, env, url);

  return (await routeDynamicAdmin(request, env, url)) ?? NOT_FOUND();
}

interface SeedNoteBody {
  userUuid?: string;
  saveId?: string;
  title?: string;
  content?: string;
}

async function handleSeedNote(request: Request, env: Env): Promise<Response> {
  const body: SeedNoteBody = await request.json();
  if (!body.userUuid || !body.saveId || !body.title || !body.content) {
    return Response.json(
      { error: "Missing required fields: userUuid, saveId, title, content" },
      { status: 400 },
    );
  }

  const noteId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO notes (note_id, save_id, user_uuid, title, content, source) VALUES (?, ?, ?, ?, ?, 'user')",
  )
    .bind(noteId, body.saveId, body.userUuid, body.title, body.content)
    .run();

  // Index in FTS5
  const save = await env.DB.prepare("SELECT save_name FROM saves WHERE uuid = ?")
    .bind(body.saveId)
    .first<{ save_name: string }>();
  if (save) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM search_index WHERE save_id = ? AND ref_id = ?").bind(
        body.saveId,
        noteId,
      ),
      env.DB.prepare(
        "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, 'note', ?, ?, ?)",
      ).bind(body.saveId, save.save_name, noteId, body.title, body.content),
    ]);
  }

  return Response.json({ noteId });
}

async function handleCleanUser(request: Request, env: Env): Promise<Response> {
  const body: { userUuid?: string } = await request.json();
  if (!body.userUuid) {
    return Response.json({ error: "Missing required field: userUuid" }, { status: 400 });
  }
  const userUuid = body.userUuid;

  // FTS5 virtual tables don't support subqueries in DELETE, so fetch save IDs first
  const saves = await env.DB.prepare("SELECT uuid FROM saves WHERE user_uuid = ?")
    .bind(userUuid)
    .all<{ uuid: string }>();
  const saveIds = saves.results.map((s) => s.uuid);

  if (saveIds.length > 0) {
    const placeholders = saveIds.map(() => "?").join(",");
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM search_index WHERE save_id IN (${placeholders})`).bind(
        ...saveIds,
      ),
      env.DB.prepare(`DELETE FROM notes WHERE save_id IN (${placeholders})`).bind(...saveIds),
      env.DB.prepare(`DELETE FROM sections WHERE save_uuid IN (${placeholders})`).bind(...saveIds),
      env.DB.prepare("DELETE FROM saves WHERE user_uuid = ?").bind(userUuid),
    ]);
  }

  return Response.json({ cleaned: true, userUuid });
}

async function handleListSources(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT source_uuid, user_uuid, hostname, source_kind, created_at, last_push_at FROM sources ORDER BY created_at DESC LIMIT 200",
  ).all();
  return Response.json({ sources: result.results });
}

async function handleSourceEvents(env: Env, sourceUuid: string, url: URL): Promise<Response> {
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 500);
  const result = await env.DB.prepare(
    "SELECT id, source_uuid, event_type, event_data, created_at FROM source_events WHERE source_uuid = ? ORDER BY created_at DESC LIMIT ?",
  )
    .bind(sourceUuid, limit)
    .all();
  return Response.json({ events: result.results });
}
