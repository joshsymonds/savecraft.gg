import { env, fetchMock, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { Message, RelayedMessage } from "../src/proto/savecraft/v1/protocol";

import {
  cleanAll,
  closeWs,
  connectDaemonWs,
  connectWs,
  requireInnerPayload,
  requirePayload,
  seedSource,
  sendProto,
  sendSourceOnlineAndDrainLinkState,
  waitForProtoMessage,
  waitForRelayedMessage,
  waitForRelayedMessageMatching,
} from "./helpers";

/** Shorthand for building a sourceOnline Message payload. */
function sourceOnlineMsg(
  overrides?: Partial<{
    version: string;
    platform: string;
    os: string;
    arch: string;
    hostname: string;
    device: string;
  }>,
): Message {
  return {
    payload: {
      $case: "sourceOnline",
      sourceOnline: {
        version: overrides?.version ?? "0.1.0",
        timestamp: undefined,
        platform: overrides?.platform ?? "",
        os: overrides?.os ?? "",
        arch: overrides?.arch ?? "",
        hostname: overrides?.hostname ?? "",
        device: overrides?.device ?? "",
      },
    },
  };
}

describe("SourceHub", () => {
  beforeEach(cleanAll);

  it("relays daemon messages to UI", async () => {
    const userUuid = "relay-test-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);
    const uiWs = await connectWs("/ws/ui", userUuid);

    // Drain initial empty SourceState sent on UI connect
    await waitForRelayedMessage(uiWs);

    sendProto(daemonWs, {
      payload: {
        $case: "parseCompleted",
        parseCompleted: {
          gameId: "d2r",
          fileName: "",
          identity: undefined,
          summary: "Hammerdin, Level 89 Paladin",
          sectionsCount: 0,
          sizeBytes: 0,
        },
      },
    });

    const received = await waitForRelayedMessage(uiWs);
    const pc = requireInnerPayload(received, "parseCompleted");
    expect(pc.gameId).toBe("d2r");
    expect(pc.summary).toBe("Hammerdin, Level 89 Paladin");

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  // UI-daemon relay is temporarily removed -- UserHub's webSocketMessage
  // is a no-op until bi-directional commands are implemented.

  it("persists daemon events to D1", async () => {
    const userUuid = "persist-test-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);
    const uiWs = await connectWs("/ws/ui", userUuid);

    await waitForRelayedMessage(uiWs);

    sendProto(daemonWs, sourceOnlineMsg());

    await waitForRelayedMessage(uiWs);

    const rows = await env.DB.prepare(
      "SELECT * FROM source_events WHERE event_type = 'sourceOnline'",
    ).all();

    expect(rows.results.length).toBeGreaterThanOrEqual(1);
    const row = rows.results[0]!;
    expect(row.source_uuid).toBe(sourceUuid);
    expect(row.event_type).toBe("sourceOnline");

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  it("requires auth for WebSocket connections", async () => {
    const resp = await SELF.fetch("https://test-host/ws/daemon", {
      headers: { Upgrade: "websocket" },
    });
    expect(resp.status).toBe(401);
  });

  it("authenticates via Sec-WebSocket-Protocol header", async () => {
    const userUuid = "subprotocol-auth-user";

    const resp = await SELF.fetch("https://test-host/ws/ui", {
      headers: {
        Upgrade: "websocket",
        "Sec-WebSocket-Protocol": `access_token.${userUuid}`,
      },
    });

    expect(resp.status).toBe(101);
    expect(resp.webSocket).toBeTruthy();
    expect(resp.headers.get("Sec-WebSocket-Protocol")).toBe(`access_token.${userUuid}`);

    const ws = resp.webSocket!;
    ws.accept();
    await closeWs(ws);
  });

  it("sends SourceState then activity feed on UI connect (cold start)", async () => {
    const userUuid = "coldstart-test-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    const events: readonly Message[] = [
      sourceOnlineMsg(),
      {
        payload: {
          $case: "scanCompleted",
          scanCompleted: { gameId: "d2r", path: "", filesFound: 3, fileNames: [] },
        },
      },
      {
        payload: {
          $case: "parseCompleted",
          parseCompleted: {
            gameId: "d2r",
            fileName: "",
            identity: undefined,
            summary: "Hammerdin, Level 89",
            sectionsCount: 0,
            sizeBytes: 0,
          },
        },
      },
    ];

    for (const event of events) {
      sendProto(daemonWs, event);
      await waitForRelayedMessage(temporaryUi);
    }

    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);

    const msg1 = await waitForRelayedMessage(freshUi);
    expect(msg1.message?.payload?.$case).toBe("sourceState");

    const msg2 = await waitForRelayedMessage(freshUi);
    const case2 = msg2.message?.payload?.$case;
    expect(["sourceOnline", "scanCompleted", "parseCompleted"]).toContain(case2);
    expect(msg2.serverTimestamp).toBeDefined();

    await closeWs(freshUi);
    await closeWs(daemonWs);
  });

  it("builds SourceState with online source from sourceOnline", async () => {
    const userUuid = "ds-online-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(freshUi);

    const ds = requireInnerPayload(msg, "sourceState");
    expect(ds.sources).toHaveLength(1);
    expect(ds.sources[0]!.sourceId).toBe(sourceUuid);
    expect(ds.sources[0]!.online).toBe(true);

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("marks source offline on sourceOffline", async () => {
    const userUuid = "ds-offline-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);

    sendProto(daemon, {
      payload: { $case: "sourceOffline", sourceOffline: { timestamp: undefined } },
    });
    await waitForRelayedMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(freshUi);

    const ds = requireInnerPayload(msg, "sourceState");
    const source = ds.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    expect(source?.online).toBeFalsy();

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("tracks game status from watching event", async () => {
    const userUuid = "ds-watching-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);

    sendProto(daemon, {
      payload: {
        $case: "watching",
        watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 5 },
      },
    });
    await waitForRelayedMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(freshUi);

    const ds = requireInnerPayload(msg, "sourceState");
    const game = ds.sources[0]?.games.find((g) => g.gameId === "d2r");
    expect(game?.status).toBe(2);

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("tracks saves from pushCompleted", async () => {
    const userUuid = "ds-push-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);

    sendProto(daemon, {
      payload: {
        $case: "pushCompleted",
        pushCompleted: {
          gameId: "d2r",
          saveUuid: "save-123",
          summary: "Hammerdin Lv89",
          snapshotSizeBytes: 0,
          durationMs: 0,
          identity: undefined,
        },
      },
    });
    await waitForRelayedMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(freshUi);

    const ds = requireInnerPayload(msg, "sourceState");
    const save = ds.sources[0]?.games[0]?.saves.find((s) => s.saveUuid === "save-123");
    expect(save?.summary).toBe("Hammerdin Lv89");

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("marks source offline on daemon WebSocket close", async () => {
    const userUuid = "ds-wsclose-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);
    await closeWs(temporaryUi);

    await closeWs(daemon);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(freshUi);

    const ds = requireInnerPayload(msg, "sourceState");
    const source = ds.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    expect(source?.online).toBeFalsy();

    await closeWs(freshUi);
  });

  it("tracks multiple sources independently via UserHub aggregation", async () => {
    const userUuid = "ds-multi-source-user";

    const sourceA = await seedSource(userUuid);
    const sourceB = await seedSource(userUuid);

    const daemonA = await connectDaemonWs(sourceA.sourceToken);
    const daemonB = await connectDaemonWs(sourceB.sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    sendProto(daemonA, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);
    sendProto(daemonA, {
      payload: {
        $case: "watching",
        watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 3 },
      },
    });
    await waitForRelayedMessage(temporaryUi);

    sendProto(daemonB, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);
    sendProto(daemonB, {
      payload: {
        $case: "watching",
        watching: { gameId: "stardew", path: "/saves/stardew", filesMonitored: 1 },
      },
    });
    await waitForRelayedMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(freshUi);

    const ds = requireInnerPayload(msg, "sourceState");
    expect(ds.sources).toHaveLength(2);

    const sourceAState = ds.sources.find((d) => d.sourceId === sourceA.sourceUuid);
    const sourceBState = ds.sources.find((d) => d.sourceId === sourceB.sourceUuid);

    expect(sourceAState).toBeDefined();
    expect(sourceAState!.online).toBe(true);
    expect(sourceAState!.games.find((g) => g.gameId === "d2r")).toBeDefined();

    expect(sourceBState).toBeDefined();
    expect(sourceBState!.online).toBe(true);
    expect(sourceBState!.games.find((g) => g.gameId === "stardew")).toBeDefined();

    await closeWs(freshUi);
    await closeWs(daemonA);
    await closeWs(daemonB);
  });

  it("marks only the disconnected source offline", async () => {
    const userUuid = "ds-multi-close-user";

    const sourceA = await seedSource(userUuid);
    const sourceB = await seedSource(userUuid);

    const daemonA = await connectDaemonWs(sourceA.sourceToken);
    const daemonB = await connectDaemonWs(sourceB.sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    sendProto(daemonA, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);
    sendProto(daemonB, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);
    await closeWs(temporaryUi);

    await closeWs(daemonA);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(freshUi);

    const ds = requireInnerPayload(msg, "sourceState");
    const sourceAState = ds.sources.find((d) => d.sourceId === sourceA.sourceUuid);
    const sourceBState = ds.sources.find((d) => d.sourceId === sourceB.sourceUuid);

    expect(sourceAState).toBeDefined();
    expect(sourceAState?.online).toBeFalsy();
    expect(sourceBState).toBeDefined();
    expect(sourceBState?.online).toBe(true);

    await closeWs(freshUi);
    await closeWs(daemonB);
  });

  it("stores identity from pushCompleted in SourceState", async () => {
    const userUuid = "ds-identity-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);

    sendProto(daemon, {
      payload: {
        $case: "pushCompleted",
        pushCompleted: {
          gameId: "d2r",
          saveUuid: "save-abc",
          summary: "Hammerdin, Level 89 Paladin",
          snapshotSizeBytes: 0,
          durationMs: 0,
          identity: { name: "Hammerdin", extra: { class: "Paladin", level: 89 } },
        },
      },
    });
    await waitForRelayedMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(freshUi);

    const ds = requireInnerPayload(msg, "sourceState");
    const save = ds.sources[0]?.games[0]?.saves.find((s) => s.saveUuid === "save-abc");
    expect(save?.identity?.name).toBe("Hammerdin");

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("scopes configUpdate to the target source only", async () => {
    const userUuid = "config-scope-user";

    const sourceA = await seedSource(userUuid);
    const sourceB = await seedSource(userUuid);

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceA.sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    const daemonA = await connectDaemonWs(sourceA.sourceToken);
    const daemonB = await connectDaemonWs(sourceB.sourceToken);

    await sendSourceOnlineAndDrainLinkState(daemonA);
    const configA = await waitForProtoMessage(daemonA);
    const cuA = requirePayload(configA, "configUpdate");

    await sendSourceOnlineAndDrainLinkState(daemonB);
    const configB = await waitForProtoMessage(daemonB);
    const cuB = requirePayload(configB, "configUpdate");

    expect(Object.keys(cuA.games)).toHaveLength(1);
    expect(Object.keys(cuB.games)).toHaveLength(0);

    await closeWs(daemonA);
    await closeWs(daemonB);
  });

  it("injects sourceId on live relay", async () => {
    const userUuid = "sourceid-relay-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);
    const uiWs = await connectWs("/ws/ui", userUuid);
    await waitForRelayedMessage(uiWs);

    sendProto(daemonWs, sourceOnlineMsg());
    await waitForRelayedMessage(uiWs);
    await waitForRelayedMessage(uiWs);

    sendProto(daemonWs, {
      payload: {
        $case: "watching",
        watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 5 },
      },
    });
    const received = await waitForRelayedMessage(uiWs);
    expect(received.message?.payload?.$case).toBe("watching");
    expect(received.sourceId).toBe(sourceUuid);

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  it("injects sourceId on replayed events", async () => {
    const userUuid = "sourceid-replay-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);
    await waitForRelayedMessage(temporaryUi);

    sendProto(daemonWs, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);
    await waitForRelayedMessage(temporaryUi);
    sendProto(daemonWs, {
      payload: {
        $case: "parseCompleted",
        parseCompleted: {
          gameId: "d2r",
          fileName: "",
          identity: undefined,
          summary: "Hammerdin, Level 89",
          sectionsCount: 0,
          sizeBytes: 0,
        },
      },
    });
    await waitForRelayedMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    await waitForRelayedMessage(freshUi);

    const replayed: RelayedMessage[] = [];
    try {
      while (replayed.length < 10) {
        const replayMsg = await waitForRelayedMessage(freshUi, 500);
        replayed.push(replayMsg);
      }
    } catch {
      // Timeout expected
    }

    expect(replayed.length).toBeGreaterThanOrEqual(1);
    const withSourceId = replayed.filter((m) => m.sourceId === sourceUuid);
    expect(withSourceId.length).toBeGreaterThanOrEqual(1);

    await closeWs(freshUi);
    await closeWs(daemonWs);
  });

  it("sends rescanGame to daemon via /rescan endpoint", async () => {
    const userUuid = "rescan-test-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);

    sendProto(daemonWs, sourceOnlineMsg());
    await waitForProtoMessage(daemonWs);

    const rescanPromise = waitForProtoMessage(daemonWs);

    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    const resp = await doStub.fetch(
      new Request("https://do/rescan", {
        method: "POST",
        body: JSON.stringify({ gameId: "d2r" }),
      }),
    );

    expect(resp.status).toBe(200);
    const body = await resp.json<{ sent: boolean; daemon_count: number }>();
    expect(body.sent).toBe(true);
    expect(body.daemon_count).toBe(1);

    const received = await rescanPromise;
    const rescan = requirePayload(received, "rescanGame");
    expect(rescan.gameId).toBe("d2r");

    await closeWs(daemonWs);
  });

  it("returns daemon_online: false from /rescan when no daemon connected", async () => {
    const { sourceUuid } = await seedSource(null);

    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    const resp = await doStub.fetch(
      new Request("https://do/rescan", {
        method: "POST",
        body: JSON.stringify({ gameId: "d2r" }),
      }),
    );

    expect(resp.status).toBe(200);
    const body = await resp.json<{ sent: boolean; daemon_online: boolean }>();
    expect(body.sent).toBe(false);
    expect(body.daemon_online).toBe(false);
  });

  it("isolates users -- messages don't leak across DOs", async () => {
    const { sourceToken: tokenA } = await seedSource("user-a");
    const daemonA = await connectDaemonWs(tokenA);
    const uiA = await connectWs("/ws/ui", "user-a");
    const uiB = await connectWs("/ws/ui", "user-b");

    sendProto(daemonA, {
      payload: {
        $case: "pluginUpdated",
        pluginUpdated: { gameId: "d2r", version: "1.0.0" },
      },
    });

    const received = await waitForRelayedMessage(uiA);
    const pu = requireInnerPayload(received, "pluginUpdated");
    expect(pu.gameId).toBe("d2r");
    expect(pu.version).toBe("1.0.0");

    const noMessage = await waitForRelayedMessage(uiB, 200).catch(() => null);
    expect(noMessage).toBeNull();

    await closeWs(daemonA);
    await closeWs(uiA);
    await closeWs(uiB);
  });

  it("sends sourceUpdateAvailable when daemon version is stale", async () => {
    const userUuid = "update-check-user";
    const { sourceToken } = await seedSource(userUuid);

    const manifest = {
      version: "0.2.0",
      platforms: {
        "linux-amd64": {
          url: "https://install.savecraft.gg/daemon/savecraft-daemon-linux-amd64",
          sha256: "abc123",
          signatureUrl: "https://install.savecraft.gg/daemon/savecraft-daemon-linux-amd64.sig",
        },
      },
    };
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get("https://install.savecraft.gg")
      .intercept({ path: "/daemon/manifest.json", method: "GET" })
      .reply(200, JSON.stringify(manifest), {
        headers: { "content-type": "application/json" },
      });

    const daemonWs = await connectDaemonWs(sourceToken);

    await sendSourceOnlineAndDrainLinkState(daemonWs, "0.1.0", "linux-amd64");
    // After link state, server sends configUpdate and possibly sourceUpdateAvailable.
    // Drain up to 3 messages looking for sourceUpdateAvailable.
    let updateMsg: Message | undefined;
    for (let index = 0; index < 3; index++) {
      const msg = await waitForProtoMessage(daemonWs).catch(() => null);
      if (msg?.payload?.$case === "sourceUpdateAvailable") {
        updateMsg = msg;
        break;
      }
    }

    expect(updateMsg).toBeDefined();
    const update = requirePayload(updateMsg!, "sourceUpdateAvailable");
    expect(update.version).toBe("0.2.0");
    expect(update.url).toBe("https://install.savecraft.gg/daemon/savecraft-daemon-linux-amd64");
    expect(update.sha256).toBe("abc123");

    await closeWs(daemonWs);
    fetchMock.deactivate();
  });

  it("does not relay sourceHeartbeat to UI", async () => {
    const userUuid = "heartbeat-relay-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);
    const uiWs = await connectWs("/ws/ui", userUuid);

    sendProto(daemonWs, sourceOnlineMsg());
    await waitForRelayedMessage(uiWs);
    await waitForRelayedMessage(uiWs);

    sendProto(daemonWs, {
      payload: { $case: "sourceHeartbeat", sourceHeartbeat: {} },
    });

    const messages: RelayedMessage[] = [];
    try {
      while (messages.length < 5) {
        const drainMsg = await waitForRelayedMessage(uiWs, 200);
        messages.push(drainMsg);
      }
    } catch {
      // Timeout expected
    }
    const heartbeatRelayed = messages.some((m) => m.message?.payload?.$case === "sourceHeartbeat");
    expect(heartbeatRelayed).toBe(false);

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  it("updates lastSeen on heartbeat", async () => {
    const userUuid = "heartbeat-lastseen-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    await waitForRelayedMessage(temporaryUi);
    await closeWs(temporaryUi);

    const ui1 = await connectWs("/ws/ui", userUuid);
    const msg1 = await waitForRelayedMessage(ui1);
    const ds1 = requireInnerPayload(msg1, "sourceState");
    const initialLastSeen = ds1.sources[0]!.lastSeen!.getTime();
    await closeWs(ui1);

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    sendProto(daemon, {
      payload: { $case: "sourceHeartbeat", sourceHeartbeat: {} },
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    const ui2 = await connectWs("/ws/ui", userUuid);
    const msg2 = await waitForRelayedMessage(ui2);
    const ds2 = requireInnerPayload(msg2, "sourceState");
    const updatedLastSeen = ds2.sources[0]!.lastSeen!.getTime();

    expect(updatedLastSeen).toBeGreaterThan(initialLastSeen);

    await closeWs(ui2);
    await closeWs(daemon);
  });

  it("evicts stale source via alarm", async () => {
    const userUuid = "alarm-evict-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const uiWs = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    await waitForRelayedMessage(uiWs);
    await closeWs(uiWs);

    const preUi = await connectWs("/ws/ui", userUuid);
    const preMsg = await waitForRelayedMessage(preUi);
    const preDs = requireInnerPayload(preMsg, "sourceState");
    const preSource = preDs.sources.find((d) => d.sourceId === sourceUuid);
    expect(preSource).toBeDefined();
    expect(preSource?.online).toBe(true);
    await closeWs(preUi);

    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    const freshUi = await connectWs("/ws/ui", userUuid);
    const freshMsg = await waitForRelayedMessage(freshUi);
    const ds = requireInnerPayload(freshMsg, "sourceState");
    const source = ds.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    expect(source?.online).toBeFalsy();

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("graceful offline deletes alarm -- lastSeen unchanged after wait", async () => {
    const userUuid = "alarm-lifecycle-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const uiWs = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    await waitForRelayedMessage(uiWs);

    sendProto(daemon, {
      payload: { $case: "sourceOffline", sourceOffline: { timestamp: undefined } },
    });
    await waitForRelayedMessage(uiWs);

    await closeWs(daemon);
    await closeWs(uiWs);

    const ui1 = await connectWs("/ws/ui", userUuid);
    const msg1 = await waitForRelayedMessage(ui1);
    const ds1 = requireInnerPayload(msg1, "sourceState");
    const lastSeenBefore = ds1.sources.find((d) => d.sourceId === sourceUuid)?.lastSeen;
    expect(lastSeenBefore).toBeDefined();
    await closeWs(ui1);

    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });

    const ui2 = await connectWs("/ws/ui", userUuid);
    const msg2 = await waitForRelayedMessage(ui2);
    const ds2 = requireInnerPayload(msg2, "sourceState");
    const lastSeenAfter = ds2.sources.find((d) => d.sourceId === sourceUuid)?.lastSeen;
    expect(lastSeenAfter?.toISOString()).toBe(lastSeenBefore?.toISOString());

    await closeWs(ui2);
  });

  it("unlinked source can connect and process events locally", async () => {
    const { sourceUuid, sourceToken } = await seedSource(null);

    const daemonWs = await connectDaemonWs(sourceToken);
    sendProto(daemonWs, sourceOnlineMsg());

    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    const resp = await doStub.fetch(
      new Request("https://do/rescan", {
        method: "POST",
        body: JSON.stringify({ gameId: "d2r" }),
      }),
    );
    const body = await resp.json<{ sent: boolean; daemon_count: number }>();
    expect(body.sent).toBe(true);
    expect(body.daemon_count).toBe(1);

    await closeWs(daemonWs);
  });

  it("source linking mid-session starts forwarding to UserHub", async () => {
    const userUuid = "link-mid-session-user";

    const { sourceUuid, sourceToken } = await seedSource(null);

    const daemonWs = await connectDaemonWs(sourceToken);
    // For unlinked sources, notifyLinkState generates a fresh link code.
    const linkStateMsg = await sendSourceOnlineAndDrainLinkState(daemonWs);
    const linkCode = requirePayload(linkStateMsg, "refreshLinkCodeResult").linkCode;

    const linkResp = await SELF.fetch("https://test-host/api/v1/source/link", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userUuid}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: linkCode }),
    });
    expect(linkResp.status).toBe(200);

    const uiWs = await connectWs("/ws/ui", userUuid);
    const uiMsg = await waitForRelayedMessage(uiWs);

    const ds = requireInnerPayload(uiMsg, "sourceState");
    const source = ds.sources.find((s) => s.sourceId === sourceUuid);
    expect(source).toBeDefined();
    expect(source!.online).toBe(true);

    sendProto(daemonWs, {
      payload: {
        $case: "watching",
        watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 3 },
      },
    });
    let relayed: RelayedMessage;
    do {
      relayed = await waitForRelayedMessage(uiWs);
    } while (relayed.message?.payload?.$case !== "watching");
    expect(relayed.message.payload.$case).toBe("watching");

    await closeWs(uiWs);
    await closeWs(daemonWs);
  });

  it("rescan returns error when can_rescan is false", async () => {
    const userUuid = "no-rescan-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare("UPDATE sources SET can_rescan = 0 WHERE source_uuid = ?")
      .bind(sourceUuid)
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);
    sendProto(daemonWs, sourceOnlineMsg());
    await waitForProtoMessage(daemonWs);

    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    const resp = await doStub.fetch(
      new Request("https://do/rescan", {
        method: "POST",
        body: JSON.stringify({ gameId: "d2r" }),
      }),
    );

    expect(resp.status).toBe(200);
    const body = await resp.json<{ sent: boolean; reason?: string }>();
    expect(body.sent).toBe(false);
    expect(body.reason).toBe("rescan_not_supported");

    await closeWs(daemonWs);
  });

  it("skips config push when can_receive_config is false", async () => {
    const userUuid = "no-config-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare("UPDATE sources SET can_receive_config = 0 WHERE source_uuid = ?")
      .bind(sourceUuid)
      .run();
    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemonWs);

    const noConfig = await waitForProtoMessage(daemonWs, 500).catch(() => null);
    expect(noConfig).toBeNull();

    await closeWs(daemonWs);
  });

  it("decorates SourceState with source_kind, hostname, and capabilities from D1", async () => {
    const userUuid = "meta-decoration-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare(
      "UPDATE sources SET source_kind = 'plugin', hostname = 'gaming-rig', can_rescan = 0, can_receive_config = 0 WHERE source_uuid = ?",
    )
      .bind(sourceUuid)
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);
    const uiWs = await connectWs("/ws/ui", userUuid);

    await waitForRelayedMessage(uiWs);

    sendProto(daemonWs, sourceOnlineMsg());

    await waitForRelayedMessage(uiWs);
    const stateMsg = await waitForRelayedMessage(uiWs);

    const ds = requireInnerPayload(stateMsg, "sourceState");
    const source = ds.sources[0]!;
    expect(source.sourceId).toBe(sourceUuid);
    expect(source.sourceKind).toBe("plugin");
    expect(source.hostname).toBe("gaming-rig");
    expect(source.canRescan).toBe(false);
    expect(source.canReceiveConfig).toBe(false);
    expect(source.online).toBe(true);

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  it("returns live source status via /status endpoint", async () => {
    const userUuid = "status-endpoint-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    const offlineResp = await doStub.fetch(new Request("https://do/status", { method: "GET" }));
    expect(offlineResp.status).toBe(200);
    const offlineBody = await offlineResp.json<{ daemon_online: boolean }>();
    expect(offlineBody.daemon_online).toBe(false);

    const daemonWs = await connectDaemonWs(sourceToken);
    sendProto(daemonWs, sourceOnlineMsg());
    await waitForProtoMessage(daemonWs);

    const onlineResp = await doStub.fetch(new Request("https://do/status", { method: "GET" }));
    const onlineBody = await onlineResp.json<{ daemon_online: boolean }>();
    expect(onlineBody.daemon_online).toBe(true);

    await closeWs(daemonWs);
  });

  it("auto-creates config when daemon sends gameDetected", async () => {
    const userUuid = "auto-enable-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);

    sendProto(daemonWs, sourceOnlineMsg());
    await waitForProtoMessage(daemonWs);

    sendProto(daemonWs, {
      payload: {
        $case: "gameDetected",
        gameDetected: { gameId: "d2r", path: "/home/user/.d2r/saves", saveCount: 3 },
      },
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });

    const rows = await env.DB.prepare(
      "SELECT * FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceUuid, "d2r")
      .all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.save_path).toBe("/home/user/.d2r/saves");
    expect(rows.results[0]!.enabled).toBe(1);

    await closeWs(daemonWs);
  });

  it("pushes auto-created config to daemon on reconnect", async () => {
    const userUuid = "auto-enable-reconnect-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon1 = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon1);
    await waitForProtoMessage(daemon1); // drain configUpdate (empty)
    sendProto(daemon1, {
      payload: {
        $case: "gameDetected",
        gameDetected: { gameId: "d2r", path: "/saves/d2r", saveCount: 2 },
      },
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    await closeWs(daemon1);

    const daemon2 = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon2);
    const configMsg = await waitForProtoMessage(daemon2);

    const cu = requirePayload(configMsg, "configUpdate");
    const d2rConfig = cu.games.d2r;
    expect(d2rConfig).toBeDefined();
    expect(d2rConfig!.savePath).toBe("/saves/d2r");
    expect(d2rConfig!.enabled).toBe(true);

    await closeWs(daemon2);
  });

  it("does not overwrite existing enabled config on gameDetected", async () => {
    const userUuid = "no-overwrite-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "d2r", "/custom/path", 1, JSON.stringify([".d2s"]))
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);

    await sendSourceOnlineAndDrainLinkState(daemonWs);
    await waitForProtoMessage(daemonWs); // drain configUpdate

    sendProto(daemonWs, {
      payload: {
        $case: "gameDetected",
        gameDetected: { gameId: "d2r", path: "/detected/path", saveCount: 1 },
      },
    });

    const noConfig = await waitForProtoMessage(daemonWs, 500).catch(() => null);
    expect(noConfig).toBeNull();

    const row = await env.DB.prepare(
      "SELECT save_path FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceUuid, "d2r")
      .first<{ save_path: string }>();
    expect(row!.save_path).toBe("/custom/path");

    await closeWs(daemonWs);
  });

  it("does not re-enable disabled config on gameDetected", async () => {
    const userUuid = "no-reenable-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "d2r", "/saves/d2r", 0, JSON.stringify([".d2s"]))
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);

    await sendSourceOnlineAndDrainLinkState(daemonWs);
    await waitForProtoMessage(daemonWs); // drain configUpdate

    sendProto(daemonWs, {
      payload: {
        $case: "gameDetected",
        gameDetected: { gameId: "d2r", path: "/detected/path", saveCount: 2 },
      },
    });

    const noConfig = await waitForProtoMessage(daemonWs, 500).catch(() => null);
    expect(noConfig).toBeNull();

    const row = await env.DB.prepare(
      "SELECT enabled FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceUuid, "d2r")
      .first<{ enabled: number }>();
    expect(row!.enabled).toBe(0);

    await closeWs(daemonWs);
  });

  it("auto-creates config from gamesDiscovered and pushes config to daemon", async () => {
    const userUuid = "auto-discover-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);

    sendProto(daemonWs, sourceOnlineMsg());
    await waitForProtoMessage(daemonWs);

    sendProto(daemonWs, {
      payload: {
        $case: "gamesDiscovered",
        gamesDiscovered: {
          games: [
            {
              gameId: "d2r",
              name: "Diablo II: Resurrected",
              path: "/home/user/.d2r/saves",
              fileCount: 2,
              fileExtensions: [],
            },
            {
              gameId: "sdv",
              name: "Stardew Valley",
              path: "/home/user/.sdv/saves",
              fileCount: 1,
              fileExtensions: [],
            },
          ],
        },
      },
    });

    const configMsg = await waitForProtoMessage(daemonWs);
    const cu = requirePayload(configMsg, "configUpdate");
    expect(cu.games.d2r).toBeDefined();
    expect(cu.games.d2r!.savePath).toBe("/home/user/.d2r/saves");
    expect(cu.games.d2r!.enabled).toBe(true);
    expect(cu.games.sdv).toBeDefined();
    expect(cu.games.sdv!.savePath).toBe("/home/user/.sdv/saves");
    expect(cu.games.sdv!.enabled).toBe(true);

    const rows = await env.DB.prepare(
      "SELECT game_id, save_path, enabled FROM source_configs WHERE source_uuid = ? ORDER BY game_id",
    )
      .bind(sourceUuid)
      .all<{ game_id: string; save_path: string; enabled: number }>();
    expect(rows.results).toHaveLength(2);
    expect(rows.results[0]!.game_id).toBe("d2r");
    expect(rows.results[1]!.game_id).toBe("sdv");

    await closeWs(daemonWs);
  });

  it("does not overwrite existing config on gamesDiscovered", async () => {
    const userUuid = "no-overwrite-discover-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "d2r", "/custom/path", 1, JSON.stringify([".d2s"]))
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);

    sendProto(daemonWs, sourceOnlineMsg());
    await waitForProtoMessage(daemonWs);

    sendProto(daemonWs, {
      payload: {
        $case: "gamesDiscovered",
        gamesDiscovered: {
          games: [
            {
              gameId: "d2r",
              name: "Diablo II: Resurrected",
              path: "/detected/path",
              fileCount: 2,
              fileExtensions: [],
            },
            {
              gameId: "sdv",
              name: "Stardew Valley",
              path: "/home/user/.sdv/saves",
              fileCount: 1,
              fileExtensions: [],
            },
          ],
        },
      },
    });

    const configMsg = await waitForProtoMessage(daemonWs);
    const cu = requirePayload(configMsg, "configUpdate");
    expect(cu.games.d2r!.savePath).toBe("/custom/path");
    expect(cu.games.sdv!.savePath).toBe("/home/user/.sdv/saves");

    await closeWs(daemonWs);
  });

  it("does not set ACTIVATING status during pushConfigToSource", async () => {
    const userUuid = "no-activating-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);
    const uiWs = await connectWs("/ws/ui", userUuid);
    await waitForRelayedMessage(uiWs);

    sendProto(daemonWs, sourceOnlineMsg());
    await waitForProtoMessage(daemonWs);

    const messages: RelayedMessage[] = [];
    try {
      while (messages.length < 10) {
        const drainMsg = await waitForRelayedMessage(uiWs, 500);
        messages.push(drainMsg);
      }
    } catch {
      // Timeout expected
    }

    const stateMessages = messages.filter((m) => m.message?.payload?.$case === "sourceState");
    for (const stateMsg of stateMessages) {
      const ds = requireInnerPayload(stateMsg, "sourceState");
      for (const source of ds.sources) {
        for (const game of source.games) {
          expect(game.status).not.toBe(5);
        }
      }
    }

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  it("does not send sourceUpdateAvailable when daemon is current", async () => {
    const userUuid = "update-current-user";
    const { sourceToken } = await seedSource(userUuid);

    const manifest = {
      version: "0.1.0",
      platforms: {
        "linux-amd64": {
          url: "https://install.savecraft.gg/daemon/savecraft-daemon-linux-amd64",
          sha256: "abc123",
          signatureUrl: "https://install.savecraft.gg/daemon/savecraft-daemon-linux-amd64.sig",
        },
      },
    };
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get("https://install.savecraft.gg")
      .intercept({ path: "/daemon/manifest.json", method: "GET" })
      .reply(200, JSON.stringify(manifest), {
        headers: { "content-type": "application/json" },
      });

    const daemonWs = await connectDaemonWs(sourceToken);

    await sendSourceOnlineAndDrainLinkState(daemonWs, "0.2.0", "linux-amd64");

    const msg1 = await waitForProtoMessage(daemonWs);
    requirePayload(msg1, "configUpdate");

    const noUpdate = await waitForProtoMessage(daemonWs, 200).catch(() => null);
    expect(noUpdate).toBeNull();

    await closeWs(daemonWs);
    fetchMock.deactivate();
  });

  it("persists ConfigResult to D1 source_configs", async () => {
    const userUuid = "config-result-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"])),
      env.DB.prepare(
        `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(sourceUuid, "sdv", "/saves/sdv", 1, JSON.stringify([".xml"])),
    ]);

    const daemonWs = await connectDaemonWs(sourceToken);
    const uiWs = await connectWs("/ws/ui", userUuid);
    await waitForRelayedMessage(uiWs);

    sendProto(daemonWs, sourceOnlineMsg());
    await waitForProtoMessage(daemonWs);
    await waitForRelayedMessage(uiWs);
    await waitForRelayedMessage(uiWs);

    sendProto(daemonWs, {
      payload: {
        $case: "configResult",
        configResult: {
          results: {
            d2r: { success: true, error: "", resolvedPath: "/home/user/saves/d2r" },
            sdv: {
              success: false,
              error: "path not found: /saves/sdv",
              resolvedPath: "/saves/sdv",
            },
          },
        },
      },
    });

    const received = await waitForRelayedMessage(uiWs);
    requireInnerPayload(received, "configResult");

    const d2rRow = await env.DB.prepare(
      "SELECT config_status, resolved_path, last_error, result_at FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceUuid, "d2r")
      .first<{
        config_status: string;
        resolved_path: string;
        last_error: string;
        result_at: string;
      }>();
    expect(d2rRow).toBeDefined();
    expect(d2rRow!.config_status).toBe("success");
    expect(d2rRow!.resolved_path).toBe("/home/user/saves/d2r");
    expect(d2rRow!.last_error).toBe("");
    expect(d2rRow!.result_at).toBeTruthy();

    const sdvRow = await env.DB.prepare(
      "SELECT config_status, resolved_path, last_error, result_at FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceUuid, "sdv")
      .first<{
        config_status: string;
        resolved_path: string;
        last_error: string;
        result_at: string;
      }>();
    expect(sdvRow).toBeDefined();
    expect(sdvRow!.config_status).toBe("error");
    expect(sdvRow!.resolved_path).toBe("/saves/sdv");
    expect(sdvRow!.last_error).toBe("path not found: /saves/sdv");
    expect(sdvRow!.result_at).toBeTruthy();

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  // ── PushSave over WebSocket ─────────────────────────────────────

  it("handles pushSave: writes to D1 and responds with PushSaveResult", async () => {
    const userUuid = "ws-push-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);

    // Must go online first so sourceId is stored
    sendProto(daemon, sourceOnlineMsg());
    await waitForProtoMessage(daemon); // configUpdate response
    // Small delay for state to settle
    await new Promise((r) => setTimeout(r, 50));

    // Send PushSave
    const parsedAt = new Date("2026-02-25T21:30:00Z");
    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          identity: { name: "Hammerdin", extra: {} },
          summary: "Hammerdin, Level 89 Paladin",
          gameId: "d2r",
          parsedAt,
          sections: [
            {
              name: "character_overview",
              description: "Level, class, difficulty",
              data: { name: "Hammerdin", class: "Paladin", level: 89 },
            },
            {
              name: "skills",
              description: "Skill allocations",
              data: { hammer: 20, vigor: 20 },
            },
          ],
        },
      },
    });

    // Should receive PushSaveResult back
    const resultMsg = await waitForProtoMessage(daemon);
    const result = requirePayload(resultMsg, "pushSaveResult");
    expect(result.saveUuid).toBeTruthy();

    // Verify D1 save row
    const save = await env.DB.prepare("SELECT * FROM saves WHERE uuid = ?")
      .bind(result.saveUuid)
      .first<{ save_name: string; summary: string; game_id: string }>();
    expect(save).not.toBeNull();
    expect(save!.save_name).toBe("Hammerdin");
    expect(save!.summary).toBe("Hammerdin, Level 89 Paladin");
    expect(save!.game_id).toBe("d2r");

    // Verify D1 sections
    const sections = await env.DB.prepare(
      "SELECT name, description, data FROM sections WHERE save_uuid = ? ORDER BY name",
    )
      .bind(result.saveUuid)
      .all<{ name: string; description: string; data: string }>();
    expect(sections.results).toHaveLength(2);
    expect(sections.results[0]!.name).toBe("character_overview");
    expect(sections.results[1]!.name).toBe("skills");

    const charData = JSON.parse(sections.results[0]!.data) as { class: string };
    expect(charData.class).toBe("Paladin");

    await closeWs(daemon);
  });

  it("pushSave updates SourceState with pushCompleted", async () => {
    const userUuid = "ws-push-state-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);

    // Go online first
    sendProto(daemon, sourceOnlineMsg());
    await waitForProtoMessage(daemon); // configUpdate response
    await new Promise((r) => setTimeout(r, 50));

    // Connect UI after source is online to avoid draining variable sourceOnline messages
    const ui = await connectWs("/ws/ui", userUuid);
    await waitForRelayedMessage(ui); // initial state

    // Send PushSave
    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          identity: { name: "TestChar", extra: {} },
          summary: "Test Character",
          gameId: "d2r",
          parsedAt: new Date("2026-03-01T12:00:00Z"),
          sections: [{ name: "overview", description: "test", data: { level: 50 } }],
        },
      },
    });

    // Daemon gets PushSaveResult
    const resultMsg = await waitForProtoMessage(daemon);
    const result = requirePayload(resultMsg, "pushSaveResult");
    expect(result.saveUuid).toBeTruthy();

    // UI gets pushCompleted event
    const pushEvent = await waitForRelayedMessageMatching(
      ui,
      (msg) => msg.message?.payload?.$case === "pushCompleted",
    );
    const completed = requireInnerPayload(pushEvent, "pushCompleted");
    expect(completed.saveUuid).toBe(result.saveUuid);
    expect(completed.summary).toBe("Test Character");

    // State update should include the save — reconnect UI to get fresh state
    await closeWs(ui);
    const freshUi = await connectWs("/ws/ui", userUuid);
    const stateMsg = await waitForRelayedMessage(freshUi);
    const state = requireInnerPayload(stateMsg, "sourceState");
    const game = state.sources[0]?.games.find((g) => g.gameId === "d2r");
    expect(game).toBeDefined();
    const save = game!.saves.find((s) => s.saveUuid === result.saveUuid);
    expect(save?.summary).toBe("Test Character");

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("pushSave from unlinked source stores save with null user_uuid", async () => {
    const { sourceToken, sourceUuid } = await seedSource(null); // unlinked

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForProtoMessage(daemon); // drain configUpdate

    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          identity: { name: "UnlinkedTest", extra: {} },
          summary: "UnlinkedTest",
          gameId: "stardew",
          parsedAt: new Date(),
          sections: [{ name: "overview", description: "test", data: {} }],
        },
      },
    });

    const result = await waitForProtoMessage(daemon);
    const pushResult = requirePayload(result, "pushSaveResult");
    expect(pushResult.saveUuid).toBeTruthy();

    // Save exists with null user_uuid
    const save = await env.DB.prepare(
      "SELECT user_uuid, last_source_uuid FROM saves WHERE save_name = 'UnlinkedTest'",
    ).first<{ user_uuid: string | null; last_source_uuid: string }>();
    expect(save).not.toBeNull();
    expect(save!.user_uuid).toBeNull();
    expect(save!.last_source_uuid).toBe(sourceUuid);

    await closeWs(daemon);
  });

  it("rejects pushSave with too many sections", async () => {
    const userUuid = "push-cap-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForProtoMessage(daemon); // drain configUpdate

    // Build 51 sections (over the 50-section cap)
    const sections = Array.from({ length: 51 }, (_, index) => ({
      name: `section-${String(index)}`,
      description: `Section ${String(index)}`,
      data: { value: index },
    }));

    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "TooManySections", extra: undefined },
          summary: "test",
          parsedAt: new Date(),
          sections,
        },
      },
    });

    // Wait for processing
    await new Promise((r) => setTimeout(r, 200));

    // No save should have been created
    const save = await env.DB.prepare(
      "SELECT 1 FROM saves WHERE save_name = 'TooManySections'",
    ).first();
    expect(save).toBeNull();

    await closeWs(daemon);
  });

  it("rejects pushSave exceeding total size limit", async () => {
    const userUuid = "push-size-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForProtoMessage(daemon); // drain configUpdate

    // Single section with >1MB of data
    const bigData: Record<string, string> = {};
    for (let index = 0; index < 100; index++) {
      bigData[`key${String(index)}`] = "x".repeat(11_000);
    }

    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "TooBig", extra: undefined },
          summary: "test",
          parsedAt: new Date(),
          sections: [{ name: "huge", description: "big section", data: bigData }],
        },
      },
    });

    // Wait for processing
    await new Promise((r) => setTimeout(r, 200));

    // No save should have been created
    const save = await env.DB.prepare("SELECT 1 FROM saves WHERE save_name = 'TooBig'").first();
    expect(save).toBeNull();

    await closeWs(daemon);
  });

  it("rejects pushSave with missing identity", async () => {
    const userUuid = "push-no-identity";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForProtoMessage(daemon); // drain configUpdate

    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: undefined,
          summary: "test",
          parsedAt: new Date(),
          sections: [{ name: "stats", description: "Stats", data: { level: 1 } }],
        },
      },
    });

    await new Promise((r) => setTimeout(r, 200));

    const save = await env.DB.prepare("SELECT 1 FROM saves WHERE user_uuid = ?")
      .bind(userUuid)
      .first();
    expect(save).toBeNull();

    await closeWs(daemon);
  });

  it("rejects pushSave with empty gameId", async () => {
    const userUuid = "push-no-gameid";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForProtoMessage(daemon); // drain configUpdate

    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "",
          identity: { name: "EmptyGameId", extra: undefined },
          summary: "test",
          parsedAt: new Date(),
          sections: [{ name: "stats", description: "Stats", data: { level: 1 } }],
        },
      },
    });

    await new Promise((r) => setTimeout(r, 200));

    const save = await env.DB.prepare(
      "SELECT 1 FROM saves WHERE save_name = 'EmptyGameId'",
    ).first();
    expect(save).toBeNull();

    await closeWs(daemon);
  });

  it("idempotent push updates existing save instead of duplicating", async () => {
    const userUuid = "push-idempotent";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForProtoMessage(daemon); // drain configUpdate

    const pushPayload = (level: number) => ({
      payload: {
        $case: "pushSave" as const,
        pushSave: {
          gameId: "d2r",
          identity: { name: "IdempotentChar", extra: undefined },
          summary: `Level ${String(level)}`,
          parsedAt: new Date(),
          sections: [{ name: "stats", description: "Stats", data: { level } }],
        },
      },
    });

    // First push
    sendProto(daemon, pushPayload(1));
    const first = await waitForProtoMessage(daemon);
    const firstResult = requirePayload(first, "pushSaveResult");

    // Second push — same save name
    sendProto(daemon, pushPayload(42));
    const second = await waitForProtoMessage(daemon);
    const secondResult = requirePayload(second, "pushSaveResult");

    // Same save UUID reused
    expect(secondResult.saveUuid).toBe(firstResult.saveUuid);

    // Only one save row
    const count = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM saves WHERE save_name = 'IdempotentChar' AND user_uuid = ?",
    )
      .bind(userUuid)
      .first<{ cnt: number }>();
    expect(count!.cnt).toBe(1);

    // Section data updated to latest
    const section = await env.DB.prepare(
      "SELECT data FROM sections WHERE save_uuid = ? AND name = 'stats'",
    )
      .bind(secondResult.saveUuid)
      .first<{ data: string }>();
    const parsed = JSON.parse(section!.data);
    expect(parsed.level).toBe(42);

    await closeWs(daemon);
  });

  it("forwards sourceOffline event on daemon disconnect", async () => {
    const userUuid = "disconnect-event-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const uiWs = await connectWs("/ws/ui", userUuid);

    // Drain initial empty state
    await waitForRelayedMessage(uiWs);

    // Send sourceOnline and drain the state update
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForRelayedMessage(uiWs);

    // Now close the daemon — should trigger handleDaemonDisconnect
    // which should forward both sourceOffline event AND state
    const offlineEventPromise = waitForRelayedMessageMatching(
      uiWs,
      (msg) => msg.message?.payload?.$case === "sourceOffline",
      5000,
    );

    await closeWs(daemon);

    // Verify we receive the explicit sourceOffline event (not just state)
    const offlineRelayed = await offlineEventPromise;
    expect(offlineRelayed.sourceId).toBe(sourceUuid);
    expect(offlineRelayed.message?.payload?.$case).toBe("sourceOffline");

    await closeWs(uiWs);
  });

  it("alarm reschedules even after stale eviction", async () => {
    // Verifies the alarm doesn't silently stop after evicting a stale source.
    // After eviction, a new sourceOnline should still get alarm-evicted.
    const userUuid = "alarm-resilience-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    // First cycle: go online, let alarm evict
    const daemon1 = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon1);

    // Wait for alarm to evict (stale threshold 200ms, alarm interval 100ms)
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    // Verify source was evicted
    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    const resp1 = await doStub.fetch(new Request("https://do/debug/state"));
    const debug1 = await resp1.json<{
      sourceState: { sources: { online: boolean }[] };
    }>();
    expect(debug1.sourceState.sources[0]?.online).toBeFalsy();

    await closeWs(daemon1);

    // Second cycle: go online again — alarm should still work
    const daemon2 = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon2);

    // Wait for alarm to evict again
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    const resp2 = await doStub.fetch(new Request("https://do/debug/state"));
    const debug2 = await resp2.json<{
      sourceState: { sources: { online: boolean }[] };
    }>();
    expect(debug2.sourceState.sources[0]?.online).toBeFalsy();

    await closeWs(daemon2);
  });
});
