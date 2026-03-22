import { discoverPlugins } from "$lib/server/plugins";

export function load() {
  return {
    availableGames: discoverPlugins(),
  };
}
