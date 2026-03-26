/**
 * Save storage pipeline — shared between the push API and adapter refresh.
 *
 * storePush upserts a save in D1 (metadata + sections) and indexes sections in FTS.
 */

import { ingestMatchHistory } from "./mtga/ingest";
import type { Env } from "./types";

/** Per-isolate cache for game name lookups — avoids R2 read on every new save. */
const gameNameCache = new Map<string, { name: string; fetchedAt: number }>();
const GAME_NAME_CACHE_TTL_MS = 5 * 60_000; // 5 minutes

export async function resolveGameName(plugins: R2Bucket, gameId: string): Promise<string> {
  const cached = gameNameCache.get(gameId);
  if (cached && Date.now() - cached.fetchedAt < GAME_NAME_CACHE_TTL_MS) return cached.name;
  const manifest = await plugins.get(`plugins/${gameId}/manifest.json`);
  if (!manifest) return gameId;
  const data = await manifest.json<{ name?: string }>();
  const name = data.name ?? gameId;
  gameNameCache.set(gameId, { name, fetchedAt: Date.now() });
  return name;
}

export interface SectionInput {
  description: string;
  data: Record<string, unknown>;
}

function buildSectionStatements(
  db: D1Database,
  saveUuid: string,
  saveName: string,
  sections: Record<string, SectionInput>,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (const [name, section] of Object.entries(sections)) {
    const dataJson = JSON.stringify(section.data);
    statements.push(
      db
        .prepare(
          "INSERT OR REPLACE INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
        )
        .bind(saveUuid, name, section.description, dataJson),
      db
        .prepare(
          "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, 'section', ?, ?, ?)",
        )
        .bind(saveUuid, saveName, name, section.description, dataJson),
    );
  }
  return statements;
}

/** Run game-specific post-push hooks (e.g., MTGA match history extraction). */
async function postPushHooks(
  db: D1Database,
  gameId: string,
  userUuid: string | null,
  sections: Record<string, SectionInput>,
): Promise<void> {
  if (gameId === "mtga" && userUuid) {
    await ingestMatchHistory(db, userUuid, sections);
  }
}

export async function storePush(
  env: Env,
  userUuid: string | null,
  sourceUuid: string,
  gameId: string,
  saveName: string,
  summary: string,
  parsedAt: string,
  sections: Record<string, SectionInput>,
  allSectionNames?: string[],
): Promise<{ saveUuid: string; changed: boolean }> {
  // Linked sources dedup by (user_uuid, game_id, save_name).
  // Unlinked sources dedup by (last_source_uuid, game_id, save_name) where user_uuid IS NULL.
  const existingSave = userUuid
    ? await env.DB.prepare(
        "SELECT uuid, last_updated, summary FROM saves WHERE user_uuid = ? AND game_id = ? AND save_name = ?",
      )
        .bind(userUuid, gameId, saveName)
        .first<{ uuid: string; last_updated: string; summary: string }>()
    : await env.DB.prepare(
        "SELECT uuid, last_updated, summary FROM saves WHERE last_source_uuid = ? AND user_uuid IS NULL AND game_id = ? AND save_name = ?",
      )
        .bind(sourceUuid, gameId, saveName)
        .first<{ uuid: string; last_updated: string; summary: string }>();

  if (!existingSave) {
    const saveUuid = crypto.randomUUID();
    const gameName = await resolveGameName(env.PLUGINS, gameId);
    await env.DB.prepare(
      "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(saveUuid, userUuid, gameId, gameName, saveName, summary, parsedAt, sourceUuid)
      .run();
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE sources SET last_push_at = datetime('now') WHERE source_uuid = ?",
      ).bind(sourceUuid),
      ...buildSectionStatements(env.DB, saveUuid, saveName, sections),
    ]);
    await postPushHooks(env.DB, gameId, userUuid, sections);
    return { saveUuid, changed: true };
  }

  const saveUuid = existingSave.uuid;

  if (parsedAt <= existingSave.last_updated) {
    return { saveUuid, changed: false };
  }

  // For existing saves, compare incoming data to stored data — skip write if identical.
  if (existingSave.summary === summary) {
    const storedSections = await env.DB.prepare(
      "SELECT name, description, data FROM sections WHERE save_uuid = ?",
    )
      .bind(saveUuid)
      .all<{ name: string; description: string; data: string }>();

    if (sectionsMatch(storedSections.results, sections)) {
      return { saveUuid, changed: false };
    }
  }

  const batch: D1PreparedStatement[] = [
    env.DB.prepare(
      "UPDATE saves SET summary = ?, last_updated = ?, last_source_uuid = ? WHERE uuid = ?",
    ).bind(summary, parsedAt, sourceUuid, saveUuid),
    env.DB.prepare("UPDATE sources SET last_push_at = datetime('now') WHERE source_uuid = ?").bind(
      sourceUuid,
    ),
    env.DB.prepare("DELETE FROM search_index WHERE save_id = ? AND type = 'section'").bind(
      saveUuid,
    ),
    ...buildSectionStatements(env.DB, saveUuid, saveName, sections),
  ];

  // Delete stale sections no longer produced by the plugin.
  if (allSectionNames && allSectionNames.length > 0) {
    const placeholders = allSectionNames.map(() => "?").join(", ");
    batch.push(
      env.DB.prepare(
        `DELETE FROM sections WHERE save_uuid = ? AND name NOT IN (${placeholders})`,
      ).bind(saveUuid, ...allSectionNames),
    );
  }

  await env.DB.batch(batch);
  if (gameId === "mtga" && userUuid) {
    await ingestMatchHistory(env.DB, userUuid, sections);
  }
  return { saveUuid, changed: true };
}

