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

  it("cleans up all FK-dependent tables (notes, search_index, source_events, source_configs)", async () => {
    const sourceUuid = "orphan-full";
    const saveUuid = "save-full-1";
    const noteId = "note-full-1";

    await insertSource({ sourceUuid, createdAt: daysAgo(10), lastPushAt: null });

    // Create a save
    await env.DB.prepare(
      "INSERT INTO saves (uuid, source_uuid, game_id, save_name) VALUES (?, ?, ?, ?)",
    )
      .bind(saveUuid, sourceUuid, "d2r", "Hammerdin")
      .run();

    // Create a note for the save
    await env.DB.prepare(
      "INSERT INTO notes (note_id, save_id, user_uuid, title, content, source) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(noteId, saveUuid, "orphan-user", "Build Guide", "Hammerdin guide content", "user")
      .run();

    // Create search index entries
    await env.DB.prepare(
      "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(saveUuid, "Hammerdin", "section", "skills", "Skills", '{"hammers": 20}')
      .run();
    await env.DB.prepare(
      "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(saveUuid, "Hammerdin", "note", noteId, "Build Guide", "Hammerdin guide content")
      .run();

    // Create source_events
    await env.DB.prepare(
      "INSERT INTO source_events (user_uuid, source_uuid, event_type, event_data) VALUES (?, ?, ?, ?)",
    )
      .bind("orphan-user", sourceUuid, "sourceOnline", '{"sourceOnline":{}}')
      .run();

    // Create source_configs
    await env.DB.prepare(
      "INSERT INTO source_configs (user_uuid, source_uuid, game_id, save_path, enabled, file_extensions) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind("orphan-user", sourceUuid, "d2r", "/saves/d2r", 1, '[".d2s"]')
      .run();

    // Seed R2 data
    await env.SAVES.put(`sources/${sourceUuid}/saves/${saveUuid}/latest.json`, "{}");

    const result = await reapOrphanSources(env.DB, env.SAVES);
    expect(result.deleted).toBe(1);

    // Verify ALL tables are cleaned
    expect(
      await env.DB.prepare("SELECT 1 FROM sources WHERE source_uuid = ?").bind(sourceUuid).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM saves WHERE uuid = ?").bind(saveUuid).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM notes WHERE note_id = ?").bind(noteId).first(),
    ).toBeNull();
    const searchCount = await env.DB.prepare("SELECT COUNT(*) as cnt FROM search_index WHERE save_id = ?").bind(saveUuid).first<{ cnt: number }>();
    expect(searchCount?.cnt).toBe(0);
    expect(
      await env.DB.prepare("SELECT 1 FROM source_events WHERE source_uuid = ?").bind(sourceUuid).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 FROM source_configs WHERE source_uuid = ?").bind(sourceUuid).first(),
    ).toBeNull();

    // R2 also cleaned
    const listed = await env.SAVES.list({ prefix: `sources/${sourceUuid}/` });
    expect(listed.objects).toHaveLength(0);
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
