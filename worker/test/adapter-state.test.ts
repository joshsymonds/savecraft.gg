import { env, runDurableObjectAlarm } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { ApiAdapter, DiscoveredSave } from "../src/adapters/adapter";
import { discoverAndReconcileSaves } from "../src/adapters/discover";
import { GameStatusEnum } from "../src/proto/savecraft/v1/protocol";

import {
  cleanAll,
  closeWs,
  connectWs,
  requireInnerPayload,
  waitForRelayedMessageMatching,
} from "./helpers";

/** Seed an adapter source in D1 and return its UUID. */
async function seedAdapterSource(userUuid: string): Promise<string> {
  const sourceUuid = crypto.randomUUID();
  const tokenHash = "unused-adapter-hash";
  await env.DB.prepare(
    `INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind, can_rescan, can_receive_config)
     VALUES (?, ?, ?, 'adapter', 0, 0)`,
  )
    .bind(sourceUuid, userUuid, tokenHash)
    .run();
  return sourceUuid;
}

/** Call /set-game-status on the SourceHub DO for a given source. */
async function setGameStatus(
  sourceUuid: string,
  userUuid: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const doId = env.SOURCE_HUB.idFromName(sourceUuid);
  const doStub = env.SOURCE_HUB.get(doId);
  return doStub.fetch(
    new Request("https://do/set-game-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Source-UUID": sourceUuid,
        "X-User-UUID": userUuid,
      },
      body: JSON.stringify(body),
    }),
  );
}

/** Read SourceHub debug state. */
async function getDebugState(sourceUuid: string): Promise<{
  sourceState: {
    sources: {
      sourceId: string;
      online: boolean;
      games: { gameId: string; gameName: string; status: number }[];
    }[];
  };
}> {
  const doId = env.SOURCE_HUB.idFromName(sourceUuid);
  const doStub = env.SOURCE_HUB.get(doId);
  const resp = await doStub.fetch(new Request("https://do/debug/state"));
  return resp.json();
}

