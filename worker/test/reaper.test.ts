import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { reapOrphanDevices } from "../src/reaper";

import { cleanAll } from "./helpers";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function insertDevice(options: {
  deviceUuid: string;
  userUuid?: string | null;
  createdAt: string;
  lastPushAt?: string | null;
}): Promise<void> {
  const tokenHash = await sha256Hex(`dvt_${options.deviceUuid}`);
  await env.DB.prepare(
    `INSERT INTO devices (device_uuid, user_uuid, token_hash, created_at, last_push_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      options.deviceUuid,
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

describe("Orphan Device Reaper", () => {
  beforeEach(cleanAll);

  it("deletes unlinked device with no push older than 7 days", async () => {
    await insertDevice({
      deviceUuid: "orphan-1",
      createdAt: daysAgo(10),
      lastPushAt: null,
    });

    const result = await reapOrphanDevices(env.DB, env.SAVES);
    expect(result.deleted).toBe(1);

    const row = await env.DB.prepare("SELECT 1 FROM devices WHERE device_uuid = ?")
      .bind("orphan-1")
      .first();
    expect(row).toBeNull();
  });

  it("deletes unlinked device with stale push older than 7 days", async () => {
    await insertDevice({
      deviceUuid: "stale-push",
      createdAt: daysAgo(14),
      lastPushAt: daysAgo(8),
    });

    const result = await reapOrphanDevices(env.DB, env.SAVES);
    expect(result.deleted).toBe(1);
  });

  it("preserves unlinked device with recent push", async () => {
    await insertDevice({
      deviceUuid: "active-unlinked",
      createdAt: daysAgo(10),
      lastPushAt: daysAgo(1),
    });

    const result = await reapOrphanDevices(env.DB, env.SAVES);
    expect(result.deleted).toBe(0);

    const row = await env.DB.prepare("SELECT 1 FROM devices WHERE device_uuid = ?")
      .bind("active-unlinked")
      .first();
    expect(row).not.toBeNull();
  });

  it("preserves linked device regardless of push activity", async () => {
    await insertDevice({
      deviceUuid: "linked-stale",
      userUuid: "some-user",
      createdAt: daysAgo(30),
      lastPushAt: daysAgo(20),
    });

    const result = await reapOrphanDevices(env.DB, env.SAVES);
    expect(result.deleted).toBe(0);
  });

  it("preserves newly created unlinked device (< 7 days old)", async () => {
    await insertDevice({
      deviceUuid: "fresh-device",
      createdAt: daysAgo(2),
      lastPushAt: null,
    });

    const result = await reapOrphanDevices(env.DB, env.SAVES);
    expect(result.deleted).toBe(0);
  });

  it("cleans up R2 data for reaped devices", async () => {
    await insertDevice({
      deviceUuid: "orphan-r2",
      createdAt: daysAgo(10),
      lastPushAt: null,
    });

    // Seed R2 data under this device
    await env.SAVES.put("devices/orphan-r2/saves/save-1/latest.json", "{}");
    await env.SAVES.put("devices/orphan-r2/saves/save-1/snapshots/2026-01-01.json", "{}");

    await reapOrphanDevices(env.DB, env.SAVES);

    const listed = await env.SAVES.list({ prefix: "devices/orphan-r2/" });
    expect(listed.objects).toHaveLength(0);
  });

  it("deletes saves belonging to reaped device", async () => {
    await insertDevice({
      deviceUuid: "orphan-saves",
      createdAt: daysAgo(10),
      lastPushAt: null,
    });

    await env.DB.prepare(
      "INSERT INTO saves (uuid, device_uuid, game_id, save_name) VALUES (?, ?, ?, ?)",
    )
      .bind("save-uuid-1", "orphan-saves", "d2r", "Hammerdin")
      .run();

    await reapOrphanDevices(env.DB, env.SAVES);

    const save = await env.DB.prepare("SELECT 1 FROM saves WHERE uuid = ?")
      .bind("save-uuid-1")
      .first();
    expect(save).toBeNull();
  });

  it("handles multiple orphans in one run", async () => {
    await insertDevice({ deviceUuid: "orphan-a", createdAt: daysAgo(10) });
    await insertDevice({ deviceUuid: "orphan-b", createdAt: daysAgo(15) });
    await insertDevice({
      deviceUuid: "keep-me",
      userUuid: "linked-user",
      createdAt: daysAgo(10),
    });

    const result = await reapOrphanDevices(env.DB, env.SAVES);
    expect(result.deleted).toBe(2);

    const remaining = await env.DB.prepare("SELECT device_uuid FROM devices").all<{
      device_uuid: string;
    }>();
    expect(remaining.results).toHaveLength(1);
    expect(remaining.results[0]!.device_uuid).toBe("keep-me");
  });
});
