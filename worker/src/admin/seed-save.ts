/**
 * POST /admin/seed-save — Insert a save with arbitrary sections for any user.
 *
 * Unlike seed-character (which calls an adapter), this accepts raw section data
 * directly. Used by the demo account reset script to seed D2R daemon-parsed data
 * without a running daemon.
 */

import { type SectionInput, storePush } from "../store";
import type { Env } from "../types";

interface SeedSaveInput {
  userUuid: string;
  sourceUuid: string;
  gameId: string;
  saveName: string;
  summary: string;
  sections: Record<string, SectionInput>;
}

function validateInput(body: unknown): SeedSaveInput {
  const b = body as Record<string, unknown>;
  if (!b.userUuid || !b.sourceUuid || !b.gameId || !b.saveName || !b.summary || !b.sections) {
    throw new Error(
      "Missing required fields: userUuid, sourceUuid, gameId, saveName, summary, sections",
    );
  }
  return {
    userUuid: b.userUuid as string,
    sourceUuid: b.sourceUuid as string,
    gameId: b.gameId as string,
    saveName: b.saveName as string,
    summary: b.summary as string,
    sections: b.sections as Record<string, SectionInput>,
  };
}

export async function handleSeedSave(request: Request, env: Env): Promise<Response> {
  let input: SeedSaveInput;
  try {
    input = validateInput(await request.json());
  } catch {
    return Response.json(
      {
        error: "Missing required fields: userUuid, sourceUuid, gameId, saveName, summary, sections",
      },
      { status: 400 },
    );
  }

  // Verify the source exists and belongs to this user
  const source = await env.DB.prepare(
    "SELECT source_uuid FROM sources WHERE source_uuid = ? AND user_uuid = ?",
  )
    .bind(input.sourceUuid, input.userUuid)
    .first<{ source_uuid: string }>();

  if (!source) {
    return Response.json({ error: "Source not found or does not belong to user" }, { status: 404 });
  }

  const parsedAt = new Date().toISOString();
  const result = await storePush(
    env,
    input.userUuid,
    input.sourceUuid,
    input.gameId,
    input.saveName,
    input.summary,
    parsedAt,
    input.sections,
  );

  return Response.json({
    saveUuid: result.saveUuid,
    changed: result.changed,
    sections: Object.keys(input.sections),
  });
}
