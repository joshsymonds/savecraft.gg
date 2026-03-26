#!/usr/bin/env node
/**
 * Run vitest in parallel shards. Each shard gets its own process with its own
 * Miniflare instance, bypassing the isolatedStorage WAL bug while achieving
 * true file-level parallelism.
 *
 * Usage: node scripts/test-sharded.mjs [--shards=N]
 */
import { spawn } from "node:child_process";

const SHARD_COUNT = parseInt(
  process.argv.find((a) => a.startsWith("--shards="))?.split("=")[1] ?? "4",
  10,
);

/** Strip ANSI escape sequences for regex matching. */
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** @param {number} index @param {number} total */
function runShard(index, total) {
  return new Promise((resolve) => {
    const args = ["vitest", "run", `--shard=${index}/${total}`, "--reporter=basic"];
    const child = spawn("npx", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    child.on("close", (code) => {
      resolve({ index, code, stdout, stderr });
    });
  });
}

const start = Date.now();
const results = await Promise.all(
  Array.from({ length: SHARD_COUNT }, (_, i) => runShard(i + 1, SHARD_COUNT)),
);
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

let totalFiles = 0;
let totalTests = 0;
let failed = false;

for (const { index, code, stdout, stderr } of results) {
  const plain = stripAnsi(stdout);
  const filesMatch = plain.match(/Test Files\s+(\d+) passed \((\d+)\)/);
  const testsMatch = plain.match(/Tests\s+(?:\d+ failed \| )?(\d+) passed \((\d+)\)/);

  if (code !== 0) {
    failed = true;
    console.error(`\n--- Shard ${index}/${SHARD_COUNT} FAILED (exit ${code}) ---`);
    console.error(stdout);
    if (stderr.trim()) console.error(stderr);
  } else {
    const files = filesMatch ? filesMatch[2] : "?";
    const tests = testsMatch ? testsMatch[2] : "?";
    console.log(`  shard ${index}/${SHARD_COUNT}: ${files} files, ${tests} tests ✓`);
  }

  if (filesMatch) totalFiles += parseInt(filesMatch[2], 10);
  if (testsMatch) totalTests += parseInt(testsMatch[2], 10);
}

console.log(`\n  ${totalFiles} files, ${totalTests} tests in ${elapsed}s (${SHARD_COUNT} shards)`);

if (failed) process.exit(1);
