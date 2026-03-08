import type { Env } from "../types";

import { handleSeedCharacter } from "./seed-character";

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

async function routeSourceAdmin(
  env: Env,
  url: URL,
  sourceUuid: string,
  subpath: string,
): Promise<Response> {
  if (subpath === "events") {
    return handleSourceEvents(env, sourceUuid, url);
  }
  return (await proxyDoDebug(env.SOURCE_HUB, sourceUuid, subpath)) ?? NOT_FOUND();
}

export async function handleAdminRoute(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/admin/")) return null;

  const authError = authenticateAdmin(request, env);
  if (authError) return authError;

  if (url.pathname === "/admin/sources" && request.method === "GET") {
    return handleListSources(env);
  }

  if (url.pathname === "/admin/seed-character" && request.method === "POST") {
    return handleSeedCharacter(request, env);
  }

  const sourceMatch = /^\/admin\/source\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (sourceMatch?.[1] && sourceMatch[2]) {
    return routeSourceAdmin(env, url, sourceMatch[1], sourceMatch[2]);
  }

  const userMatch = /^\/admin\/user\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (userMatch?.[1] && userMatch[2]) {
    return (await proxyDoDebug(env.USER_HUB, userMatch[1], userMatch[2])) ?? NOT_FOUND();
  }

  return NOT_FOUND();
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
