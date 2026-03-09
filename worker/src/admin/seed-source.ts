/**
 * POST /admin/seed-source — Create a source for a user without daemon registration.
 *
 * Returns the existing source if one already exists for this user+kind combination.
 * Used by the demo account reset script.
 */

import type { Env } from "../types";

interface SeedSourceInput {
  userUuid: string;
  sourceKind: "daemon" | "adapter";
  hostname: string;
}

function validateInput(body: unknown): SeedSourceInput {
  const b = body as Record<string, unknown>;
  if (!b.userUuid || !b.hostname) {
    throw new Error("Missing required fields: userUuid, hostname");
  }
  return {
    userUuid: b.userUuid as string,
    sourceKind: b.sourceKind ? (b.sourceKind as "daemon" | "adapter") : "daemon",
    hostname: b.hostname as string,
  };
}

export async function handleSeedSource(request: Request, env: Env): Promise<Response> {
  let input: SeedSourceInput;
  try {
    input = validateInput(await request.json());
  } catch {
    return Response.json({ error: "Missing required fields: userUuid, hostname" }, { status: 400 });
  }

  // Return existing source if one matches
  const existing = await env.DB.prepare(
    "SELECT source_uuid FROM sources WHERE user_uuid = ? AND source_kind = ? AND hostname = ?",
  )
    .bind(input.userUuid, input.sourceKind, input.hostname)
    .first<{ source_uuid: string }>();

  if (existing) {
    return Response.json({ sourceUuid: existing.source_uuid, created: false });
  }

  // Create new source
  const sourceUuid = crypto.randomUUID();
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const tokenHex = [...tokenBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const tokenHashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tokenHex));
  const tokenHash = [...new Uint8Array(tokenHashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await env.DB.prepare(
    `INSERT INTO sources (source_uuid, user_uuid, token_hash, hostname, source_kind, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(sourceUuid, input.userUuid, tokenHash, input.hostname, input.sourceKind)
    .run();

  return Response.json({ sourceUuid, created: true });
}
