import type { PluginManifest } from "$lib/api/client";
import type {
  ConnectionMethod,
  Game,
  GameSourceEntry,
  PickerGame,
  Save,
  Source,
} from "$lib/types/source";

/** Flatten sources into a game-centric list, merging saves across sources by gameId. */
export function mergeGames(sources: Source[]): Game[] {
  const map = new Map<
    string,
    { name: string; saves: Save[]; sourceIds: Set<string>; sourceEntries: GameSourceEntry[] }
  >();

  for (const source of sources) {
    for (const game of source.games) {
      let entry = map.get(game.gameId);
      if (!entry) {
        entry = { name: game.name, saves: [], sourceIds: new Set(), sourceEntries: [] };
        map.set(game.gameId, entry);
      }
      entry.sourceIds.add(source.id);
      entry.sourceEntries.push({
        sourceId: source.id,
        sourceName: source.name,
        hostname: source.hostname,
        sourceKind: source.sourceKind,
        status: game.status,
        path: game.path,
        error: game.error,
        saveCount: game.saves.length,
      });

      for (const save of game.saves) {
        entry.saves.push({
          ...save,
          sourceId: source.id,
          sourceName: source.name,
        });
      }
    }
  }

  const result: Game[] = [];
  for (const [gameId, entry] of map) {
    const count = entry.saves.length;
    let statusLine: string;
    if (count === 0) {
      statusLine = "No saves";
    } else if (count === 1) {
      statusLine = "1 save";
    } else {
      statusLine = `${String(count)} saves`;
    }

    const needsConfig = entry.sourceEntries.some(
      (s) => s.status === "not_found" || s.status === "error",
    );

    result.push({
      gameId,
      name: entry.name,
      statusLine,
      saves: entry.saves,
      sourceCount: entry.sourceIds.size,
      sources: entry.sourceEntries,
      needsConfig,
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

/**
 * Classify how a game can be connected, from the manifest the server
 * actually sends (`adapter` block + `sources` array). The legacy
 * singular `manifest.source` is dead and intentionally ignored — using
 * it is the bug that hid every adapter game (WoW, PoE) from the picker.
 *
 * - adapter block present            → "adapter" (OAuth, no install)
 * - sources includes "wasm"          → "daemon"  (local save files)
 * - sources includes "mod" / workshop→ "mod"     (game mod / Workshop)
 * - none of the above                → "reference" (works with no setup)
 *
 * Hybrid games return multiple (e.g. Factorio → ["daemon","mod"]).
 */
export function connectionMethods(manifest: PluginManifest): ConnectionMethod[] {
  const methods: ConnectionMethod[] = [];
  const sources = manifest.sources ?? [];
  if (manifest.adapter) methods.push("adapter");
  if (sources.includes("wasm")) methods.push("daemon");
  if (sources.includes("mod") || manifest.workshop_url) methods.push("mod");
  if (methods.length === 0) methods.push("reference");
  return methods;
}

/**
 * Build the unified game picker catalog (#17). Every supported game in
 * the manifest is included — the catalog IS the supported-games list;
 * reference-only games are "ready, no setup", not hidden. Each game
 * carries its connection methods so the picker renders the right action
 * per tile.
 */
export function buildPickerCatalog(
  plugins: Map<string, PluginManifest>,
  mergedGames: Game[],
): PickerGame[] {
  const watchedIds = new Set(mergedGames.map((g) => g.gameId));
  const result: PickerGame[] = [];
  for (const [gameId, manifest] of plugins) {
    const merged = mergedGames.find((g) => g.gameId === gameId);
    const methods = connectionMethods(manifest);
    const description = manifest.file_extensions?.length
      ? `Parses ${manifest.file_extensions.join(", ")} files`
      : manifest.description;
    result.push({
      gameId,
      name: manifest.name,
      iconUrl: manifest.icon_url,
      description,
      watched: watchedIds.has(gameId),
      saveCount: merged?.saves.length ?? 0,
      defaultPaths: manifest.default_paths,
      isApiGame: methods.includes("adapter") || undefined,
      workshopUrl: manifest.workshop_url,
      adapter: manifest.adapter,
      methods,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
