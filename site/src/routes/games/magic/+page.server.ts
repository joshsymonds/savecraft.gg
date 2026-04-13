import { loadPlugin } from "$lib/server/plugins";

export function load() {
  const game = loadPlugin("magic");
  return { game };
}
