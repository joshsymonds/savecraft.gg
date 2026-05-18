/**
 * Periodic adapter source refresh.
 *
 * Queries D1 for all adapter saves due for refresh, fetches fresh game state
 * via the appropriate adapter, and stores the result. Runs every 15 minutes
 * via cron trigger.
 */

import { ADAPTER_REFRESH_COOLDOWN_SEC, AdapterError } from "../adapters/adapter";
import { adapters } from "../adapters/registry";
import { resolveAdapterCharacter } from "../adapters/resolve-character";
import { pushGameStatus } from "../index";
import { storePush } from "../store";
import type { Env } from "../types";

const BATCH_LIMIT = 50;

/** Single-query row with save, linked character, and credentials pre-joined. */
interface RefreshRow {
  save_uuid: string;
  save_name: string;
  game_id: string;
  source_uuid: string;
  user_uuid: string;
  // linked_characters
  character_id: string;
  character_name: string;
  metadata: string | null;
  // game_credentials
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

export async function refreshAdapterSources(env: Env): Promise<void> {
  const cooldownSeconds = ADAPTER_REFRESH_COOLDOWN_SEC;

  // Single query joins saves + sources + linked_characters + game_credentials,
  // eliminating per-save D1 round-trips. Rows without a linked character or
  // credentials are excluded by the INNER JOINs.
  const rows = await env.DB.prepare(
    `SELECT s.uuid AS save_uuid, s.save_name, s.game_id, s.last_source_uuid AS source_uuid,
            src.user_uuid,
            lc.character_id, lc.character_name, lc.metadata,
            gc.access_token, gc.refresh_token, gc.expires_at
     FROM saves s
     JOIN sources src ON s.last_source_uuid = src.source_uuid
     JOIN linked_characters lc
       ON lc.user_uuid = src.user_uuid AND lc.game_id = s.game_id
          AND lc.source_uuid = src.source_uuid AND lc.active = 1
          AND lc.character_name = CASE
                WHEN INSTR(s.save_name, '-') > 0
                  THEN SUBSTR(s.save_name, 1, INSTR(s.save_name, '-') - 1)
                ELSE s.save_name
              END
     JOIN game_credentials gc
       ON gc.user_uuid = src.user_uuid AND gc.game_id = s.game_id
     WHERE src.source_kind = 'adapter'
       AND src.user_uuid IS NOT NULL
       AND (s.last_updated IS NULL OR s.last_updated < datetime('now', ?))
     ORDER BY s.last_updated ASC
     LIMIT ?`,
  )
    .bind(`-${String(cooldownSeconds)} seconds`, BATCH_LIMIT)
    .all<RefreshRow>();

  // Saves are user-isolated — refresh in parallel for better wall-clock time.
  await Promise.allSettled(rows.results.map((row) => refreshOneSave(env, row)));
}

async function refreshOneSave(env: Env, row: RefreshRow): Promise<void> {
  const adapter = adapters[row.game_id];
  if (!adapter) return;

  const resolved = resolveAdapterCharacter({
    character_id: row.character_id,
    character_name: row.character_name,
    metadata: row.metadata,
  });
  if (!resolved) return;

  try {
    const gameState = await adapter.fetchState(
      {
        characterId: resolved.characterId,
        characterName: resolved.characterName,
        region: resolved.region,
        metadata: resolved.metadata,
        credentials: {
          accessToken: row.access_token,
          refreshToken: row.refresh_token ?? undefined,
          expiresAt: row.expires_at ?? undefined,
        },
      },
      env,
    );

    const parsedAt = new Date().toISOString();

    await storePush(
      env,
      row.user_uuid,
      row.source_uuid,
      row.game_id,
      gameState.identity.saveName,
      gameState.summary,
      parsedAt,
      gameState.sections,
      undefined,
      gameState.identity.extra,
    );

    // Record success
    await env.DB.prepare(
      "UPDATE saves SET refresh_status = 'ok', refresh_error = NULL WHERE uuid = ?",
    )
      .bind(row.save_uuid)
      .run();

    // Update SourceHub state
    await pushGameStatus(
      env,
      row.source_uuid,
      row.user_uuid,
      row.game_id,
      adapter.gameName,
      "watching",
    );
  } catch (error) {
    let message = "Unknown error";
    if (error instanceof AdapterError) {
      message = `${error.code}: ${error.message}`;
    } else if (error instanceof Error) {
      message = error.message;
    }

    // Truncate to prevent unbounded third-party error messages in D1/MCP responses
    const truncated = message.length > 500 ? `${message.slice(0, 497)}...` : message;

    // Record failure
    await env.DB.prepare(
      "UPDATE saves SET refresh_status = 'error', refresh_error = ? WHERE uuid = ?",
    )
      .bind(truncated, row.save_uuid)
      .run();

    // Update SourceHub state with error — message flows to dashboard via proto
    await pushGameStatus(
      env,
      row.source_uuid,
      row.user_uuid,
      row.game_id,
      adapter.gameName,
      "error",
      truncated,
    );
  }
}
