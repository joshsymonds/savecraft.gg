/**
 * Character lifecycle reconciliation.
 *
 * Compares freshly discovered characters from discoverSaves() against
 * existing linked_characters rows, handling:
 * - New characters: insert + create save
 * - Renamed characters: update character_name (stable numeric ID unchanged)
 * - Transferred characters: update metadata (realm/region)
 * - Deleted characters: soft-delete (active=0), preserve save history
 * - Reactivated characters: set active=1 for previously deleted characters
 */

import type { DiscoveredSave } from "./adapter";

export interface ReconcileResult {
  added: string[];
  renamed: string[];
  deactivated: string[];
  reactivated: string[];
}

interface ExistingCharacter {
  character_id: string;
  character_name: string;
  metadata: string | null;
  active: number;
}

async function handleNewCharacter(
  env: { DB: D1Database },
  userUuid: string,
  gameId: string,
  sourceUuid: string,
  gameName: string,
  disc: DiscoveredSave,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO linked_characters (user_uuid, game_id, character_id, character_name, metadata, source_uuid, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
  )
    .bind(
      userUuid,
      gameId,
      disc.characterId,
      disc.displayName,
      JSON.stringify(disc.metadata),
      sourceUuid,
    )
    .run();

  // Create save if it doesn't exist
  const existingSave = await env.DB.prepare(
    "SELECT uuid FROM saves WHERE user_uuid = ? AND game_id = ? AND save_name = ?",
  )
    .bind(userUuid, gameId, disc.saveName)
    .first<{ uuid: string }>();

  if (!existingSave) {
    const saveUuid = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid)
       VALUES (?, ?, ?, ?, ?, '', datetime('now'), ?)`,
    )
      .bind(saveUuid, userUuid, gameId, gameName, disc.saveName, sourceUuid)
      .run();
  }
}

async function handleExistingCharacter(
  env: { DB: D1Database },
  userUuid: string,
  gameId: string,
  ex: ExistingCharacter,
  disc: DiscoveredSave,
  result: ReconcileResult,
): Promise<void> {
  if (ex.active === 0) {
    // Reactivate
    await env.DB.prepare(
      `UPDATE linked_characters SET active = 1, character_name = ?, metadata = ?
       WHERE user_uuid = ? AND game_id = ? AND character_id = ?`,
    )
      .bind(disc.displayName, JSON.stringify(disc.metadata), userUuid, gameId, disc.characterId)
      .run();
    result.reactivated.push(disc.characterId);
  } else if (ex.character_name === disc.displayName) {
    // Update metadata silently (transfers, level changes, etc.)
    await env.DB.prepare(
      `UPDATE linked_characters SET metadata = ?
       WHERE user_uuid = ? AND game_id = ? AND character_id = ?`,
    )
      .bind(JSON.stringify(disc.metadata), userUuid, gameId, disc.characterId)
      .run();
  } else {
    // Renamed
    await env.DB.prepare(
      `UPDATE linked_characters SET character_name = ?, metadata = ?
       WHERE user_uuid = ? AND game_id = ? AND character_id = ?`,
    )
      .bind(disc.displayName, JSON.stringify(disc.metadata), userUuid, gameId, disc.characterId)
      .run();
    result.renamed.push(disc.characterId);
  }
}

export async function reconcileCharacters(
  env: { DB: D1Database },
  userUuid: string,
  gameId: string,
  sourceUuid: string,
  gameName: string,
  discovered: DiscoveredSave[],
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    added: [],
    renamed: [],
    deactivated: [],
    reactivated: [],
  };

  // Fetch all existing linked_characters for this user+game
  const existing = await env.DB.prepare(
    "SELECT character_id, character_name, metadata, active FROM linked_characters WHERE user_uuid = ? AND game_id = ?",
  )
    .bind(userUuid, gameId)
    .all<ExistingCharacter>();

  const existingMap = new Map(existing.results.map((r) => [r.character_id, r]));
  const discoveredMap = new Map(discovered.map((d) => [d.characterId, d]));

  // Process discovered characters
  for (const disc of discovered) {
    const ex = existingMap.get(disc.characterId);

    if (ex) {
      await handleExistingCharacter(env, userUuid, gameId, ex, disc, result);
    } else {
      await handleNewCharacter(env, userUuid, gameId, sourceUuid, gameName, disc);
      result.added.push(disc.characterId);
    }
  }

  // Deactivate characters not in discovery results (only active ones)
  for (const [charId, ex] of existingMap) {
    if (ex.active === 1 && !discoveredMap.has(charId)) {
      await env.DB.prepare(
        "UPDATE linked_characters SET active = 0 WHERE user_uuid = ? AND game_id = ? AND character_id = ?",
      )
        .bind(userUuid, gameId, charId)
        .run();

      result.deactivated.push(charId);
    }
  }

  return result;
}
