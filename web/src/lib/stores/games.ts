import type { MergedGame, MergedSave, Source } from "$lib/types/source";

/** Flatten sources into a game-centric list, merging saves across sources by gameId. */
export function mergeGames(sources: Source[]): MergedGame[] {
  const map = new Map<string, { name: string; saves: MergedSave[]; sourceIds: Set<string> }>();

  for (const source of sources) {
    for (const game of source.games) {
      let entry = map.get(game.gameId);
      if (!entry) {
        entry = { name: game.name, saves: [], sourceIds: new Set() };
        map.set(game.gameId, entry);
      }
      entry.sourceIds.add(source.id);

      for (const save of game.saves) {
        entry.saves.push({
          ...save,
          sourceId: source.id,
          sourceName: source.name,
        });
      }
    }
  }

  const result: MergedGame[] = [];
  for (const [gameId, entry] of map) {
    const count = entry.saves.length;
    const statusLine =
      count === 0 ? "No saves" : count === 1 ? "1 save" : `${String(count)} saves`;

    result.push({
      gameId,
      name: entry.name,
      statusLine,
      saves: entry.saves,
      sourceCount: entry.sourceIds.size,
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
