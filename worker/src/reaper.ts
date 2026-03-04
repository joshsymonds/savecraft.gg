/**
 * Orphan source reaper.
 *
 * Deletes sources that are unlinked (user_uuid IS NULL) and have had no push
 * activity for 7+ days. Also cleans up associated saves and R2 data.
 */

const ORPHAN_THRESHOLD_DAYS = 7;

export async function reapOrphanSources(
  db: D1Database,
  saves: R2Bucket,
): Promise<{ deleted: number }> {
  const threshold = `-${String(ORPHAN_THRESHOLD_DAYS)} days`;

  // Find orphan sources: unlinked, old enough, no recent push
  const orphans = await db
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
    // Clean up R2 data
    const listed = await saves.list({ prefix: `sources/${orphan.source_uuid}/` });
    for (const object of listed.objects) {
      await saves.delete(object.key);
    }

    // Delete saves belonging to this source
    await db.prepare("DELETE FROM saves WHERE source_uuid = ?").bind(orphan.source_uuid).run();

    // Delete the source itself
    await db.prepare("DELETE FROM sources WHERE source_uuid = ?").bind(orphan.source_uuid).run();
  }

  return { deleted: orphans.results.length };
}
