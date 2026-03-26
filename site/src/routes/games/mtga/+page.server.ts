import { loadPlugin } from "$lib/server/plugins";

export function load() {
  const game = loadPlugin("mtga");
  return { game };
}
