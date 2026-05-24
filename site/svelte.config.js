import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: undefined,
      precompress: false,
      strict: true,
    }),
    env: {
      dir: "..",
    },
    alias: {
      "@savecraft/content": "../shared/content",
      "@savecraft/content/*": "../shared/content/*",
    },
  },
};

export default config;
