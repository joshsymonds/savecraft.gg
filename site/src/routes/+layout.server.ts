import { discoverPlugins } from "$lib/server/plugins";

export function load() {
  return {
    gameIds: discoverPlugins().map((game) => game.gameId),
  };
}
