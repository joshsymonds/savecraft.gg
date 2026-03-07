/**
 * Save storage pipeline — shared between the push API and adapter refresh.
 *
 * storePush upserts a save in D1 (metadata + sections), stores snapshots in R2
 * (temporarily, until MCP tools are migrated to D1), and indexes sections in FTS.
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
  bodyString: string,
  sections: Record<string, SectionInput>,
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

  // Write snapshot to R2 (temporary — removed when MCP tools migrate to D1)
  const snapshotKey = `saves/${saveUuid}/snapshots/${parsedAt}.json`;
  await env.SAVES.put(snapshotKey, bodyString);

  const latestKey = `saves/${saveUuid}/latest.json`;
  const isNewer = await isNewerThanLatest(env.SAVES, latestKey, parsedAt);
  if (isNewer) {
    // R2 latest (temporary — removed when MCP tools migrate to D1)
    await env.SAVES.put(latestKey, bodyString, { customMetadata: { parsedAt } });

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
