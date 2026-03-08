import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

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

/** Call /set-adapter-state on the SourceHub DO for a given source. */
async function setAdapterState(
  sourceUuid: string,
  userUuid: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const doId = env.SOURCE_HUB.idFromName(sourceUuid);
  const doStub = env.SOURCE_HUB.get(doId);
  return doStub.fetch(
    new Request("https://do/set-adapter-state", {
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
async function getDebugState(
  sourceUuid: string,
): Promise<{
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

describe("SourceHub /set-adapter-state", () => {
  beforeEach(cleanAll);

  it("sets game with WATCHING status", async () => {
    const userUuid = "adapter-state-user-1";
    const sourceUuid = await seedAdapterSource(userUuid);

    const resp = await setAdapterState(sourceUuid, userUuid, {
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

    const resp = await setAdapterState(sourceUuid, userUuid, {
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

    await setAdapterState(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "watching",
    });

    await setAdapterState(sourceUuid, userUuid, {
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

    // Wait for the SourceState message that arrives after /set-adapter-state
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

    await setAdapterState(sourceUuid, userUuid, {
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
    const resp1 = await setAdapterState(sourceUuid, userUuid, {
      gameName: "World of Warcraft",
      status: "watching",
    });
    expect(resp1.status).toBe(400);

    // Missing gameName
    const resp2 = await setAdapterState(sourceUuid, userUuid, {
      gameId: "wow",
      status: "watching",
    });
    expect(resp2.status).toBe(400);

    // Missing status
    const resp3 = await setAdapterState(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
    });
    expect(resp3.status).toBe(400);

    // Invalid status value
    const resp4 = await setAdapterState(sourceUuid, userUuid, {
      gameId: "wow",
      gameName: "World of Warcraft",
      status: "invalid",
    });
    expect(resp4.status).toBe(400);
  });

  it("sets source meta for adapter type", async () => {
    const userUuid = "adapter-state-user-6";
    const sourceUuid = await seedAdapterSource(userUuid);

    await setAdapterState(sourceUuid, userUuid, {
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
});
