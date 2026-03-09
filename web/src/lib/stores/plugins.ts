import { fetchPluginManifest, type PluginManifest } from "$lib/api/client";
import { type Readable, writable } from "svelte/store";

const { subscribe, set } = writable<Map<string, PluginManifest>>(new Map());

export const plugins: Readable<Map<string, PluginManifest>> = { subscribe };

/** Seed the store directly (for tests and Storybook). */
export function setPlugins(manifest: Record<string, PluginManifest>): void {
  set(new Map(Object.entries(manifest)));
}

export async function loadPlugins(): Promise<void> {
  try {
    const manifest = await fetchPluginManifest();
    set(new Map(Object.entries(manifest)));
  } catch {
    // Non-fatal — UI can still function with fallback names
  }
}

let pluginSnapshot = new Map<string, PluginManifest>();
subscribe((value) => {
  pluginSnapshot = value;
});

/**
 * Look up game display name from manifest, falling back to the raw gameId.
 */
export function gameDisplayName(gameId: string): string {
  return pluginSnapshot.get(gameId)?.name ?? gameId;
}
