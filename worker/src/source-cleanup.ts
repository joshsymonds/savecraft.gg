import type { Env } from "./types";

/**
 * Fully remove a source: delete the saves it solely owns (+ their
 * notes/sections/search rows), its D1 rows, and clear its Durable
 * Object state (SourceHub storage + UserHub's per-source entry).
 *
 * Shared by source delete/deregister, the reaper, and the admin
 * delete-source route. Lives in its own module so both `index.ts` and
 * `admin/index.ts` can import it without a circular dependency.
 */
export async function cleanupSource(
  env: Env,
  sourceUuid: string,
  userUuid: string | null,
): Promise<void> {
  // Delete saves owned solely by this source.
  // A save is "sole-source" if no OTHER active source in the `sources` table
  // has last_source_uuid pointing to a save with the same identity.
  // Must run BEFORE deleting the sources row (the subquery checks `sources`).
  const savesToDelete = await env.DB.prepare(
    `SELECT uuid FROM saves
     WHERE last_source_uuid = ?
       AND NOT EXISTS (
         SELECT 1 FROM saves s2
         JOIN sources ON sources.source_uuid = s2.last_source_uuid
         WHERE sources.source_uuid != ?
           AND s2.game_id = saves.game_id
           AND s2.save_name = saves.save_name
           AND (s2.user_uuid = saves.user_uuid OR (s2.user_uuid IS NULL AND saves.user_uuid IS NULL))
       )`,
  )
    .bind(sourceUuid, sourceUuid)
    .all<{ uuid: string }>();

  if (savesToDelete.results.length > 0) {
    const uuids = savesToDelete.results.map((r) => r.uuid);
    // Chunk to stay within D1's 100-parameter-per-statement limit
    const CHUNK_SIZE = 50;
    for (let index = 0; index < uuids.length; index += CHUNK_SIZE) {
      const chunk = uuids.slice(index, index + CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(",");
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM search_index WHERE save_id IN (${placeholders})`).bind(
          ...chunk,
        ),
        env.DB.prepare(`DELETE FROM notes WHERE save_id IN (${placeholders})`).bind(...chunk),
        env.DB.prepare(`DELETE FROM sections WHERE save_uuid IN (${placeholders})`).bind(...chunk),
        env.DB.prepare(`DELETE FROM saves WHERE uuid IN (${placeholders})`).bind(...chunk),
      ]);
    }
  }

  // D1 cleanup
  await env.DB.batch([
    env.DB.prepare("DELETE FROM source_events WHERE source_uuid = ?").bind(sourceUuid),
    env.DB.prepare("DELETE FROM source_configs WHERE source_uuid = ?").bind(sourceUuid),
    env.DB.prepare("DELETE FROM sources WHERE source_uuid = ?").bind(sourceUuid),
  ]);

  // Clean up SourceHub DO (close connections, delete alarm, wipe storage)
  const sourceHubId = env.SOURCE_HUB.idFromName(sourceUuid);
  await env.SOURCE_HUB.get(sourceHubId).fetch(
    new Request("https://do/cleanup", { method: "POST" }),
  );

  // Tell UserHub to drop this source's state (only if linked to a user)
  if (userUuid) {
    const userHubId = env.USER_HUB.idFromName(userUuid);
    await env.USER_HUB.get(userHubId).fetch(
      new Request("https://do/remove-source", {
        method: "POST",
        headers: { "X-User-UUID": userUuid },
        body: JSON.stringify({ sourceUuid }),
      }),
    );
  }
}
