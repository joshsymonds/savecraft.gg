/**
 * Orchestrates adapter save discovery and D1 reconciliation.
 *
 * Composes adapter.discoverSaves() (per-game API call) with
 * reconcileCharacters() (generic D1 lifecycle), then syncs the active
 * save set into the SourceHub DO so the dashboard lists the characters
 * immediately (summaries fill on refresh_save). Single entrypoint used
 * by the OAuth callback, MCP refresh, and scheduled refresh.
 */

import type { ApiAdapter } from "./adapter";
import { reconcileCharacters, type ReconcileResult } from "./reconcile";

interface DiscoverEnv {
  DB: D1Database;
  SOURCE_HUB: DurableObjectNamespace;
}

export async function discoverAndReconcileSaves(
  adapter: ApiAdapter,
  env: DiscoverEnv,
  accessToken: string,
  region: string,
  userUuid: string,
  sourceUuid: string,
): Promise<ReconcileResult> {
  const discovered = await adapter.discoverSaves(accessToken, region);
  const result = await reconcileCharacters(
    env,
    userUuid,
    adapter.gameId,
    sourceUuid,
    adapter.gameName,
    discovered,
  );

  // Reflect the ACTIVE characters as named saves in the live source
  // state. reconcile owns D1; the dashboard renders the SourceHub DO,
  // which only learns of saves via a push (Req 5 discovery is
  // summary-less, so reconcile alone never reaches the DO). reconcile
  // soft-deletes a vanished/renamed character by setting
  // linked_characters.active=0 only — the saves row survives — so the
  // sync MUST be gated on an active linked_character or a deleted
  // character re-appears on the dashboard. Name match mirrors the
  // adapter-refresh cron (WoW save_name is "Name-realm-REGION").
  const saves = await env.DB.prepare(
    `SELECT s.uuid, s.save_name FROM saves s
     WHERE s.user_uuid = ? AND s.game_id = ?
       AND EXISTS (
         SELECT 1 FROM linked_characters lc
         WHERE lc.user_uuid = s.user_uuid AND lc.game_id = s.game_id
           AND lc.source_uuid = ? AND lc.active = 1
           AND lc.character_name = CASE
                 WHEN INSTR(s.save_name, '-') > 0
                   THEN SUBSTR(s.save_name, 1, INSTR(s.save_name, '-') - 1)
                 ELSE s.save_name
               END
       )`,
  )
    .bind(userUuid, adapter.gameId, sourceUuid)
    .all<{ uuid: string; save_name: string }>();

  if (saves.results.length > 0) {
    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    await env.SOURCE_HUB.get(doId).fetch(
      new Request("https://do/sync-discovered-saves", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Source-UUID": sourceUuid,
          "X-User-UUID": userUuid,
        },
        body: JSON.stringify({
          gameId: adapter.gameId,
          saves: saves.results.map((s) => ({ saveUuid: s.uuid, name: s.save_name })),
        }),
      }),
    );
  }

  return result;
}
