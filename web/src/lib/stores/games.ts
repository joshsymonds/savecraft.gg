import type { PluginManifest } from "$lib/api/client";
import type { Game, GameSourceEntry, PickerGame, Save, Source } from "$lib/types/source";

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

/** Build the game picker catalog from plugin manifests and the current merged game list. */
export function buildPickerCatalog(
  plugins: Map<string, PluginManifest>,
  mergedGames: Game[],
): PickerGame[] {
  const watchedIds = new Set(mergedGames.map((g) => g.gameId));
  const result: PickerGame[] = [];
  for (const [gameId, manifest] of plugins) {
    const merged = mergedGames.find((g) => g.gameId === gameId);
    const isApi = manifest.source === "api";
    const isModule = manifest.source === "mod";
    let description: string;
    if (isApi) {
      description = manifest.name;
    } else if (isModule) {
      description = manifest.description;
    } else if (manifest.file_extensions?.length) {
      description = `Parses ${manifest.file_extensions.join(", ")} files`;
    } else {
      description = manifest.description;
    }
    result.push({
      gameId,
      name: manifest.name,
      iconUrl: manifest.icon_url,
      description,
      watched: watchedIds.has(gameId),
      saveCount: merged?.saves.length ?? 0,
      defaultPaths: manifest.default_paths,
      isApiGame: isApi || undefined,
      workshopUrl: manifest.workshop_url,
      adapter: manifest.adapter,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