describe("SourceHub /set-game-status", () => {
  beforeEach(cleanAll);

  it("sets game with WATCHING status", async () => {
    const userUuid = "adapter-state-user-1";
    const sourceUuid = await seedAdapterSource(userUuid);

    const resp = await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "watching",
    });

    expect(resp.status).toBe(200);

    const debug = await getDebugState(sourceUuid);
    const sources = debug.sourceState.sources;
    expect(sources).toHaveLength(1);
    expect(sources[0]!.sourceId).toBe(sourceUuid);
    expect(sources[0]!.online).toBe(true);
    expect(sources[0]!.games).toHaveLength(1);
    expect(sources[0]!.games[0]!.gameId).toBe("wow");
    expect(sources[0]!.games[0]!.gameName).toBe("World of Warcraft");
    expect(sources[0]!.games[0]!.status).toBe(GameStatusEnum.GAME_STATUS_ENUM_WATCHING);
  });

  it("sets game with ERROR status", async () => {
    const userUuid = "adapter-state-user-2";
    const sourceUuid = await seedAdapterSource(userUuid);

    const resp = await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "error",
    });

    expect(resp.status).toBe(200);

    const debug = await getDebugState(sourceUuid);
    const game = debug.sourceState.sources[0]!.games[0]!;
    expect(game.status).toBe(GameStatusEnum.GAME_STATUS_ENUM_ERROR);
  });

  it("is idempotent — updating same gameId does not duplicate", async () => {
    const userUuid = "adapter-state-user-3";
    const sourceUuid = await seedAdapterSource(userUuid);

    await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "watching",
    });

    await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "error",
    });

    const debug = await getDebugState(sourceUuid);
    expect(debug.sourceState.sources).toHaveLength(1);
    expect(debug.sourceState.sources[0]!.games).toHaveLength(1);
    expect(debug.sourceState.sources[0]!.games[0]!.status).toBe(
      GameStatusEnum.GAME_STATUS_ENUM_ERROR,
    );
  });

  it("forwards state to UserHub (visible on UI WebSocket)", async () => {
    const userUuid = "adapter-state-user-4";
    const sourceUuid = await seedAdapterSource(userUuid);

    // Connect UI WebSocket and drain initial empty state
    const uiWs = await connectWs("/ws/ui", userUuid);

    // Wait for the SourceState message that arrives after /set-game-status
    const statePromise = waitForRelayedMessageMatching(
      uiWs,
      (msg) => {
        if (!msg.message?.payload) return false;
        if (msg.message.payload.$case !== "sourceState") return false;
        return msg.message.payload.sourceState.sources.some((s) =>
          s.games.some((g) => g.gameId === "wow"),
        );
      },
      5000,
    );

    await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "watching",
    });

    const relayed = await statePromise;
    const sourceState = requireInnerPayload(relayed, "sourceState");
    const source = sourceState.sources.find((s) => s.games.some((g) => g.gameId === "wow"));
    expect(source).toBeDefined();
    expect(source!.sourceKind).toBe("adapter");
    expect(source!.canRescan).toBe(false);
    expect(source!.canReceiveConfig).toBe(false);

    await closeWs(uiWs);
  });

  it("returns 400 for missing required fields", async () => {
    const userUuid = "adapter-state-user-5";
    const sourceUuid = await seedAdapterSource(userUuid);

    // Missing gameId
    const resp1 = await setGameStatus(sourceUuid, userUuid, {
      gameName: "World of Warcraft",
      status: "watching",
    });
    expect(resp1.status).toBe(400);

    // Missing gameName
    const resp2 = await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      status: "watching",
    });
    expect(resp2.status).toBe(400);

    // Missing status
    const resp3 = await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
    });
    expect(resp3.status).toBe(400);

    // Invalid status value
    const resp4 = await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "invalid",
    });
    expect(resp4.status).toBe(400);
  });

  it("sets source meta for adapter type", async () => {
    const userUuid = "adapter-state-user-6";
    const sourceUuid = await seedAdapterSource(userUuid);

    await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "watching",
    });

    // Meta is applied during forwardStateToUserHub decoration,
    // but we can verify via debug endpoint's sourceMeta
    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    const resp = await doStub.fetch(new Request("https://do/debug/state"));
    const fullDebug = await resp.json<{
      sourceMeta: { sourceKind: string; canRescan: boolean; canReceiveConfig: boolean };
    }>();
    expect(fullDebug.sourceMeta.sourceKind).toBe("adapter");
    expect(fullDebug.sourceMeta.canRescan).toBe(false);
    expect(fullDebug.sourceMeta.canReceiveConfig).toBe(false);
  });

  it("enriches adapter sources with saves from D1", async () => {
    const userUuid = "adapter-state-user-7";
    const sourceUuid = await seedAdapterSource(userUuid);

    // Seed saves in D1 for this adapter source
    const saveUuid1 = crypto.randomUUID();
    const saveUuid2 = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid)
         VALUES (?, ?, 'wow', 'World of Warcraft', 'Thrall-thrall-US', 'Orc Shaman, Level 80', datetime('now'), ?)`,
      ).bind(saveUuid1, userUuid, sourceUuid),
      env.DB.prepare(
        `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid)
         VALUES (?, ?, 'wow', 'World of Warcraft', 'Jaina-proudmoore-US', 'Human Mage, Level 80', datetime('now'), ?)`,
      ).bind(saveUuid2, userUuid, sourceUuid),
    ]);

    // Connect UI WebSocket and wait for state with saves
    const uiWs = await connectWs("/ws/ui", userUuid);

    const statePromise = waitForRelayedMessageMatching(
      uiWs,
      (msg) => {
        if (msg.message?.payload?.$case !== "sourceState") return false;
        const sources = msg.message.payload.sourceState.sources;
        return sources.some((s) => s.games.some((g) => g.saves.length > 0));
      },
      5000,
    );

    await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "watching",
    });

    const relayed = await statePromise;
    const sourceState = requireInnerPayload(relayed, "sourceState");
    const source = sourceState.sources.find((s) => s.games.some((g) => g.gameId === "wow"));
    expect(source).toBeDefined();
    const game = source!.games.find((g) => g.gameId === "wow")!;
    expect(game.saves).toHaveLength(2);

    const saveNames = game.saves
      .map((s) => s.identity?.name)
      .toSorted((a, b) => (a ?? "").localeCompare(b ?? ""));
    expect(saveNames).toEqual(["Jaina-proudmoore-US", "Thrall-thrall-US"]);

    await closeWs(uiWs);
  });

  it("marks the adapter source online without arming a (dead) alarm (#24)", async () => {
    const userUuid = "adapter-alarm-user";
    const sourceUuid = await seedAdapterSource(userUuid);

    await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "watching",
    });

    const debug = await getDebugState(sourceUuid);
    expect(debug.sourceState.sources[0]!.online).toBe(true);

    // set-game-status forwards to UserHub synchronously; alarm() early-
    // returns for adapter sources, so arming an alarm here is dead work
    // that only leaked across the shared test pool. No alarm must be set.
    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    const resp = await doStub.fetch(new Request("https://do/debug/state"));
    const fullDebug = await resp.json<{ alarm: string | null }>();
    expect(fullDebug.alarm).toBeNull();
  });

  it("does not evict adapter sources via alarm (adapter lifecycle driven by cron)", async () => {
    const userUuid = "adapter-alarm-evict-user";
    const sourceUuid = await seedAdapterSource(userUuid);

    await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "watching",
    });

    // Verify source is online
    const debugBefore = await getDebugState(sourceUuid);
    expect(debugBefore.sourceState.sources[0]!.online).toBe(true);

    // Fire the alarm deterministically instead of sleeping past the stale
    // threshold. Adapter sources are exempt from eviction so this should
    // either no-op (no alarm armed for adapter sources) or leave them online.
    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    await runDurableObjectAlarm(env.SOURCE_HUB.get(doId));

    // Adapter source should still be online — NOT evicted
    const debugAfter = await getDebugState(sourceUuid);
    expect(debugAfter.sourceState.sources[0]?.online).toBe(true);
  });

  it("does not include saves from other sources", async () => {
    const userUuid = "adapter-state-user-8";
    const sourceUuid = await seedAdapterSource(userUuid);
    const otherSourceUuid = crypto.randomUUID();

    // Seed a save belonging to a different source
    await env.DB.prepare(
      `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid)
       VALUES (?, ?, 'wow', 'World of Warcraft', 'Other-char-US', 'Not mine', datetime('now'), ?)`,
    )
      .bind(crypto.randomUUID(), userUuid, otherSourceUuid)
      .run();

    const uiWs = await connectWs("/ws/ui", userUuid);

    const statePromise = waitForRelayedMessageMatching(
      uiWs,
      (msg) => {
        if (msg.message?.payload?.$case !== "sourceState") return false;
        return msg.message.payload.sourceState.sources.some((s) =>
          s.games.some((g) => g.gameId === "wow"),
        );
      },
      5000,
    );

    await setGameStatus(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "watching",
    });

    const relayed = await statePromise;
    const sourceState = requireInnerPayload(relayed, "sourceState");
    const source = sourceState.sources.find((s) => s.games.some((g) => g.gameId === "wow"));
    expect(source).toBeDefined();
    const game = source!.games.find((g) => g.gameId === "wow")!;
    expect(game.saves).toHaveLength(0);

    await closeWs(uiWs);
  });
});

describe("SourceHub /sync-discovered-saves (#23)", () => {
  beforeEach(cleanAll);

  async function syncDiscoveredSaves(
    sourceUuid: string,
    userUuid: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    return doStub.fetch(
      new Request("https://do/sync-discovered-saves", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Source-UUID": sourceUuid,
          "X-User-UUID": userUuid,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it("adds discovered characters as named saves with empty summaries", async () => {
    const userUuid = crypto.randomUUID();
    const sourceUuid = await seedAdapterSource(userUuid);

    await setGameStatus(sourceUuid, userUuid, {
      gameId: "poe",
      gameName: "Path of Exile",
      status: "watching",
    });

    const resp = await syncDiscoveredSaves(sourceUuid, userUuid, {
      gameId: "poe",
      gameName: "Path of Exile",
      saves: [
        { saveUuid: "s-atmus", name: "Atmus" },
        { saveUuid: "s-ceral", name: "Ceral" },
      ],
    });
    expect(resp.status).toBe(200);

    const debug = (await getDebugState(sourceUuid)) as unknown as {
      sourceState: {
        sources: {
          games: {
            gameId: string;
            saves: { saveUuid: string; summary: string; identity?: { name: string } }[];
          }[];
        }[];
      };
    };
    const game = debug.sourceState.sources[0]!.games.find((g) => g.gameId === "poe")!;
    expect(game.saves).toHaveLength(2);
    const names = game.saves
      .map((s) => s.identity?.name)
      .toSorted((a, b) => (a ?? "").localeCompare(b ?? ""));
    expect(names).toEqual(["Atmus", "Ceral"]);
    expect(game.saves.every((s) => s.summary === "")).toBe(true);
  });

  it("is idempotent — re-syncing the same characters does not duplicate", async () => {
    const userUuid = crypto.randomUUID();
    const sourceUuid = await seedAdapterSource(userUuid);
    await setGameStatus(sourceUuid, userUuid, {
      gameId: "poe",
      gameName: "Path of Exile",
      status: "watching",
    });
    const body = {
      gameId: "poe",
      gameName: "Path of Exile",
      saves: [{ saveUuid: "s-atmus", name: "Atmus" }],
    };
    await syncDiscoveredSaves(sourceUuid, userUuid, body);
    await syncDiscoveredSaves(sourceUuid, userUuid, body);

    const debug = (await getDebugState(sourceUuid)) as unknown as {
      sourceState: { sources: { games: { gameId: string; saves: unknown[] }[] }[] };
    };
    const game = debug.sourceState.sources[0]!.games.find((g) => g.gameId === "poe")!;
    expect(game.saves).toHaveLength(1);
  });
});

describe("discoverAndReconcileSaves only syncs ACTIVE characters to the DO", () => {
  beforeEach(cleanAll);

  it("does not re-push a soft-deleted (active=0) character's stale save", async () => {
    const userUuid = crypto.randomUUID();
    const sourceUuid = await seedAdapterSource(userUuid);

    // A previously-linked character that has since been soft-deleted
    // (reconcile sets active=0 but leaves the saves row behind).
    await env.DB.prepare(
      `INSERT INTO linked_characters (user_uuid, game_id, character_id, character_name, metadata, source_uuid, active)
       VALUES (?, 'poe', 'id-gone', 'Gone', '{}', ?, 0)`,
    )
      .bind(userUuid, sourceUuid)
      .run();
    await env.DB.prepare(
      `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid)
       VALUES ('save-gone', ?, 'poe', 'Path of Exile', 'Gone', '', datetime('now'), ?)`,
    )
      .bind(userUuid, sourceUuid)
      .run();

    const fakeAdapter = {
      gameId: "poe",
      gameName: "Path of Exile",
      getOAuthConfig() {
        throw new Error("unused");
      },
      discoverSaves(): Promise<DiscoveredSave[]> {
        return Promise.resolve([
          { saveName: "Keep", characterId: "id-keep", displayName: "Keep", metadata: {} },
        ]);
      },
      fetchState() {
        throw new Error("unused");
      },
    } as unknown as ApiAdapter;

    await discoverAndReconcileSaves(fakeAdapter, env, "tok", "pc", userUuid, sourceUuid);

    const debug = (await getDebugState(sourceUuid)) as unknown as {
      sourceState: {
        sources: { games: { gameId: string; saves: { identity?: { name: string } }[] }[] }[];
      };
    };
    const game = debug.sourceState.sources[0]!.games.find((g) => g.gameId === "poe")!;
    const names = game.saves.map((s) => s.identity?.name);
    expect(names).toEqual(["Keep"]);
    expect(names).not.toContain("Gone");
  });
});