/**
 * Compare incoming sections against their stored counterparts.
 * Only incoming sections are checked — missing stored sections (partial push)
 * are treated as unchanged, not as a mismatch.
 */
function sectionsMatch(
  stored: { name: string; description: string; data: string }[],
  incoming: Record<string, SectionInput>,
): boolean {
  const storedByName = new Map(stored.map((s) => [s.name, s]));

  for (const [name, section] of Object.entries(incoming)) {
    const s = storedByName.get(name);
    if (!s) return false; // new section not in stored → changed
    if (s.description !== section.description) return false;
    if (s.data !== JSON.stringify(section.data)) return false;
  }
  return true;
}

/**
 * Reconcile orphan saves when a source links to a user.
 * Adopts saves with user_uuid IS NULL from this source, deduplicating
 * against any existing saves the user already has (newer wins).
 */
export async function reconcileOrphanSaves(
  env: Env,
  sourceUuid: string,
  userUuid: string,
): Promise<void> {
  const orphans = await env.DB.prepare(
    "SELECT uuid, game_id, save_name, last_updated FROM saves WHERE last_source_uuid = ? AND user_uuid IS NULL",
  )
    .bind(sourceUuid)
    .all<{ uuid: string; game_id: string; save_name: string; last_updated: string }>();

  if (orphans.results.length === 0) return;

  // Fetch all existing user saves that could conflict with orphans in one query
  const existingAll = await env.DB.prepare(
    `SELECT uuid, game_id, save_name, last_updated FROM saves
     WHERE user_uuid = ? AND (game_id, save_name) IN (
       SELECT game_id, save_name FROM saves WHERE last_source_uuid = ? AND user_uuid IS NULL
     )`,
  )
    .bind(userUuid, sourceUuid)
    .all<{ uuid: string; game_id: string; save_name: string; last_updated: string }>();

  // Build lookup map keyed by "game_id\0save_name"
  const existingMap = new Map(
    existingAll.results.map((row) => [`${row.game_id}\0${row.save_name}`, row]),
  );

  const batch: D1PreparedStatement[] = [];

  for (const orphan of orphans.results) {
    const existing = existingMap.get(`${orphan.game_id}\0${orphan.save_name}`);

    if (!existing) {
      // No conflict — adopt the orphan
      batch.push(
        env.DB.prepare("UPDATE saves SET user_uuid = ? WHERE uuid = ?").bind(userUuid, orphan.uuid),
      );
    } else if (orphan.last_updated > existing.last_updated) {
      // Orphan is newer — delete existing, adopt orphan
      batch.push(
        env.DB.prepare("DELETE FROM sections WHERE save_uuid = ?").bind(existing.uuid),
        env.DB.prepare("DELETE FROM search_index WHERE save_id = ?").bind(existing.uuid),
        env.DB.prepare("DELETE FROM saves WHERE uuid = ?").bind(existing.uuid),
        env.DB.prepare("UPDATE saves SET user_uuid = ? WHERE uuid = ?").bind(userUuid, orphan.uuid),
      );
    } else {
      // Existing is newer — discard orphan
      batch.push(
        env.DB.prepare("DELETE FROM sections WHERE save_uuid = ?").bind(orphan.uuid),
        env.DB.prepare("DELETE FROM search_index WHERE save_id = ?").bind(orphan.uuid),
        env.DB.prepare("DELETE FROM saves WHERE uuid = ?").bind(orphan.uuid),
      );
    }
  }

  if (batch.length > 0) {
    await env.DB.batch(batch);
  }
}
