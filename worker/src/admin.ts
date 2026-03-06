import type { Env } from "./types";

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

const ALLOWED_DEBUG_SUBPATHS = new Set(["debug/state", "debug/connections", "debug/log", "debug/storage"]);

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

  const sourceMatch = /^\/admin\/source\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (sourceMatch?.[1] && sourceMatch[2]) {
    const sourceUuid = sourceMatch[1];
    const subpath = sourceMatch[2];

    if (subpath === "events") {
      return handleSourceEvents(env, sourceUuid, url);
    }

    if (ALLOWED_DEBUG_SUBPATHS.has(subpath)) {
      const id = env.SOURCE_HUB.idFromName(sourceUuid);
      const stub = env.SOURCE_HUB.get(id);
      const doResponse = await stub.fetch(new Request(`https://do/${subpath}`, { method: "GET" }));
      return new Response(doResponse.body, doResponse);
    }
  }

  const userMatch = /^\/admin\/user\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (userMatch?.[1] && userMatch[2]) {
    const userUuid = userMatch[1];
    const subpath = userMatch[2];

    if (ALLOWED_DEBUG_SUBPATHS.has(subpath)) {
      const id = env.USER_HUB.idFromName(userUuid);
      const stub = env.USER_HUB.get(id);
      const doResponse = await stub.fetch(new Request(`https://do/${subpath}`, { method: "GET" }));
      return new Response(doResponse.body, doResponse);
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
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
