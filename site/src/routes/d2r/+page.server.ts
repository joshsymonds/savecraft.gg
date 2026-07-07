import { loadPlugin } from "$lib/server/plugins";

export function load() {
  return {
    game: loadPlugin("d2r"),
  };
}
