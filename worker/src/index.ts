import type { Env } from "./types";

export { DaemonHub } from "./hub";

/**
 * Extract user UUID from the Authorization header.
 * TODO: Replace with Clerk JWT validation for production.
 * For now, the bearer token IS the user UUID.
 */
function getUserUuid(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    // WebSocket upgrade routes — forward to per-user Durable Object
    if (url.pathname === "/ws/daemon" || url.pathname === "/ws/ui") {
      const userUuid = getUserUuid(request);
      if (!userUuid) {
        return new Response("Unauthorized", { status: 401 });
      }
      const id = env.DAEMON_HUB.idFromName(userUuid);
      const stub = env.DAEMON_HUB.get(id);
      return stub.fetch(request);
    }

    // Push API — daemon pushes parsed game state
    if (url.pathname === "/api/v1/push" && request.method === "POST") {
      return handlePush(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function handlePush(request: Request, env: Env): Promise<Response> {
  const userUuid = getUserUuid(request);
  if (!userUuid) {
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
    .bind(userUuid, gameId, characterName)
    .first<{ uuid: string }>();

  let saveUuid: string;
  if (existingSave) {
    saveUuid = existingSave.uuid;
    await env.DB.prepare("UPDATE saves SET summary = ?, last_updated = ? WHERE uuid = ?")
      .bind(summary, parsedAt, saveUuid)
      .run();
  } else {
    saveUuid = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO saves (uuid, user_uuid, game_id, character_name, summary, last_updated) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(saveUuid, userUuid, gameId, characterName, summary, parsedAt)
      .run();
  }

  // Write snapshot to R2
  const snapshotKey = `users/${userUuid}/saves/${saveUuid}/snapshots/${parsedAt}.json`;
  await env.SNAPSHOTS.put(snapshotKey, bodyString);

  // Update latest pointer
  const latestKey = `users/${userUuid}/saves/${saveUuid}/latest.json`;
  await env.SNAPSHOTS.put(latestKey, bodyString);

  return Response.json({ save_uuid: saveUuid, snapshot_timestamp: parsedAt }, { status: 201 });
}
