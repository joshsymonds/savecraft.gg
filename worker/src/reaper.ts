/**
 * Orphan source reaper.
 *
 * Deletes sources that are unlinked (user_uuid IS NULL) and have had no push
 * activity for 7+ days. Also cleans up associated source-level data and
 * SourceHub Durable Objects (closes connections, deletes alarms, wipes storage).
 *
 * Saves are user-scoped (keyed by user_uuid, not source_uuid), so orphan
 * sources never have saves to clean up — unlinked sources cannot push saves.
 */

import type { Env } from "./types";

const ORPHAN_THRESHOLD_DAYS = 7;

export async function reapOrphanSources(env: Env): Promise<{ deleted: number }> {
  const threshold = `-${String(ORPHAN_THRESHOLD_DAYS)} days`;

  // Find orphan sources: unlinked, old enough, no recent push
  const orphans = await env.DB
    .prepare(
      `SELECT source_uuid FROM sources
       WHERE user_uuid IS NULL
         AND created_at < datetime('now', ?)
         AND (last_push_at IS NULL OR last_push_at < datetime('now', ?))`,
    )
    .bind(threshold, threshold)
    .all<{ source_uuid: string }>();

  if (orphans.results.length === 0) {
    return { deleted: 0 };
  }

  for (const orphan of orphans.results) {
    // Clean up SourceHub DO (close connections, delete alarm, wipe storage)
    const sourceHubId = env.SOURCE_HUB.idFromName(orphan.source_uuid);
    const sourceHubStub = env.SOURCE_HUB.get(sourceHubId);
    await sourceHubStub.fetch(
      new Request("https://do/cleanup", { method: "POST" }),
    );

    // Delete source-level D1 tables
    await env.DB
      .prepare("DELETE FROM source_events WHERE source_uuid = ?")
      .bind(orphan.source_uuid)
      .run();
    await env.DB
      .prepare("DELETE FROM source_configs WHERE source_uuid = ?")
      .bind(orphan.source_uuid)
      .run();

    // Delete the source itself
    await env.DB.prepare("DELETE FROM sources WHERE source_uuid = ?").bind(orphan.source_uuid).run();
  }

  return { deleted: orphans.results.length };
}
