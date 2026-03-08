/**
 * Orchestrates adapter save discovery and D1 reconciliation.
 *
 * Composes adapter.discoverSaves() (per-game API call) with
 * reconcileCharacters() (generic D1 lifecycle). Provides a single
 * entrypoint used by OAuth callback, MCP refresh, and scheduled refresh.
 */

import type { ApiAdapter } from "./adapter";
import { reconcileCharacters, type ReconcileResult } from "./reconcile";

export async function discoverAndReconcileSaves(
  adapter: ApiAdapter,
  env: { DB: D1Database },
  accessToken: string,
  region: string,
  userUuid: string,
  sourceUuid: string,
): Promise<ReconcileResult> {
  const discovered = await adapter.discoverSaves(accessToken, region);
  return reconcileCharacters(
    env,
    userUuid,
    adapter.gameId,
    sourceUuid,
    adapter.gameName,
    discovered,
  );
}
