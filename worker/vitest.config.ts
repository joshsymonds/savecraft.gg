import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Each test file runs serially within its shard, but `npm run test:shard`
// launches N vitest processes in parallel (each with its own Miniflare).
// This sidesteps Miniflare's isolatedStorage WAL bug while giving us true
// file-level parallelism across shards.
//
// SHARD_INDEX (set by test-sharded.mjs) isolates Vite's dependency
// optimization cache per shard.  Without this, parallel shards race on
// node_modules/.vite/ — one shard's dep-optimization write changes the
// hashes another shard's Vite uses to resolve imports in src/index.ts,
// causing workerd to see different transformed content and break the
// input gate (inputGateBroken), invalidating all live DO stubs.
// eslint-disable-next-line -- vitest config runs in Node.js
declare const process: { env: Record<string, string | undefined> };
const shardIndex = process.env.SHARD_INDEX;

export default defineWorkersConfig({
  cacheDir: shardIndex ? `node_modules/.vite-shard-${shardIndex}` : undefined,
  test: {
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    poolOptions: {
      workers: {
        singleWorker: true,
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            CLERK_ISSUER: "",
            ADMIN_API_KEY: "test-admin-key-secret",
            STALE_THRESHOLD_MS: 200,
            ALARM_INTERVAL_MS: 100,
          },
          kvNamespaces: ["OAUTH_KV"],
        },
        isolatedStorage: false,
      },
    },
  },
});
