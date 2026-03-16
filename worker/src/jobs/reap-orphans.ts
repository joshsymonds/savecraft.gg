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

import { cleanupSource } from "../index";
import type { Env } from "../types";

const ORPHAN_THRESHOLD_DAYS = 7;
const REAPER_BATCH_LIMIT = 100;

export async function reapOrphanSources(env: Env): Promise<{ deleted: number }> {
  const threshold = `-${String(ORPHAN_THRESHOLD_DAYS)} days`;

  // Find orphan sources: unlinked, old enough, no recent push
  const orphans = await env.DB.prepare(
    `SELECT source_uuid FROM sources
       WHERE user_uuid IS NULL
         AND created_at < datetime('now', ?)
         AND (last_push_at IS NULL OR last_push_at < datetime('now', ?))
       LIMIT ?`,
  )
    .bind(threshold, threshold, REAPER_BATCH_LIMIT)
    .all<{ source_uuid: string }>();

  if (orphans.results.length === 0) {
    return { deleted: 0 };
  }

  for (const orphan of orphans.results) {
    await cleanupSource(env, orphan.source_uuid, null);
  }

  return { deleted: orphans.results.length };
}
