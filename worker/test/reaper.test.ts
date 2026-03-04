import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { reapOrphanSources } from "../src/reaper";

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

    const result = await reapOrphanSources(env.DB, env.SAVES);
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

    const result = await reapOrphanSources(env.DB, env.SAVES);
    expect(result.deleted).toBe(1);
  });

  it("preserves unlinked source with recent push", async () => {
    await insertSource({
      sourceUuid: "active-unlinked",
      createdAt: daysAgo(10),
      lastPushAt: daysAgo(1),
    });

    const result = await reapOrphanSources(env.DB, env.SAVES);
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

    const result = await reapOrphanSources(env.DB, env.SAVES);
    expect(result.deleted).toBe(0);
  });

  it("preserves newly created unlinked source (< 7 days old)", async () => {
    await insertSource({
      sourceUuid: "fresh-source",
      createdAt: daysAgo(2),
      lastPushAt: null,
    });

    const result = await reapOrphanSources(env.DB, env.SAVES);
    expect(result.deleted).toBe(0);
  });

  it("cleans up R2 data for reaped sources", async () => {
    await insertSource({
      sourceUuid: "orphan-r2",
      createdAt: daysAgo(10),
      lastPushAt: null,
    });

    // Seed R2 data under this source
    await env.SAVES.put("sources/orphan-r2/saves/save-1/latest.json", "{}");
    await env.SAVES.put("sources/orphan-r2/saves/save-1/snapshots/2026-01-01.json", "{}");

    await reapOrphanSources(env.DB, env.SAVES);

    const listed = await env.SAVES.list({ prefix: "sources/orphan-r2/" });
    expect(listed.objects).toHaveLength(0);
  });

  it("deletes saves belonging to reaped source", async () => {
    await insertSource({
      sourceUuid: "orphan-saves",
      createdAt: daysAgo(10),
      lastPushAt: null,
    });

    await env.DB.prepare(
      "INSERT INTO saves (uuid, source_uuid, game_id, save_name) VALUES (?, ?, ?, ?)",
    )
      .bind("save-uuid-1", "orphan-saves", "d2r", "Hammerdin")
      .run();

    await reapOrphanSources(env.DB, env.SAVES);

    const save = await env.DB.prepare("SELECT 1 FROM saves WHERE uuid = ?")
      .bind("save-uuid-1")
      .first();
    expect(save).toBeNull();
  });

  it("handles multiple orphans in one run", async () => {
    await insertSource({ sourceUuid: "orphan-a", createdAt: daysAgo(10) });
    await insertSource({ sourceUuid: "orphan-b", createdAt: daysAgo(15) });
    await insertSource({
      sourceUuid: "keep-me",
      userUuid: "linked-user",
      createdAt: daysAgo(10),
    });

    const result = await reapOrphanSources(env.DB, env.SAVES);
    expect(result.deleted).toBe(2);

    const remaining = await env.DB.prepare("SELECT source_uuid FROM sources").all<{
      source_uuid: string;
    }>();
    expect(remaining.results).toHaveLength(1);
    expect(remaining.results[0]!.source_uuid).toBe("keep-me");
  });
});
