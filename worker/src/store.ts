/**
 * Save storage pipeline — shared between the push API and adapter refresh.
 *
 * storePush upserts a save in D1 (metadata + sections) and indexes sections in FTS.
 */

import { indexSaveSections } from "./mcp/tools";
import type { Env } from "./types";

export async function resolveGameName(plugins: R2Bucket, gameId: string): Promise<string> {
  const manifest = await plugins.get(`plugins/${gameId}/manifest.json`);
  if (!manifest) return gameId;
  const data = await manifest.json<{ name?: string }>();
  return data.name ?? gameId;
}

export interface SectionInput {
  description: string;
  data: unknown;
}

export async function storePush(
  env: Env,
  userUuid: string,
  sourceUuid: string,
  gameId: string,
  saveName: string,
  summary: string,
  parsedAt: string,
  sections: Record<string, SectionInput>,
): Promise<{ saveUuid: string }> {
  const existingSave = await env.DB.prepare(
    "SELECT uuid, last_updated FROM saves WHERE user_uuid = ? AND game_id = ? AND save_name = ?",
  )
    .bind(userUuid, gameId, saveName)
    .first<{ uuid: string; last_updated: string }>();

  let saveUuid: string;
  if (existingSave) {
    saveUuid = existingSave.uuid;
  } else {
    saveUuid = crypto.randomUUID();
    const gameName = await resolveGameName(env.PLUGINS, gameId);
    await env.DB.prepare(
      "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(saveUuid, userUuid, gameId, gameName, saveName, summary, parsedAt, sourceUuid)
      .run();
  }

  const isNewer = !existingSave || parsedAt > existingSave.last_updated;
  if (isNewer) {
    // D1 save metadata update
    await env.DB.prepare(
      "UPDATE saves SET summary = ?, last_updated = ?, last_source_uuid = ? WHERE uuid = ?",
    )
      .bind(summary, parsedAt, sourceUuid, saveUuid)
      .run();

    // D1 sections upsert — one row per section
    const sectionBatch: D1PreparedStatement[] = [];
    for (const [name, section] of Object.entries(sections)) {
      sectionBatch.push(
        env.DB.prepare(
          "INSERT OR REPLACE INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
        ).bind(saveUuid, name, section.description, JSON.stringify(section.data)),
      );
    }
    if (sectionBatch.length > 0) {
      await env.DB.batch(sectionBatch);
    }

    // FTS index
    await indexSaveSections(env.DB, saveUuid, saveName, sections);
  }

  return { saveUuid };
}
