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

  // Reflect the active characters as named saves in the live source
  // state. reconcile owns D1; the dashboard renders the SourceHub DO,
  // which only learns of saves via a push (Req 5 discovery is
  // summary-less, so reconcile alone never reaches the DO).
  const saves = await env.DB.prepare(
    "SELECT uuid, save_name FROM saves WHERE user_uuid = ? AND game_id = ?",
  )
    .bind(userUuid, adapter.gameId)
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
