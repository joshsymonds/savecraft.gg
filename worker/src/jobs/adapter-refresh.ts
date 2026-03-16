/**
 * Periodic adapter source refresh.
 *
 * Queries D1 for all adapter saves due for refresh, fetches fresh game state
 * via the appropriate adapter, and stores the result. Runs every 15 minutes
 * via cron trigger.
 */

import { ADAPTER_REFRESH_COOLDOWN_SEC, AdapterError } from "../adapters/adapter";
import { adapters } from "../adapters/registry";
import { resolveCharacterContext } from "../adapters/resolve-character";
import { pushGameStatus } from "../index";
import { storePush } from "../store";
import type { Env } from "../types";

const BATCH_LIMIT = 50;

interface AdapterSaveRow {
  save_uuid: string;
  save_name: string;
  game_id: string;
  source_uuid: string;
  user_uuid: string;
  last_updated: string | null;
}

interface LinkedCharRow {
  character_name: string;
  metadata: string | null;
}

interface CredentialRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

export async function refreshAdapterSources(env: Env): Promise<void> {
  const cooldownSeconds = ADAPTER_REFRESH_COOLDOWN_SEC;

  // Find adapter saves due for refresh, joining through sources to filter by source_kind.
  // Cooldown is enforced in SQL to avoid fetching rows we'd skip anyway.
  const rows = await env.DB.prepare(
    `SELECT s.uuid AS save_uuid, s.save_name, s.game_id, s.last_source_uuid AS source_uuid,
            src.user_uuid, s.last_updated
     FROM saves s
     JOIN sources src ON s.last_source_uuid = src.source_uuid
     WHERE src.source_kind = 'adapter'
       AND src.user_uuid IS NOT NULL
       AND (s.last_updated IS NULL OR s.last_updated < datetime('now', ?))
     LIMIT ?`,
  )
    .bind(`-${String(cooldownSeconds)} seconds`, BATCH_LIMIT)
    .all<AdapterSaveRow>();

  for (const row of rows.results) {
    await refreshOneSave(env, row);
  }
}

async function refreshOneSave(env: Env, row: AdapterSaveRow): Promise<void> {
  const adapter = adapters[row.game_id];
  if (!adapter) return;

  // Look up linked character
  const linkedChar = await env.DB.prepare(
    `SELECT character_name, metadata
     FROM linked_characters
     WHERE user_uuid = ? AND game_id = ? AND source_uuid = ? AND active = 1
     AND character_name = ?`,
  )
    .bind(row.user_uuid, row.game_id, row.source_uuid, row.save_name.split("-")[0] ?? "")
    .first<LinkedCharRow>();

  if (!linkedChar) return;

  const ctx = resolveCharacterContext(linkedChar, row.save_name);
  if (!ctx.realmSlug) return;

  // Look up credentials
  const creds = await env.DB.prepare(
    "SELECT access_token, refresh_token, expires_at FROM game_credentials WHERE user_uuid = ? AND game_id = ?",
  )
    .bind(row.user_uuid, row.game_id)
    .first<CredentialRow>();

  if (!creds) return;

  try {
    const gameState = await adapter.fetchState(
      {
        characterId: `${ctx.realmSlug}/${ctx.characterName}`,
        region: ctx.region,
        credentials: {
          accessToken: creds.access_token,
          refreshToken: creds.refresh_token ?? undefined,
          expiresAt: creds.expires_at ?? undefined,
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
    );

    // Record success
    await env.DB.prepare(
      "UPDATE saves SET refresh_status = 'ok', refresh_error = NULL WHERE uuid = ?",
    )
      .bind(row.save_uuid)
      .run();

    // Update SourceHub state
    await pushGameStatus(env, row.source_uuid, row.user_uuid, row.game_id, adapter.gameName, "watching");
  } catch (error) {
    const message =
      error instanceof AdapterError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unknown error";

    // Record failure
    await env.DB.prepare(
      "UPDATE saves SET refresh_status = 'error', refresh_error = ? WHERE uuid = ?",
    )
      .bind(message, row.save_uuid)
      .run();

    // Update SourceHub state with error
    await pushGameStatus(env, row.source_uuid, row.user_uuid, row.game_id, adapter.gameName, "error");
  }
}
