import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { sha256Hex } from "../src/auth";

import { cleanAll } from "./helpers";

const USER_UUID = "adapter-refresh-user";

/** Create an adapter source pre-linked to the user. */
async function seedAdapterSource(userUuid: string): Promise<string> {
  const sourceUuid = crypto.randomUUID();
  const tokenHash = await sha256Hex(`sct_adapter_${sourceUuid}`);
  await env.DB.prepare(
    `INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind, can_rescan, can_receive_config)
     VALUES (?, ?, ?, 'adapter', 0, 0)`,
  )
    .bind(sourceUuid, userUuid, tokenHash)
    .run();
  return sourceUuid;
}

/** Seed a save linked to an adapter source. */
async function seedAdapterSave(
  userUuid: string,
  sourceUuid: string,
  gameId: string,
  saveName: string,
  lastUpdated?: string,
): Promise<string> {
  const saveUuid = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid)
     VALUES (?, ?, ?, ?, ?, '', ?, ?)`,
  )
    .bind(
      saveUuid,
      userUuid,
      gameId,
      "World of Warcraft",
      saveName,
      lastUpdated ?? "2020-01-01T00:00:00",
      sourceUuid,
    )
    .run();
  return saveUuid;
}

function refreshRequest(gameId: string, saveUuid: string): Request {
  return new Request(`https://test-host/api/v1/adapters/${gameId}/refresh/${saveUuid}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${USER_UUID}`,
    },
  });
}

describe("Adapter Refresh", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  it("returns 401 without auth", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/api/v1/adapters/wow/refresh/abc", {
        method: "POST",
      }),
    );
    expect(resp.status).toBe(401);
  });

  it("returns 404 for unknown adapter", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/api/v1/adapters/unknown-game/refresh/abc", {
        method: "POST",
        headers: { Authorization: `Bearer ${USER_UUID}` },
      }),
    );
    expect(resp.status).toBe(404);
    const body = await resp.json<{ error: string }>();
    expect(body.error).toContain("No adapter");
  });

  it("returns 404 for non-existent save", async () => {
    const resp = await SELF.fetch(refreshRequest("wow", "nonexistent"));
    expect(resp.status).toBe(404);
  });

  it("returns 400 for non-adapter save", async () => {
    // Create a daemon source (not adapter)
    const sourceUuid = crypto.randomUUID();
    const tokenHash = await sha256Hex(`sct_daemon_${sourceUuid}`);
    await env.DB.prepare(
      `INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind)
       VALUES (?, ?, ?, 'daemon')`,
    )
      .bind(sourceUuid, USER_UUID, tokenHash)
      .run();

    const saveUuid = await seedAdapterSave(USER_UUID, sourceUuid, "wow", "Dratnos-tichondrius-US");

    const resp = await SELF.fetch(refreshRequest("wow", saveUuid));
    expect(resp.status).toBe(400);
    const body = await resp.json<{ error: string }>();
    expect(body.error).toContain("not adapter-backed");
  });

  it("enforces rate limiting (429 within cooldown)", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    // Set last_updated to recent (within 5 min)
    const recentTimestamp = new Date(Date.now() - 60_000).toISOString();
    const saveUuid = await seedAdapterSave(
      USER_UUID,
      sourceUuid,
      "wow",
      "Dratnos-tichondrius-US",
      recentTimestamp,
    );

    const resp = await SELF.fetch(refreshRequest("wow", saveUuid));
    expect(resp.status).toBe(429);
    const body = await resp.json<{ error: string; retry_after: number }>();
    expect(body.retry_after).toBeGreaterThan(0);
  });

  it("returns 400 when realm cannot be determined", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    // Save with no linked character and name that can't be parsed
    const saveUuid = await seedAdapterSave(USER_UUID, sourceUuid, "wow", "BadName");

    const resp = await SELF.fetch(refreshRequest("wow", saveUuid));
    expect(resp.status).toBe(400);
    const body = await resp.json<{ error: string }>();
    expect(body.error).toContain("realm");
  });
});
