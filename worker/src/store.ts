/**
 * Save storage pipeline — shared between the push API and adapter refresh.
 *
 * storePush upserts a save in D1 (metadata + sections) and indexes sections in FTS.
 */

import { providerForGame } from "./adapters/providers";
import { ingestMatchHistory } from "./magic/ingest";
import { MANIFESTS } from "./mcp/manifests.gen.js";
import type { Env } from "./types";

export function resolveGameName(gameId: string): string {
  return MANIFESTS.get(gameId)?.name ?? gameId;
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

/**
 * Build the atomic batch for an existing save's update path: save/source
 * metadata, FTS rows rebuilt only for the incoming (delta) sections — since
 * the daemon routinely sends partial pushes, untouched sections' FTS rows
 * must survive — plus stale-section cleanup (sections + their FTS rows)
 * driven by allSectionNames. `search_index` is FTS5 with save_id
 * UNINDEXED, so every IN/NOT-IN over ref_id is a full per-save scan; when
 * allSectionNames is present, incoming rows to delete-and-reinsert and
 * stale rows to purge are collapsed into a single NOT-IN scan instead of
 * two, since incoming is always a subset of allSectionNames: the rows to
 * delete are exactly those NOT IN (allSectionNames \ incoming) — i.e. not
 * among the untouched, still-current sections. Every IN/NOT-IN over
 * section names uses json_each(?) to stay under D1's ~100 bound-parameter
 * limit.
 */
function buildUpdateBatch(
  db: D1Database,
  saveUuid: string,
  saveName: string,
  summary: string,
  parsedAt: string,
  sourceUuid: string,
  sections: Record<string, SectionInput>,
  allSectionNames?: string[],
): D1PreparedStatement[] {
  const incomingNames = Object.keys(sections);

  const batch: D1PreparedStatement[] = [
    db
      .prepare(
        "UPDATE saves SET summary = ?, last_updated = ?, last_source_uuid = ? WHERE uuid = ?",
      )
      .bind(summary, parsedAt, sourceUuid, saveUuid),
    db
      .prepare("UPDATE sources SET last_push_at = datetime('now') WHERE source_uuid = ?")
      .bind(sourceUuid),
  ];

  if (allSectionNames && allSectionNames.length > 0) {
    const untouched = allSectionNames.filter((name) => !Object.hasOwn(sections, name));
    batch.push(
      db
        .prepare(
          `DELETE FROM search_index WHERE save_id = ? AND type = 'section' AND ref_id NOT IN (SELECT value FROM json_each(?))`,
        )
        .bind(saveUuid, JSON.stringify(untouched)),
    );
  } else if (incomingNames.length > 0) {
    batch.push(
      db
        .prepare(
          `DELETE FROM search_index WHERE save_id = ? AND type = 'section' AND ref_id IN (SELECT value FROM json_each(?))`,
        )
        .bind(saveUuid, JSON.stringify(incomingNames)),
    );
  }

  batch.push(...buildSectionStatements(db, saveUuid, saveName, sections));

  // Delete stale sections no longer produced by the plugin. Their FTS rows
  // were already removed by the NOT-IN scan above.
  if (allSectionNames && allSectionNames.length > 0) {
    batch.push(
      db
        .prepare(
          `DELETE FROM sections WHERE save_uuid = ? AND name NOT IN (SELECT value FROM json_each(?))`,
        )
        .bind(saveUuid, JSON.stringify(allSectionNames)),
    );
  }

  return batch;
}

/**
 * Run game-specific post-push hooks. Called from BOTH the insert and
 * update paths after the save + sections are committed (so `saveUuid`
 * exists for FK-bound side tables). `extra` carries adapter-only,
 * out-of-section data (e.g. PoE's PoB XML + refreshed GGG tokens)
 * threaded from gameState.identity.extra — it never enters a section
 * or the FTS index.
 */
async function postPushHooks(
  db: D1Database,
  gameId: string,
  userUuid: string | null,
  sections: Record<string, SectionInput>,
  saveUuid: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  if (gameId === "magic" && userUuid) {
    await ingestMatchHistory(db, userUuid, sections);
  }
  if (extra) {
    await persistAdapterRefreshArtifacts(db, gameId, userUuid, saveUuid, extra);
  }
}

interface RefreshedProviderCreds {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

/**
 * Persist adapter refresh side effects that must not live in a section:
 * PoE's and PoE2's content-addressed PoB/PoB2 build snapshots (raw XML,
 * re-fed to pob-server /calc on eviction — one table per game, mirroring
 * the poe_passive_nodes/poe2_passive_nodes convention) and any provider
 * tokens refreshed in-adapter during fetchState, for ANY adapter game
 * (poe, poe2, and future ones) — persisted into the shared
 * provider_credentials row via providerForGame(gameId), so a rotation
 * from either game keeps the row current for its siblings.
 */
async function persistAdapterRefreshArtifacts(
  db: D1Database,
  gameId: string,
  userUuid: string | null,
  saveUuid: string,
  extra: Record<string, unknown>,
): Promise<void> {
  if (gameId === "poe") {
    const buildId = extra.pobBuildId;
    const xml = extra.pobXml;
    if (typeof buildId === "string" && typeof xml === "string") {
      await db
        .prepare(
          `INSERT OR REPLACE INTO poe_build_snapshot (save_uuid, pob_build_id, pob_xml, imported_at)
           VALUES (?, ?, ?, datetime('now'))`,
        )
        .bind(saveUuid, buildId, xml)
        .run();
    }
  }

  if (gameId === "poe2") {
    const buildId = extra.pobBuildId;
    const xml = extra.pobXml;
    if (typeof buildId === "string" && typeof xml === "string") {
      await db
        .prepare(
          `INSERT OR REPLACE INTO poe2_build_snapshot (save_uuid, pob_build_id, pob_xml, imported_at)
           VALUES (?, ?, ?, datetime('now'))`,
        )
        .bind(saveUuid, buildId, xml)
        .run();
    }
  }

  const refreshed = extra.refreshedCreds as RefreshedProviderCreds | undefined;
  if (refreshed && userUuid) {
    await db
      .prepare(
        `UPDATE provider_credentials
         SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = datetime('now')
         WHERE user_uuid = ? AND provider = ?`,
      )
      .bind(
        refreshed.accessToken,
        refreshed.refreshToken,
        refreshed.expiresAt,
        userUuid,
        providerForGame(gameId),
      )
      .run();
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
  extra?: Record<string, unknown>,
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
    const gameName = resolveGameName(gameId);
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
    await postPushHooks(env.DB, gameId, userUuid, sections, saveUuid, extra);
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

  const batch = buildUpdateBatch(
    env.DB,
    saveUuid,
    saveName,
    summary,
    parsedAt,
    sourceUuid,
    sections,
    allSectionNames,
  );

  await env.DB.batch(batch);
  await postPushHooks(env.DB, gameId, userUuid, sections, saveUuid, extra);
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
