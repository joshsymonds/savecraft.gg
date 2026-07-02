import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ApiAdapter, FetchParams, GameState } from "../src/adapters/adapter";
import { AdapterError } from "../src/adapters/adapter";
import { providerForGame } from "../src/adapters/providers";
import { adapters } from "../src/adapters/registry";
import { sha256Hex } from "../src/auth";
import { REFRESH_CONCURRENCY, refreshAdapterSources } from "../src/jobs/adapter-refresh";

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
  discoverSaves() {
    return Promise.resolve([]);
  },
  fetchState(params: FetchParams) {
    fetchStateCalls.push(params);
    if (fetchStateError) return Promise.reject(fetchStateError);
    // Derive identity from characterId so batch tests get distinct save names
    const charName = params.characterName || "unknown";
    return Promise.resolve({
      ...fakeGameState,
      identity: { ...fakeGameState.identity, saveName: `${charName}-testrealm-US` },
    });
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
  lastRefreshAt?: string,
): Promise<string> {
  const saveUuid = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_refresh_at, last_source_uuid)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)`,
  )
    .bind(
      saveUuid,
      userUuid,
      gameId,
      "Fake Game",
      saveName,
      lastUpdated ?? "2020-01-01T00:00:00",
      lastRefreshAt ?? null,
      sourceUuid,
    )
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
    .bind(
      userUuid,
      sourceUuid,
      gameId,
      `${characterName}-id`,
      characterName,
      JSON.stringify(metadata),
    )
    .run();
}

async function seedGameCredentials(
  userUuid: string,
  gameId: string,
  accessToken: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO provider_credentials (user_uuid, provider, access_token, refresh_token, expires_at)
     VALUES (?, ?, ?, NULL, NULL)`,
  )
    .bind(userUuid, providerForGame(gameId), accessToken)
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
    adapters.fakegame = fakeAdapter;
  });

  afterEach(() => {
    delete adapters.fakegame;
  });

  it("refreshes an adapter save and writes refresh_status=ok", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    const saveUuid = await seedAdapterSave(
      USER_UUID,
      sourceUuid,
      "fakegame",
      "Testchar-testrealm-US",
    );
    await seedLinkedCharacter(USER_UUID, sourceUuid, "fakegame", "Testchar", {
      realm_slug: "testrealm",
      region: "us",
    });
    await seedGameCredentials(USER_UUID, "fakegame", "test-access-token");

    await refreshAdapterSources(env);

    expect(fetchStateCalls).toHaveLength(1);
    expect(fetchStateCalls[0]!.credentials.accessToken).toBe("test-access-token");

    // Check refresh_status was written
    const save = await env.DB.prepare(
      "SELECT refresh_status, refresh_error FROM saves WHERE uuid = ?",
    )
      .bind(saveUuid)
      .first<{ refresh_status: string | null; refresh_error: string | null }>();
    expect(save!.refresh_status).toBe("ok");
    expect(save!.refresh_error).toBeNull();
  });

  it("records error on token_expired and writes refresh_status=error", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    const saveUuid = await seedAdapterSave(
      USER_UUID,
      sourceUuid,
      "fakegame",
      "Testchar-testrealm-US",
    );
    await seedLinkedCharacter(USER_UUID, sourceUuid, "fakegame", "Testchar", {
      realm_slug: "testrealm",
      region: "us",
    });
    await seedGameCredentials(USER_UUID, "fakegame", "expired-token");

    fetchStateError = new AdapterError("token_expired", "Battle.net token expired");

    await refreshAdapterSources(env);

    const save = await env.DB.prepare(
      "SELECT refresh_status, refresh_error FROM saves WHERE uuid = ?",
    )
      .bind(saveUuid)
      .first<{ refresh_status: string | null; refresh_error: string | null }>();
    expect(save!.refresh_status).toBe("error");
    expect(save!.refresh_error).toContain("token_expired");
  });

  it("skips saves refreshed within cooldown window", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    // last_refresh_at is 1 minute ago — within the 5-min cooldown
    const recentlyRefreshed = new Date(Date.now() - 60_000).toISOString();
    await seedAdapterSave(
      USER_UUID,
      sourceUuid,
      "fakegame",
      "Testchar-testrealm-US",
      recentlyRefreshed,
      recentlyRefreshed,
    );
    await seedLinkedCharacter(USER_UUID, sourceUuid, "fakegame", "Testchar", {
      realm_slug: "testrealm",
      region: "us",
    });
    await seedGameCredentials(USER_UUID, "fakegame", "test-access-token");

    await refreshAdapterSources(env);

    // fetchState should not have been called
    expect(fetchStateCalls).toHaveLength(0);
  });

  // 15s timeout: even the minimized error path (~2 D1 ops × 51 saves plus
  // the seed batch) overruns vitest's 5s default intermittently — observed
  // failing in ISOLATION 2026-06-10, so it's miniflare D1 latency, not
  // shard contention. The timeout is not load-bearing for the assertion
  // (fetchStateCalls.length counts LIMIT 50 directly); the global
  // testTimeout stays unset so other tests keep the tight default.
  it("respects batch limit", { timeout: 15_000 }, async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    // The assertion is "fetchState was called at most 50 times" — purely a
    // SQL LIMIT 50 check on the source-selection query, NOT a test of the
    // success-path side effects (storePush, refresh_status='ok', etc).
    // Forcing fetchState to throw means refreshOneSave takes the error path
    // and skips storePush entirely (the most expensive per-save D1 work).
    fetchStateError = new AdapterError("api_unavailable", "batch-limit test");
    // Seed 51 saves — just enough rows to verify LIMIT 50 enforces.
    // Chunked into max-sized multi-row INSERTs (14 rows × 7 params = 98
    // for saves, 16 rows × 6 params = 96 for linked_characters — both
    // just under D1's 100-param ceiling) via one D1.batch().
    const ROW_COUNT = 51;
    const SAVES_CHUNK = 14;
    const LINKED_CHUNK = 16;
    function buildSaveChunk(start: number, rows: number): D1PreparedStatement {
      const params: unknown[] = [];
      for (let offset = 0; offset < rows; offset++) {
        const charName = `Char${String(start + offset)}`;
        params.push(
          crypto.randomUUID(),
          USER_UUID,
          "fakegame",
          "Fake Game",
          `${charName}-testrealm-US`,
          "2020-01-01T00:00:00",
          sourceUuid,
        );
      }
      const values = Array.from({ length: rows }, () => "(?, ?, ?, ?, ?, '', ?, ?)").join(", ");
      return env.DB.prepare(
        `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid)
         VALUES ${values}`,
      ).bind(...params);
    }
    function buildLinkedChunk(start: number, rows: number): D1PreparedStatement {
      const params: unknown[] = [];
      for (let offset = 0; offset < rows; offset++) {
        const index = start + offset;
        const charName = `Char${String(index)}`;
        params.push(
          USER_UUID,
          sourceUuid,
          "fakegame",
          `${charName}-id`,
          charName,
          JSON.stringify({ realm_slug: "testrealm", region: "us" }),
        );
      }
      const values = Array.from({ length: rows }, () => "(?, ?, ?, ?, ?, ?, 1)").join(", ");
      return env.DB.prepare(
        `INSERT INTO linked_characters (user_uuid, source_uuid, game_id, character_id, character_name, metadata, active)
         VALUES ${values}`,
      ).bind(...params);
    }
    const stmts: D1PreparedStatement[] = [];
    for (let start = 0; start < ROW_COUNT; start += SAVES_CHUNK) {
      stmts.push(buildSaveChunk(start, Math.min(SAVES_CHUNK, ROW_COUNT - start)));
    }
    for (let start = 0; start < ROW_COUNT; start += LINKED_CHUNK) {
      stmts.push(buildLinkedChunk(start, Math.min(LINKED_CHUNK, ROW_COUNT - start)));
    }
    await env.DB.batch(stmts);
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

describe("Adapter Refresh Job — backpressure (#30)", () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let poolCalls = 0;
  let poolError: Error | null = null;

  const poolAdapter: ApiAdapter = {
    gameId: "poolgame",
    gameName: "Pool Game",
    getOAuthConfig() {
      return { authorizeUrl: "", tokenUrl: "", scopes: [], clientId: "" };
    },
    discoverSaves() {
      return Promise.resolve([]);
    },
    async fetchState(params: FetchParams): Promise<GameState> {
      poolCalls++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Carve-out: 10ms in a fake adapter simulating I/O latency, so the
      // concurrency limiter under test (REFRESH_CONCURRENCY) is observable
      // via maxInFlight. Not a synchronisation primitive — without this
      // the pool would resolve instantly and we couldn't measure parallelism.
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight--;
      if (poolError) throw poolError;
      const charName = params.characterName || "unknown";
      return {
        identity: { saveName: `${charName}-testrealm-US`, gameId: "poolgame" },
        summary: "s",
        sections: { o: { description: "o", data: {} } },
      };
    },
  };

  beforeEach(async () => {
    await cleanAll();
    inFlight = 0;
    maxInFlight = 0;
    poolCalls = 0;
    poolError = null;
    adapters.poolgame = poolAdapter;
  });

  afterEach(() => {
    delete adapters.poolgame;
  });

  it("caps concurrent refreshes — bounded fan-out, not 1-by-1", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    await seedGameCredentials(USER_UUID, "poolgame", "tok");
    for (let index = 0; index < 8; index++) {
      const n = String(index);
      await seedAdapterSave(USER_UUID, sourceUuid, "poolgame", `Char${n}-testrealm-US`);
      await seedLinkedCharacter(USER_UUID, sourceUuid, "poolgame", `Char${n}`, {
        realm_slug: "testrealm",
        region: "us",
      });
    }

    await refreshAdapterSources(env);

    expect(poolCalls).toBe(8); // every due save still processed
    expect(maxInFlight).toBeLessThanOrEqual(REFRESH_CONCURRENCY); // bounded
    expect(maxInFlight).toBeGreaterThan(1); // genuinely concurrent, not serial
  });

  it("defers a rate-limited row by Retry-After (beyond the plain cooldown)", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    await seedGameCredentials(USER_UUID, "poolgame", "tok");
    const saveUuid = await seedAdapterSave(USER_UUID, sourceUuid, "poolgame", "RL-testrealm-US");
    await seedLinkedCharacter(USER_UUID, sourceUuid, "poolgame", "RL", {
      realm_slug: "testrealm",
      region: "us",
    });
    poolError = new AdapterError("rate_limited", "GGG rate limit", { retryAfter: 3600 });

    await refreshAdapterSources(env);

    const row = await env.DB.prepare(
      "SELECT refresh_status, (last_refresh_at > datetime('now','+1800 seconds')) AS deferred FROM saves WHERE uuid = ?",
    )
      .bind(saveUuid)
      .first<{ refresh_status: string; deferred: number }>();
    expect(row!.refresh_status).toBe("error");
    // retryAfter 3600 - cooldown 300 ≈ +3300s, so it's pushed > 30 min out.
    expect(row!.deferred).toBe(1);
  });

  it("clamps an absurd Retry-After so a save is never parked forever", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    await seedGameCredentials(USER_UUID, "poolgame", "tok");
    const saveUuid = await seedAdapterSave(USER_UUID, sourceUuid, "poolgame", "Huge-testrealm-US");
    await seedLinkedCharacter(USER_UUID, sourceUuid, "poolgame", "Huge", {
      realm_slug: "testrealm",
      region: "us",
    });
    // A malformed GGG header (absolute epoch instead of a delta).
    poolError = new AdapterError("rate_limited", "GGG rate limit", { retryAfter: 1e12 });

    await refreshAdapterSources(env);

    const row = await env.DB.prepare(
      `SELECT (last_refresh_at > datetime('now')) AS deferred,
              (last_refresh_at <= datetime('now','+86460 seconds')) AS clamped
       FROM saves WHERE uuid = ?`,
    )
      .bind(saveUuid)
      .first<{ deferred: number; clamped: number }>();
    expect(row!.deferred).toBe(1); // still deferred…
    expect(row!.clamped).toBe(1); // …but capped at ~24h, not year 33000
  });

  it("a non-rate-limit error keeps the normal cooldown (no future deferral)", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    await seedGameCredentials(USER_UUID, "poolgame", "tok");
    const saveUuid = await seedAdapterSave(USER_UUID, sourceUuid, "poolgame", "TE-testrealm-US");
    await seedLinkedCharacter(USER_UUID, sourceUuid, "poolgame", "TE", {
      realm_slug: "testrealm",
      region: "us",
    });
    poolError = new AdapterError("token_expired", "expired");

    await refreshAdapterSources(env);

    const row = await env.DB.prepare(
      "SELECT (last_refresh_at > datetime('now','+5 seconds')) AS in_future FROM saves WHERE uuid = ?",
    )
      .bind(saveUuid)
      .first<{ in_future: number }>();
    expect(row!.in_future).toBe(0); // stamped ~now, not deferred into the future
  });
});
