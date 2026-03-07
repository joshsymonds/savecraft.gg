/**
 * Save storage pipeline — shared between the push API and adapter refresh.
 *
 * storePush upserts a save in D1, stores snapshots in R2, and indexes
 * sections in FTS. Both the daemon push handler and the MCP refresh_save
 * tool call this function.
 */

import { indexSaveSections } from "./mcp/tools";
import type { Env } from "./types";

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

export async function resolveGameName(plugins: R2Bucket, gameId: string): Promise<string> {
  const manifest = await plugins.get(`plugins/${gameId}/manifest.json`);
  if (!manifest) return gameId;
  const data = await manifest.json<{ name?: string }>();
  return data.name ?? gameId;
}

export async function storePush(
  env: Env,
  userUuid: string,
  sourceUuid: string,
  gameId: string,
  saveName: string,
  summary: string,
  parsedAt: string,
  bodyString: string,
  sections: unknown,
): Promise<{ saveUuid: string }> {
  const existingSave = await env.DB.prepare(
    "SELECT uuid FROM saves WHERE user_uuid = ? AND game_id = ? AND save_name = ?",
  )
    .bind(userUuid, gameId, saveName)
    .first<{ uuid: string }>();

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

  const snapshotKey = `saves/${saveUuid}/snapshots/${parsedAt}.json`;
  await env.SAVES.put(snapshotKey, bodyString);

  const latestKey = `saves/${saveUuid}/latest.json`;
  const isNewer = await isNewerThanLatest(env.SAVES, latestKey, parsedAt);
  if (isNewer) {
    await env.SAVES.put(latestKey, bodyString, { customMetadata: { parsedAt } });
    await env.DB.prepare(
      "UPDATE saves SET summary = ?, last_updated = ?, last_source_uuid = ? WHERE uuid = ?",
    )
      .bind(summary, parsedAt, sourceUuid, saveUuid)
      .run();
    const sectionData = sections as Record<string, { description: string; data: unknown }>;
    await indexSaveSections(env.DB, saveUuid, saveName, sectionData);
  }

  return { saveUuid };
}
