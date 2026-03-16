import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { dispatch } from "../src/jobs/dispatch";

import { cleanAll } from "./helpers";

describe("Job Dispatcher", () => {
  beforeEach(cleanAll);

  it("dispatches reaper job for daily cron pattern", async () => {
    // Insert an orphan source that the reaper should delete
    const data = new TextEncoder().encode("sct_orphan-dispatch-test");
    const hash = await crypto.subtle.digest("SHA-256", data);
    const tokenHash = [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await env.DB.prepare(
      `INSERT INTO sources (source_uuid, user_uuid, token_hash, created_at, last_push_at)
       VALUES (?, NULL, ?, ?, NULL)`,
    )
      .bind("orphan-dispatch-test", tokenHash, tenDaysAgo)
      .run();

    await dispatch("0 4 * * *", env);

    const row = await env.DB.prepare("SELECT 1 FROM sources WHERE source_uuid = ?")
      .bind("orphan-dispatch-test")
      .first();
    expect(row).toBeNull();
  });

  it("dispatches adapter refresh job for 15-minute cron pattern", async () => {
    // No adapter saves seeded — verifies the cron pattern routes to the job
    // without error. Functional refresh coverage is in adapter-refresh-job.test.ts.
    await expect(dispatch("*/15 * * * *", env)).resolves.toBeUndefined();
  });

  it("throws for unknown cron pattern", async () => {
    await expect(dispatch("unknown-pattern", env)).rejects.toThrow("unknown-pattern");
  });
});
