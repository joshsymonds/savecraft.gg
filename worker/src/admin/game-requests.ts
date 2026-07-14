/**
 * POST /admin/game-requests/block — Exclude a game slug from the public
 * game-request tally endpoint without deleting the underlying request rows.
 */

import type { Env } from "../types";

interface BlockGameRequestInput {
  gameSlug: string;
}

function validateInput(body: unknown): BlockGameRequestInput {
  const b = body as Record<string, unknown>;
  if (!b.game_slug || typeof b.game_slug !== "string") {
    throw new Error("Missing required field: game_slug");
  }
  return { gameSlug: b.game_slug };
}

export async function handleBlockGameRequest(request: Request, env: Env): Promise<Response> {
  let input: BlockGameRequestInput;
  try {
    input = validateInput(await request.json());
  } catch {
    return Response.json({ error: "Missing required field: game_slug" }, { status: 400 });
  }

  await env.DB.prepare("INSERT OR IGNORE INTO game_request_blocks (game_slug) VALUES (?)")
    .bind(input.gameSlug)
    .run();

  return Response.json({ blocked: input.gameSlug });
}
