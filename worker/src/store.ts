/**
 * Save storage pipeline — shared between the push API and adapter refresh.
 *
 * storePush upserts a save in D1 (metadata + sections) and indexes sections in FTS.
 */

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
    // Combine metadata update, section upserts, and FTS indexing into one batch
    const batch: D1PreparedStatement[] = [
      env.DB.prepare(
        "UPDATE saves SET summary = ?, last_updated = ?, last_source_uuid = ? WHERE uuid = ?",
      ).bind(summary, parsedAt, sourceUuid, saveUuid),
      env.DB.prepare(
        "UPDATE sources SET last_push_at = datetime('now') WHERE source_uuid = ?",
      ).bind(sourceUuid),
    ];

    for (const [name, section] of Object.entries(sections)) {
      batch.push(
        env.DB.prepare(
          "INSERT OR REPLACE INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
        ).bind(saveUuid, name, section.description, JSON.stringify(section.data)),
      );
    }

    // FTS: delete old section entries, insert new ones
    batch.push(
      env.DB.prepare("DELETE FROM search_index WHERE save_id = ? AND type = 'section'").bind(
        saveUuid,
      ),
    );
    for (const [name, section] of Object.entries(sections)) {
      batch.push(
        env.DB.prepare(
          "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, 'section', ?, ?, ?)",
        ).bind(saveUuid, saveName, name, section.description, JSON.stringify(section.data)),
      );
    }

    await env.DB.batch(batch);
  }

  return { saveUuid };
}
