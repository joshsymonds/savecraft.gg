import path from "node:path";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Each test file runs serially within its shard (fileParallelism: false),
// but `npm test` (which routes through scripts/test-sharded.mjs) launches
// N vitest processes in parallel, each with its own Miniflare. File-level
// parallelism within a single shard process is unsafe under
// vitest-pool-workers: that pool spins up exactly
// one Miniflare per pool worker, so concurrent files share a workerd
// isolate. A DO I/O object created in one test bleeds across the file
// boundary and crashes the next test with "Cannot perform I/O on behalf
// of a different Durable Object". File parallelism comes from the N
// separate vitest processes the shard runner launches, not from vitest
// itself.
//
// SHARD_INDEX (set by test-sharded.mjs) isolates Vite's dependency
// optimization cache per shard. Without this, parallel shards race on
// node_modules/.vite/ — one shard's dep-optimization write changes the
// hashes another shard's Vite uses to resolve imports in src/index.ts,
// causing workerd to see different transformed content and break the
// input gate (inputGateBroken), invalidating all live DO stubs.
// eslint-disable-next-line -- vitest config runs in Node.js
declare const process: { env: Record<string, string | undefined> };
const shardIndex = process.env.SHARD_INDEX;

export default defineConfig({
  cacheDir: shardIndex ? `node_modules/.vite-shard-${shardIndex}` : undefined,
  // Vite (under Vitest) does not honor tsconfig paths by default; mirror the
  // worker tsconfig's @savecraft/content/* alias here so test imports resolve.
  // Production builds via Wrangler / esbuild DO honor tsconfig paths natively.
  resolve: {
    alias: {
      "@savecraft/content": path.resolve(import.meta.dirname, "../shared/content"),
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.toml" },
      miniflare: {
        bindings: {
          CLERK_ISSUER: "",
          ADMIN_API_KEY: "test-admin-key-secret",
          // Effectively disable natural alarm activity in tests. Alarm
          // tests fire the alarm deterministically via runDurableObjectAlarm()
          // and `ageLastSeenAndFireAlarm()` — no test relies on alarms
          // firing on the wall clock. Keeping the interval/threshold short
          // produced cascading "Application called abortAllDurableObjects()"
          // exceptions from in-flight alarms during afterEach teardown,
          // which slowed every subsequent test in the file dramatically.
          STALE_THRESHOLD_MS: 600_000,
          ALARM_INTERVAL_MS: 600_000,
        },
        kvNamespaces: ["OAUTH_KV"],
      },
    }),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
    // Scope discovery to ./test/. Vitest's default `include` is **/*.test.ts
    // which traverses .devenv/profile/lib/packages/ (the nix-managed
    // dev-environment profile under worker/) and picks up bundled upstream
    // package tests — including one with a literal ♫ in its path, which
    // breaks miniflare's HeadersInit construction (undici ByteString rejects
    // any character > 255 in a Request header value).
    include: ["test/**/*.test.ts"],
    // v0.13.0+ removed `singleWorker` and `isolatedStorage` options. The new
    // pool runs ONE Miniflare per vitest process; cross-test isolation comes
    // from per-test unique sourceUuid/userUuid plus the CLEANUP_TABLES
    // baseline reset in test/setup.ts. Files must run serially within a
    // shard (see top-of-file comment) — parallelism is achieved at the
    // shard level by scripts/test-sharded.mjs spawning N vitest processes.
    fileParallelism: false,
  },
});
