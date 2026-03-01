import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    env: {
      dir: "..",
    },
    version: {
      name: Date.now().toString(),
      pollInterval: 60_000,
    },
  },
};

export default config;
