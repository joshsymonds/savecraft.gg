import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ApiAdapter, FetchParams, GameState } from "../src/adapters/adapter";
import { adapters } from "../src/adapters/registry";
import { sha256Hex } from "../src/auth";

import { cleanAll } from "./helpers";

const USER_UUID = "adapter-refresh-user";

// Hand-written fake adapter (NO mocking libraries) capturing the
// FetchParams the refresh dispatch resolves — this is the contract the
// adapter-generic refresh refactor changes.
const fetchStateCalls: FetchParams[] = [];
const fakeAdapter: ApiAdapter = {
  gameId: "fakegame",
  gameName: "Fake Game",
  getOAuthConfig() {
    return { authorizeUrl: "", tokenUrl: "", scopes: [], clientId: "" };
  },
  discoverSaves() {
    return Promise.resolve([]);
  },
  fetchState(params: FetchParams): Promise<GameState> {
    fetchStateCalls.push(params);
    return Promise.resolve({
      identity: { saveName: "Dratnos-testrealm-US", gameId: "fakegame" },
      summary: "Refreshed",
      sections: { overview: { description: "Overview", data: { level: 90 } } },
    });
  },
};

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

  it("returns 400 when the save has no linked character", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    // Save with no linked_characters row — the unrefreshable-save guard
    // (formerly the WoW-only !realmSlug check) must still fire.
    const saveUuid = await seedAdapterSave(USER_UUID, sourceUuid, "wow", "BadName");

    const resp = await SELF.fetch(refreshRequest("wow", saveUuid));
    expect(resp.status).toBe(400);
    const body = await resp.json<{ error: string }>();
    expect(body.error).toContain("not linked");
  });

  // Characterization of the REST refresh SUCCESS path — uncovered
  // before the adapter-generic refresh refactor. Pins both the
  // observable outcome (refresh succeeds, sections persisted) and the
  // resolved FetchParams contract the refactor changes.
  describe("success path [characterization]", () => {
    beforeEach(() => {
      fetchStateCalls.length = 0;
      adapters.fakegame = fakeAdapter;
    });
    afterEach(() => {
      delete adapters.fakegame;
    });

    it("resolves WoW-style identity, calls fetchState, persists sections", async () => {
      const sourceUuid = await seedAdapterSource(USER_UUID);
      const saveUuid = await seedAdapterSave(
        USER_UUID,
        sourceUuid,
        "fakegame",
        "Dratnos-testrealm-US",
      );
      await env.DB.prepare(
        `INSERT INTO linked_characters (user_uuid, game_id, character_id, character_name, metadata, source_uuid, active)
         VALUES (?, 'fakegame', ?, ?, ?, ?, 1)`,
      )
        .bind(
          USER_UUID,
          "wow-char-id-123",
          "Dratnos",
          JSON.stringify({ realm_slug: "testrealm", region: "us" }),
          sourceUuid,
        )
        .run();
      await env.DB.prepare(
        `INSERT INTO game_credentials (user_uuid, game_id, access_token, refresh_token, expires_at)
         VALUES (?, 'fakegame', 'acc-tok', 'ref-tok', NULL)`,
      )
        .bind(USER_UUID)
        .run();

      const resp = await SELF.fetch(refreshRequest("fakegame", saveUuid));
      expect(resp.status).toBe(200);

      // Adapter-generic dispatch contract: the stored character_id and
      // discovered name pass through verbatim; region + metadata from
      // linked_characters. (Observable outcome — refresh succeeds,
      // sections persist — is unchanged from pre-refactor.)
      expect(fetchStateCalls).toHaveLength(1);
      expect(fetchStateCalls[0]!.characterId).toBe("wow-char-id-123");
      expect(fetchStateCalls[0]!.characterName).toBe("Dratnos");
      expect(fetchStateCalls[0]!.region).toBe("us");
      expect(fetchStateCalls[0]!.metadata.realm_slug).toBe("testrealm");
      expect(fetchStateCalls[0]!.credentials.accessToken).toBe("acc-tok");

      // Sections persisted (refresh observable outcome).
      const section = await env.DB.prepare(
        "SELECT data FROM sections WHERE save_uuid = ? AND name = 'overview'",
      )
        .bind(saveUuid)
        .first<{ data: string }>();
      expect(section).toBeTruthy();
    });
  });
});
