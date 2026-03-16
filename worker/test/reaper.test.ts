import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { reapOrphanSources } from "../src/jobs/reap-orphans";

import { cleanAll } from "./helpers";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function insertSource(options: {
  sourceUuid: string;
  userUuid?: string | null;
  createdAt: string;
  lastPushAt?: string | null;
}): Promise<void> {
  const tokenHash = await sha256Hex(`sct_${options.sourceUuid}`);
  await env.DB.prepare(
    `INSERT INTO sources (source_uuid, user_uuid, token_hash, created_at, last_push_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      options.sourceUuid,
      options.userUuid ?? null,
      tokenHash,
      options.createdAt,
      options.lastPushAt ?? null,
    )
    .run();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

describe("Orphan Source Reaper", () => {
  beforeEach(cleanAll);

  it("deletes unlinked source with no push older than 7 days", async () => {
    await insertSource({
      sourceUuid: "orphan-1",
      createdAt: daysAgo(10),
      lastPushAt: null,
    });

    const result = await reapOrphanSources(env);
    expect(result.deleted).toBe(1);

    const row = await env.DB.prepare("SELECT 1 FROM sources WHERE source_uuid = ?")
      .bind("orphan-1")
      .first();
    expect(row).toBeNull();
  });

  it("deletes unlinked source with stale push older than 7 days", async () => {
    await insertSource({
      sourceUuid: "stale-push",
      createdAt: daysAgo(14),
      lastPushAt: daysAgo(8),
    });

    const result = await reapOrphanSources(env);
    expect(result.deleted).toBe(1);
  });

  it("preserves unlinked source with recent push", async () => {
    await insertSource({
      sourceUuid: "active-unlinked",
      createdAt: daysAgo(10),
      lastPushAt: daysAgo(1),
    });

    const result = await reapOrphanSources(env);
    expect(result.deleted).toBe(0);

    const row = await env.DB.prepare("SELECT 1 FROM sources WHERE source_uuid = ?")
      .bind("active-unlinked")
      .first();
    expect(row).not.toBeNull();
  });

  it("preserves linked source regardless of push activity", async () => {
    await insertSource({
      sourceUuid: "linked-stale",
      userUuid: "some-user",
      createdAt: daysAgo(30),
      lastPushAt: daysAgo(20),
    });

    const result = await reapOrphanSources(env);
    expect(result.deleted).toBe(0);
  });

  it("preserves newly created unlinked source (< 7 days old)", async () => {
    await insertSource({
      sourceUuid: "fresh-source",
      createdAt: daysAgo(2),
      lastPushAt: null,
    });

    const result = await reapOrphanSources(env);
    expect(result.deleted).toBe(0);
  });

  it("cleans up source_events and source_configs for reaped sources", async () => {
    const sourceUuid = "orphan-full";

    await insertSource({ sourceUuid, createdAt: daysAgo(10), lastPushAt: null });

    // Create source_events
    await env.DB.prepare(
      "INSERT INTO source_events (source_uuid, event_type, event_data) VALUES (?, ?, ?)",
    )
      .bind(sourceUuid, "sourceOnline", '{"sourceOnline":{}}')
      .run();

    // Create source_configs
    await env.DB.prepare(
      "INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(sourceUuid, "d2r", "/saves/d2r", 1, '[".d2s"]')
      .run();

    const result = await reapOrphanSources(env);
    expect(result.deleted).toBe(1);

    // Verify source-level tables are cleaned
    expect(
      await env.DB.prepare("SELECT 1 FROM sources WHERE source_uuid = ?").bind(sourceUuid).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM source_events WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM source_configs WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first(),
    ).toBeNull();
  });

  it("handles multiple orphans in one run", async () => {
    await insertSource({ sourceUuid: "orphan-a", createdAt: daysAgo(10) });
    await insertSource({ sourceUuid: "orphan-b", createdAt: daysAgo(15) });
    await insertSource({
      sourceUuid: "keep-me",
      userUuid: "linked-user",
      createdAt: daysAgo(10),
    });

    const result = await reapOrphanSources(env);
    expect(result.deleted).toBe(2);

    const remaining = await env.DB.prepare("SELECT source_uuid FROM sources").all<{
      source_uuid: string;
    }>();
    expect(remaining.results).toHaveLength(1);
    expect(remaining.results[0]!.source_uuid).toBe("keep-me");
  });
});
