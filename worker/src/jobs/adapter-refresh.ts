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

/**
 * Max simultaneous in-flight refreshes. Each refresh does 2+ sequential
 * GGG calls + a pob-server LuaJIT import, so an unbounded fan-out over
 * BATCH_LIMIT rows self-inflicts GGG 429s and a pob CPU stampede for a
 * single altoholic account. Kept small on purpose.
 */
export const REFRESH_CONCURRENCY = 4;

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
  last_refresh_at: string | null;
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
            gc.access_token, gc.refresh_token, gc.expires_at,
            s.last_refresh_at
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
       AND (s.last_refresh_at IS NULL OR s.last_refresh_at < datetime('now', ?))
     ORDER BY s.last_refresh_at ASC
     LIMIT ?`,
  )
    .bind(`-${String(cooldownSeconds)} seconds`, BATCH_LIMIT)
    .all<RefreshRow>();

  // Saves are user-isolated, but each refresh fires 2+ sequential GGG
  // calls + a pob-server import — refreshing all BATCH_LIMIT rows at
  // once would self-inflict GGG 429s and a pob CPU stampede for one
  // altoholic account. Bound the in-flight count. refreshOneSave never
  // throws (it catches internally), so a plain worker pool is safe.
  await runWithConcurrency(rows.results, REFRESH_CONCURRENCY, (row) => refreshOneSave(env, row));
}

/**
 * Run `worker` over `items` with at most `limit` in flight. Each pool
 * lane pulls the next item until the list is exhausted. Assumes
 * `worker` does not throw (refreshOneSave swallows its own errors).
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => lane()));
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
      "UPDATE saves SET refresh_status = 'ok', refresh_error = NULL, last_refresh_at = datetime('now') WHERE uuid = ?",
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

    // Honor GGG's Retry-After (Req 4). The cron re-selects a row once
    // last_refresh_at is older than the cooldown, so to defer a
    // rate-limited row by `retryAfter` seconds we push last_refresh_at
    // into the future by (retryAfter - cooldown). Without this, a
    // rate-limited cohort all stamp ~now and, with #27's
    // ORDER BY last_refresh_at ASC, reappear together every cooldown
    // window and re-thrash GGG. Non-rate-limit errors keep the normal
    // cooldown (deferSeconds = 0 → datetime('now')).
    const retryAfter =
      error instanceof AdapterError && error.code === "rate_limited" ? (error.retryAfter ?? 0) : 0;
    const deferSeconds = Math.max(0, retryAfter - ADAPTER_REFRESH_COOLDOWN_SEC);

    // Record failure
    await env.DB.prepare(
      "UPDATE saves SET refresh_status = 'error', refresh_error = ?, last_refresh_at = datetime('now', ?) WHERE uuid = ?",
    )
      .bind(truncated, `+${String(deferSeconds)} seconds`, row.save_uuid)
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
