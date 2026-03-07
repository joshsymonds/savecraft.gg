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

function prepareNewCharacterStatements(
  db: D1Database,
  userUuid: string,
  gameId: string,
  sourceUuid: string,
  gameName: string,
  disc: DiscoveredSave,
): D1PreparedStatement[] {
  // Create save if it doesn't exist (ON CONFLICT DO NOTHING avoids extra query)
  const saveUuid = crypto.randomUUID();

  return [
    db
      .prepare(
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
      ),
    db
      .prepare(
        `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid)
         VALUES (?, ?, ?, ?, ?, '', datetime('now'), ?)
         ON CONFLICT(user_uuid, game_id, save_name) DO NOTHING`,
      )
      .bind(saveUuid, userUuid, gameId, gameName, disc.saveName, sourceUuid),
  ];
}

function prepareExistingCharacterStatements(
  db: D1Database,
  userUuid: string,
  gameId: string,
  ex: ExistingCharacter,
  disc: DiscoveredSave,
  result: ReconcileResult,
): D1PreparedStatement[] {
  if (ex.active === 0) {
    result.reactivated.push(disc.characterId);
    return [
      db
        .prepare(
          `UPDATE linked_characters SET active = 1, character_name = ?, metadata = ?
           WHERE user_uuid = ? AND game_id = ? AND character_id = ?`,
        )
        .bind(disc.displayName, JSON.stringify(disc.metadata), userUuid, gameId, disc.characterId),
    ];
  }

  if (ex.character_name !== disc.displayName) {
    result.renamed.push(disc.characterId);
  }

  // Update metadata (handles both rename and silent metadata updates like transfers/level)
  return [
    db
      .prepare(
        `UPDATE linked_characters SET character_name = ?, metadata = ?
         WHERE user_uuid = ? AND game_id = ? AND character_id = ?`,
      )
      .bind(disc.displayName, JSON.stringify(disc.metadata), userUuid, gameId, disc.characterId),
  ];
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

  const batch: D1PreparedStatement[] = [];

  // Process discovered characters
  for (const disc of discovered) {
    const ex = existingMap.get(disc.characterId);
    if (ex) {
      batch.push(...prepareExistingCharacterStatements(env.DB, userUuid, gameId, ex, disc, result));
    } else {
      batch.push(
        ...prepareNewCharacterStatements(env.DB, userUuid, gameId, sourceUuid, gameName, disc),
      );
      result.added.push(disc.characterId);
    }
  }

  // Deactivate characters not in discovery results (only active ones)
  for (const [charId, ex] of existingMap) {
    if (ex.active === 1 && !discoveredMap.has(charId)) {
      batch.push(
        env.DB.prepare(
          "UPDATE linked_characters SET active = 0 WHERE user_uuid = ? AND game_id = ? AND character_id = ?",
        ).bind(userUuid, gameId, charId),
      );
      result.deactivated.push(charId);
    }
  }

  if (batch.length > 0) {
    await env.DB.batch(batch);
  }

  return result;
}
