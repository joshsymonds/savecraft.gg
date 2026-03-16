import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ApiAdapter, FetchParams, GameState } from "../src/adapters/adapter";
import { AdapterError } from "../src/adapters/adapter";
import { adapters } from "../src/adapters/registry";
import { sha256Hex } from "../src/auth";
import { refreshAdapterSources } from "../src/jobs/adapter-refresh";

import { cleanAll } from "./helpers";

// ---------------------------------------------------------------------------
// Hand-written fake adapter (NO mocking libraries)
// ---------------------------------------------------------------------------

const fetchStateCalls: FetchParams[] = [];
let fakeGameState: GameState = {
  identity: { saveName: "Testchar-testrealm-US", gameId: "fakegame" },
  summary: "Refreshed summary",
  sections: {
    overview: { description: "Overview", data: { level: 90 } },
  },
};
let fetchStateError: Error | null = null;

const fakeAdapter: ApiAdapter = {
  gameId: "fakegame",
  gameName: "Fake Game",
  getOAuthConfig() {
    return { authorizeUrl: "", tokenUrl: "", scopes: [], clientId: "" };
  },
  async discoverSaves() {
    return [];
  },
  async fetchState(params: FetchParams) {
    fetchStateCalls.push(params);
    if (fetchStateError) throw fetchStateError;
    return fakeGameState;
  },
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const USER_UUID = "refresh-job-user";

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
    .bind(saveUuid, userUuid, gameId, "Fake Game", saveName, lastUpdated ?? "2020-01-01T00:00:00", sourceUuid)
    .run();
  return saveUuid;
}

async function seedLinkedCharacter(
  userUuid: string,
  sourceUuid: string,
  gameId: string,
  characterName: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO linked_characters (user_uuid, source_uuid, game_id, character_id, character_name, metadata, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
  )
    .bind(userUuid, sourceUuid, gameId, `${characterName}-id`, characterName, JSON.stringify(metadata))
    .run();
}

async function seedGameCredentials(
  userUuid: string,
  gameId: string,
  accessToken: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO game_credentials (user_uuid, game_id, access_token, refresh_token, expires_at)
     VALUES (?, ?, ?, NULL, NULL)`,
  )
    .bind(userUuid, gameId, accessToken)
    .run();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Adapter Refresh Job", () => {
  beforeEach(async () => {
    await cleanAll();
    fetchStateCalls.length = 0;
    fetchStateError = null;
    fakeGameState = {
      identity: { saveName: "Testchar-testrealm-US", gameId: "fakegame" },
      summary: "Refreshed summary",
      sections: {
        overview: { description: "Overview", data: { level: 90 } },
      },
    };
    // Register fake adapter
    adapters["fakegame"] = fakeAdapter;
  });

  afterEach(() => {
    delete adapters["fakegame"];
  });

  it("refreshes an adapter save and writes refresh_status=ok", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    const saveUuid = await seedAdapterSave(USER_UUID, sourceUuid, "fakegame", "Testchar-testrealm-US");
    await seedLinkedCharacter(USER_UUID, sourceUuid, "fakegame", "Testchar", {
      realm_slug: "testrealm",
      region: "us",
    });
    await seedGameCredentials(USER_UUID, "fakegame", "test-access-token");

    await refreshAdapterSources(env);

    expect(fetchStateCalls).toHaveLength(1);
    expect(fetchStateCalls[0]!.credentials.accessToken).toBe("test-access-token");

    // Check refresh_status was written
    const save = await env.DB.prepare("SELECT refresh_status, refresh_error FROM saves WHERE uuid = ?")
      .bind(saveUuid)
      .first<{ refresh_status: string | null; refresh_error: string | null }>();
    expect(save!.refresh_status).toBe("ok");
    expect(save!.refresh_error).toBeNull();
  });

  it("records error on token_expired and writes refresh_status=error", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    const saveUuid = await seedAdapterSave(USER_UUID, sourceUuid, "fakegame", "Testchar-testrealm-US");
    await seedLinkedCharacter(USER_UUID, sourceUuid, "fakegame", "Testchar", {
      realm_slug: "testrealm",
      region: "us",
    });
    await seedGameCredentials(USER_UUID, "fakegame", "expired-token");

    fetchStateError = new AdapterError("token_expired", "Battle.net token expired");

    await refreshAdapterSources(env);

    const save = await env.DB.prepare("SELECT refresh_status, refresh_error FROM saves WHERE uuid = ?")
      .bind(saveUuid)
      .first<{ refresh_status: string | null; refresh_error: string | null }>();
    expect(save!.refresh_status).toBe("error");
    expect(save!.refresh_error).toContain("token_expired");
  });

  it("skips saves refreshed within cooldown window", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    // last_updated is 1 minute ago — within 5-min cooldown
    const recentlyUpdated = new Date(Date.now() - 60_000).toISOString();
    await seedAdapterSave(USER_UUID, sourceUuid, "fakegame", "Testchar-testrealm-US", recentlyUpdated);
    await seedLinkedCharacter(USER_UUID, sourceUuid, "fakegame", "Testchar", {
      realm_slug: "testrealm",
      region: "us",
    });
    await seedGameCredentials(USER_UUID, "fakegame", "test-access-token");

    await refreshAdapterSources(env);

    // fetchState should not have been called
    expect(fetchStateCalls).toHaveLength(0);
  });

  it("respects batch limit", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    // Seed 55 saves — only 50 should be processed
    for (let i = 0; i < 55; i++) {
      const name = `Char${String(i)}-testrealm-US`;
      fakeGameState = {
        identity: { saveName: name, gameId: "fakegame" },
        summary: `Summary ${String(i)}`,
        sections: { overview: { description: "Overview", data: {} } },
      };
      await seedAdapterSave(USER_UUID, sourceUuid, "fakegame", name);
      await seedLinkedCharacter(USER_UUID, sourceUuid, "fakegame", `Char${String(i)}`, {
        realm_slug: "testrealm",
        region: "us",
      });
    }
    await seedGameCredentials(USER_UUID, "fakegame", "test-access-token");

    await refreshAdapterSources(env);

    expect(fetchStateCalls.length).toBeLessThanOrEqual(50);
  });

  it("skips saves with no linked character", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    await seedAdapterSave(USER_UUID, sourceUuid, "fakegame", "Orphan-testrealm-US");
    await seedGameCredentials(USER_UUID, "fakegame", "test-access-token");
    // No linked character seeded

    await refreshAdapterSources(env);

    expect(fetchStateCalls).toHaveLength(0);
  });

  it("skips saves with no game credentials", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    await seedAdapterSave(USER_UUID, sourceUuid, "fakegame", "Testchar-testrealm-US");
    await seedLinkedCharacter(USER_UUID, sourceUuid, "fakegame", "Testchar", {
      realm_slug: "testrealm",
      region: "us",
    });
    // No credentials seeded

    await refreshAdapterSources(env);

    expect(fetchStateCalls).toHaveLength(0);
  });

  it("does nothing when no adapter saves exist", async () => {
    await refreshAdapterSources(env);
    expect(fetchStateCalls).toHaveLength(0);
  });
});
