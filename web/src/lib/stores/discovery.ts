import type { WireGamesDiscovered } from "$lib/types/wire";
import { writable, type Readable } from "svelte/store";

export interface DiscoveredGame {
  gameId: string;
  name: string;
  path: string;
  fileCount: number;
}

const { subscribe, set } = writable<Map<string, DiscoveredGame>>(new Map());

export const discoveredGames: Readable<Map<string, DiscoveredGame>> = { subscribe };

export function setDiscoveredGames(data: WireGamesDiscovered): void {
  const map = new Map<string, DiscoveredGame>();
  for (const game of data.games ?? []) {
    if (game.gameId) {
      map.set(game.gameId, {
        gameId: game.gameId,
        name: game.name ?? game.gameId,
        path: game.path ?? "",
        fileCount: game.fileCount ?? 0,
      });
    }
  }
  set(map);
}
