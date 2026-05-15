/**
 * Registry for native reference modules.
 *
 * Modules are registered at import time (top-level, not per-request).
 * The registry is consulted by queryReference before falling back to
 * Workers for Platforms dispatch.
 */

import { VISUAL_MODULES } from "../mcp/views.gen.js";

import type { ListedReferenceModule, NativeReferenceModule } from "./types";

/** gameId → moduleId → module */
const registry = new Map<string, Map<string, NativeReferenceModule>>();

/** Register a native reference module for a game. */
export function registerNativeModule(gameId: string, module: NativeReferenceModule): void {
  let gameModules = registry.get(gameId);
  if (!gameModules) {
    gameModules = new Map();
    registry.set(gameId, gameModules);
  }
  gameModules.set(module.id, module);
}

/** Look up a native module by game and module ID. */
export function getNativeModule(
  gameId: string,
  moduleId: string,
): NativeReferenceModule | undefined {
  return registry.get(gameId)?.get(moduleId);
}

/**
 * Get all native module metadata for a game (for list_games).
 *
 * Projects the internal `id` onto the wire key `module` so the listing names
 * the identifier exactly what query_reference's `module` argument expects.
 */
export function getNativeModules(gameId: string): ListedReferenceModule[] {
  const gameModules = registry.get(gameId);
  if (!gameModules) return [];
  return [...gameModules.values()].map(({ id, name, description, parameters, example }) => ({
    module: id,
    name,
    description,
    parameters,
    example,
    visual: VISUAL_MODULES.has(id),
  }));
}

/** Get all game IDs that have native modules registered. */
export function getNativeGameIds(): string[] {
  return [...registry.keys()];
}

/** Clear all registrations (for tests). */
export function clearNativeRegistry(): void {
  registry.clear();
}
