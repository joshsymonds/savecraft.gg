/**
 * Orphan device reaper.
 *
 * Deletes devices that are unlinked (user_uuid IS NULL) and have had no push
 * activity for 7+ days. Also cleans up associated saves and R2 data.
 */

const ORPHAN_THRESHOLD_DAYS = 7;

export async function reapOrphanDevices(
  db: D1Database,
  saves: R2Bucket,
): Promise<{ deleted: number }> {
  const threshold = `-${String(ORPHAN_THRESHOLD_DAYS)} days`;

  // Find orphan devices: unlinked, old enough, no recent push
  const orphans = await db
    .prepare(
      `SELECT device_uuid FROM devices
       WHERE user_uuid IS NULL
         AND created_at < datetime('now', ?)
         AND (last_push_at IS NULL OR last_push_at < datetime('now', ?))`,
    )
    .bind(threshold, threshold)
    .all<{ device_uuid: string }>();

  if (orphans.results.length === 0) {
    return { deleted: 0 };
  }

  for (const orphan of orphans.results) {
    // Clean up R2 data
    const listed = await saves.list({ prefix: `devices/${orphan.device_uuid}/` });
    for (const object of listed.objects) {
      await saves.delete(object.key);
    }

    // Delete saves belonging to this device
    await db.prepare("DELETE FROM saves WHERE device_uuid = ?").bind(orphan.device_uuid).run();

    // Delete the device itself
    await db.prepare("DELETE FROM devices WHERE device_uuid = ?").bind(orphan.device_uuid).run();
  }

  return { deleted: orphans.results.length };
}
