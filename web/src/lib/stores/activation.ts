import { fetchSourceConfig, saveSourceConfig } from "$lib/api/client";
import { detectOS } from "$lib/platform";
import { discoveredGames } from "$lib/stores/discovery";
import { plugins } from "$lib/stores/plugins";
import { get } from "svelte/store";

export async function activateGame(sourceId: string, gameId: string): Promise<void> {
  const existing = await fetchSourceConfig(sourceId);
  const plugin = get(plugins).get(gameId);
  const discovered = get(discoveredGames).get(gameId);
  const os = detectOS();

  existing[gameId] = {
    savePath: discovered?.path ?? plugin?.default_paths[os] ?? "",
    enabled: true,
    fileExtensions: plugin?.file_extensions ?? [],
  };

  await saveSourceConfig(sourceId, existing);
}
