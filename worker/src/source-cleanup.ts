import { providerForGame } from "./adapters/providers";
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

  // Adapter teardown: linked_characters are keyed by source, credentials
  // by (user, provider). Deleting an adapter source disconnects every
  // adapter game it served, so clear both. No-op for daemon sources (no
  // linked_characters rows).
  //
  // findOrCreateAdapterSource ensures at most one adapter source per
  // user, so a source's linked_characters cover EVERY adapter game that
  // user has — including every sibling game sharing a provider (e.g.
  // poe + poe2 both on ggg). Deleting every provider row touched by
  // this source's games is therefore always the "last game" case, safe
  // even when a provider backs more than one game: there's no other
  // adapter source left for this user where a sibling's
  // linked_characters could still be alive.
  const adapterGames = await env.DB.prepare(
    "SELECT DISTINCT game_id FROM linked_characters WHERE source_uuid = ?",
  )
    .bind(sourceUuid)
    .all<{ game_id: string }>();
  const adapterCleanup: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM linked_characters WHERE source_uuid = ?").bind(sourceUuid),
  ];
  if (userUuid) {
    const providers = new Set(adapterGames.results.map((row) => providerForGame(row.game_id)));
    for (const provider of providers) {
      adapterCleanup.push(
        env.DB.prepare(
          "DELETE FROM provider_credentials WHERE user_uuid = ? AND provider = ?",
        ).bind(userUuid, provider),
      );
    }
  }
  await env.DB.batch(adapterCleanup);

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
