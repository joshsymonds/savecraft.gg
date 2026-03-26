import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Each test file runs serially within its shard, but `npm run test:shard`
// launches N vitest processes in parallel (each with its own Miniflare).
// This sidesteps Miniflare's isolatedStorage WAL bug while giving us true
// file-level parallelism across shards.
export default defineWorkersConfig({
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
