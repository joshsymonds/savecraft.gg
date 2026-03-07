import type { Game, GameSourceEntry, Save, Source } from "$lib/types/source";

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
