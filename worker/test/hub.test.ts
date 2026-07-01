import { env, runDurableObjectAlarm, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { Message, RelayedMessage } from "../src/proto/savecraft/v1/protocol";
import {
  GameStatusEnum,
  Message as MessageCodec,
  PushSaveError,
} from "../src/proto/savecraft/v1/protocol";

import {
  ageLastSeenAndFireAlarm,
  cleanAll,
  closeWs,
  connectDaemonWs,
  connectWs,
  pollUntil,
  requireInnerPayload,
  requirePayload,
  seedSource,
  sendProto,
  sendSourceOnlineAndDrainLinkState,
  waitForPayload,
  waitForProtoMessage,
  waitForProtoMessageMatching,
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
  // flushWorkerd runs globally in test/setup.ts's afterEach (drains queued
  // SourceHub → UserHub forwards before teardown), so no per-suite mount here.

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

    closeWs(daemonWs);
    closeWs(uiWs);
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

    closeWs(daemonWs);
    closeWs(uiWs);
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
    closeWs(ws);
  });

  it("sends SourceState then activity feed on UI connect (cold start)", async () => {
    const userUuid = "coldstart-test-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);
    sendProto(daemonWs, sourceOnlineMsg());
    sendProto(daemonWs, {
      payload: {
        $case: "scanCompleted",
        scanCompleted: { gameId: "d2r", path: "", filesFound: 3, fileNames: [] },
      },
    });
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

    // Drain UI for the cold-start handshake: first a sourceState snapshot,
    // then the persisted events replayed. Each matcher waits for a specific
    // payload type, draining intermediate state updates.
    const freshUi = await connectWs("/ws/ui", userUuid);

    const msg1 = await waitForRelayedMessageMatching(
      freshUi,
      (m) => m.message?.payload?.$case === "sourceState",
    );
    expect(msg1.message?.payload?.$case).toBe("sourceState");

    const msg2 = await waitForRelayedMessageMatching(freshUi, (m) => {
      const c = m.message?.payload?.$case;
      return c === "sourceOnline" || c === "scanCompleted" || c === "parseCompleted";
    });
    const case2 = msg2.message?.payload?.$case;
    expect(["sourceOnline", "scanCompleted", "parseCompleted"]).toContain(case2);
    expect(msg2.serverTimestamp).toBeDefined();

    closeWs(freshUi);
    closeWs(daemonWs);
  });

  it("builds SourceState with online source from sourceOnline", async () => {
    const userUuid = "ds-online-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    // Drain UI messages until we see this source marked online — UserHub
    // sends an initial state when the UI connects (possibly with 0 sources)
    // and a follow-up after the daemon's sourceOnline is processed. Taking
    // first is racy: under cross-test pool pressure the initial may arrive
    // before sourceOnline propagates.
    await waitForRelayedMessageMatching(temporaryUi, (msg) => {
      if (msg.message?.payload?.$case !== "sourceState") return false;
      return msg.message.payload.sourceState.sources.some(
        (s) => s.sourceId === sourceUuid && s.online,
      );
    });
    closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessageMatching(freshUi, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      return m.message.payload.sourceState.sources.some((s) => s.sourceId === sourceUuid);
    });

    const ds = requireInnerPayload(msg, "sourceState");
    expect(ds.sources).toHaveLength(1);
    expect(ds.sources[0]!.sourceId).toBe(sourceUuid);
    expect(ds.sources[0]!.online).toBe(true);

    closeWs(freshUi);
    closeWs(daemon);
  });

  it("marks source offline on sourceOffline", async () => {
    const userUuid = "ds-offline-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const ui = await connectWs("/ws/ui", userUuid);
    // Phase 1: drive source online and let the linkState reply confirm
    // that SourceHub has fully processed sourceOnline before we send the
    // next event. This split avoids a 5s budget spent on processing two
    // queued messages back-to-back under sharded CPU contention.
    await sendSourceOnlineAndDrainLinkState(daemon);

    // Phase 2: send sourceOffline and wait for the broadcast.
    sendProto(daemon, {
      payload: { $case: "sourceOffline", sourceOffline: { timestamp: undefined } },
    });
    const msg = await waitForRelayedMessageMatching(ui, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const s = m.message.payload.sourceState.sources.find((d) => d.sourceId === sourceUuid);
      return s !== undefined && !s.online;
    });

    const ds = requireInnerPayload(msg, "sourceState");
    const source = ds.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    expect(source?.online).toBeFalsy();

    closeWs(ui);
    closeWs(daemon);
  });

  it("tracks game status from watching event", async () => {
    const userUuid = "ds-watching-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const ui = await connectWs("/ws/ui", userUuid);
    await sendSourceOnlineAndDrainLinkState(daemon);
    sendProto(daemon, {
      payload: {
        $case: "watching",
        watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 5 },
      },
    });

    // Drain until the broadcast reflects d2r with a defined status — matcher
    // resolves only when the complete expected state has arrived.
    const msg = await waitForRelayedMessageMatching(ui, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const game = m.message.payload.sourceState.sources[0]?.games.find((g) => g.gameId === "d2r");
      return (
        game?.status !== undefined && game.status !== GameStatusEnum.GAME_STATUS_ENUM_UNSPECIFIED
      );
    });

    const ds = requireInnerPayload(msg, "sourceState");
    const game = ds.sources[0]?.games.find((g) => g.gameId === "d2r");
    expect(game?.status).toBe(2);

    closeWs(ui);
    closeWs(daemon);
  });

  it("tracks saves from pushCompleted", async () => {
    const userUuid = "ds-push-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const ui = await connectWs("/ws/ui", userUuid);
    // Drain sourceLinked before sending pushCompleted so the worker has
    // stored the source's connTag-to-uuid mapping before pushCompleted's
    // handler tries to look it up.
    await sendSourceOnlineAndDrainLinkState(daemon);
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

    const msg = await waitForRelayedMessageMatching(ui, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const save = m.message.payload.sourceState.sources[0]?.games[0]?.saves.find(
        (s) => s.saveUuid === "save-123",
      );
      return save?.summary === "Hammerdin Lv89";
    });

    const ds = requireInnerPayload(msg, "sourceState");
    const save = ds.sources[0]?.games[0]?.saves.find((s) => s.saveUuid === "save-123");
    expect(save?.summary).toBe("Hammerdin Lv89");

    closeWs(ui);
    closeWs(daemon);
  });

  it("marks source offline on daemon WebSocket close", async () => {
    const userUuid = "ds-wsclose-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    // Drain UI until this source is marked online — taking-first races with
    // the UI's initial state under cross-test pool pressure.
    await waitForRelayedMessageMatching(temporaryUi, (msg) => {
      if (msg.message?.payload?.$case !== "sourceState") return false;
      return msg.message.payload.sourceState.sources.some(
        (s) => s.sourceId === sourceUuid && s.online,
      );
    });
    closeWs(temporaryUi);

    closeWs(daemon);

    const freshUi = await connectWs("/ws/ui", userUuid);
    // Drain until we see this source visible but offline (post-WS-close).
    const msg = await waitForRelayedMessageMatching(freshUi, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const s = m.message.payload.sourceState.sources.find((d) => d.sourceId === sourceUuid);
      return s !== undefined && !s.online;
    });

    const ds = requireInnerPayload(msg, "sourceState");
    const source = ds.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    expect(source?.online).toBeFalsy();

    closeWs(freshUi);
  });

  it("tracks multiple sources independently via UserHub aggregation", async () => {
    const userUuid = "ds-multi-source-user";

    const sourceA = await seedSource(userUuid);
    const sourceB = await seedSource(userUuid);

    const daemonA = await connectDaemonWs(sourceA.sourceToken);
    const daemonB = await connectDaemonWs(sourceB.sourceToken);
    const ui = await connectWs("/ws/ui", userUuid);

    // Phased: each daemon's sourceOnline is followed by its linkState reply
    // (a sync barrier per daemon), then watching events. Sending 4 events
    // back-to-back used to overflow the 5s testTimeout under sharded CPU
    // contention; phasing keeps each await small.
    await sendSourceOnlineAndDrainLinkState(daemonA);
    await sendSourceOnlineAndDrainLinkState(daemonB);
    sendProto(daemonA, {
      payload: {
        $case: "watching",
        watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 3 },
      },
    });
    sendProto(daemonB, {
      payload: {
        $case: "watching",
        watching: { gameId: "stardew", path: "/saves/stardew", filesMonitored: 1 },
      },
    });

    // Drain until the broadcast reflects the complete expected state: both
    // sources online, each with their respective game.
    const msg = await waitForRelayedMessageMatching(ui, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const sources = m.message.payload.sourceState.sources;
      if (sources.length !== 2) return false;
      const a = sources.find((d) => d.sourceId === sourceA.sourceUuid);
      const b = sources.find((d) => d.sourceId === sourceB.sourceUuid);
      return Boolean(
        a?.online &&
        a.games.some((g) => g.gameId === "d2r") &&
        b?.online &&
        b.games.some((g) => g.gameId === "stardew"),
      );
    });

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

    closeWs(ui);
    closeWs(daemonA);
    closeWs(daemonB);
  });

  it("marks only the disconnected source offline", async () => {
    const userUuid = "ds-multi-close-user";

    const sourceA = await seedSource(userUuid);
    const sourceB = await seedSource(userUuid);

    const daemonA = await connectDaemonWs(sourceA.sourceToken);
    const daemonB = await connectDaemonWs(sourceB.sourceToken);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    // Drain until each source is marked online — taking-first races with the
    // UI's initial state under cross-test pool pressure.
    sendProto(daemonA, sourceOnlineMsg());
    await waitForRelayedMessageMatching(temporaryUi, (msg) => {
      if (msg.message?.payload?.$case !== "sourceState") return false;
      return msg.message.payload.sourceState.sources.some(
        (s) => s.sourceId === sourceA.sourceUuid && s.online,
      );
    });
    sendProto(daemonB, sourceOnlineMsg());
    await waitForRelayedMessageMatching(temporaryUi, (msg) => {
      if (msg.message?.payload?.$case !== "sourceState") return false;
      return msg.message.payload.sourceState.sources.some(
        (s) => s.sourceId === sourceB.sourceUuid && s.online,
      );
    });
    closeWs(temporaryUi);

    closeWs(daemonA);

    const freshUi = await connectWs("/ws/ui", userUuid);
    // Drain until we see the expected outcome: A offline, B online. The
    // initial state from UserHub may snapshot before the close-A propagation.
    const msg = await waitForRelayedMessageMatching(freshUi, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const sources = m.message.payload.sourceState.sources;
      const aState = sources.find((d) => d.sourceId === sourceA.sourceUuid);
      const bState = sources.find((d) => d.sourceId === sourceB.sourceUuid);
      return aState?.online === false && bState?.online === true;
    });

    const ds = requireInnerPayload(msg, "sourceState");
    const sourceAState = ds.sources.find((d) => d.sourceId === sourceA.sourceUuid);
    const sourceBState = ds.sources.find((d) => d.sourceId === sourceB.sourceUuid);

    expect(sourceAState).toBeDefined();
    expect(sourceAState?.online).toBeFalsy();
    expect(sourceBState).toBeDefined();
    expect(sourceBState?.online).toBe(true);

    closeWs(freshUi);
    closeWs(daemonB);
  });

  it("stores identity from pushCompleted in SourceState", async () => {
    const userUuid = "ds-identity-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const ui = await connectWs("/ws/ui", userUuid);
    await sendSourceOnlineAndDrainLinkState(daemon);
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

    // Drain UI until the broadcast contains the save with the expected identity.
    const msg = await waitForRelayedMessageMatching(ui, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const save = m.message.payload.sourceState.sources[0]?.games[0]?.saves.find(
        (s) => s.saveUuid === "save-abc",
      );
      return save?.identity?.name === "Hammerdin";
    });

    const ds = requireInnerPayload(msg, "sourceState");
    const save = ds.sources[0]?.games[0]?.saves.find((s) => s.saveUuid === "save-abc");
    expect(save?.identity?.name).toBe("Hammerdin");

    closeWs(ui);
    closeWs(daemon);
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
    const configA = await waitForPayload(daemonA, "configUpdate");
    const cuA = requirePayload(configA, "configUpdate");

    await sendSourceOnlineAndDrainLinkState(daemonB);
    const configB = await waitForPayload(daemonB, "configUpdate");
    const cuB = requirePayload(configB, "configUpdate");

    expect(Object.keys(cuA.games)).toHaveLength(1);
    expect(Object.keys(cuB.games)).toHaveLength(0);

    closeWs(daemonA);
    closeWs(daemonB);
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

    closeWs(daemonWs);
    closeWs(uiWs);
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
    closeWs(temporaryUi);

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

    closeWs(freshUi);
    closeWs(daemonWs);
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

    closeWs(daemonWs);
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

    closeWs(daemonA);
    closeWs(uiA);
    closeWs(uiB);
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

    closeWs(daemonWs);
    closeWs(uiWs);
  });

  it("updates lastSeen on heartbeat", async () => {
    const userUuid = "heartbeat-lastseen-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const ui = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());

    // Drain UI until the source-online broadcast lands so we have a stable
    // initial lastSeen value.
    const onlineMsg = await waitForRelayedMessageMatching(ui, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      return m.message.payload.sourceState.sources[0]?.lastSeen !== undefined;
    });
    const initialLastSeen = requireInnerPayload(
      onlineMsg,
      "sourceState",
    ).sources[0]!.lastSeen!.getTime();

    sendProto(daemon, {
      payload: { $case: "sourceHeartbeat", sourceHeartbeat: {} },
    });

    // Drain UI until we see a broadcast where lastSeen advanced past the
    // initial value. The matcher resolves as soon as the heartbeat-driven
    // broadcast arrives — event-driven, no sleep.
    const heartbeatMsg = await waitForRelayedMessageMatching(ui, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const ls = m.message.payload.sourceState.sources[0]?.lastSeen;
      return ls !== undefined && ls.getTime() > initialLastSeen;
    });
    const updatedLastSeen = requireInnerPayload(
      heartbeatMsg,
      "sourceState",
    ).sources[0]!.lastSeen!.getTime();

    expect(updatedLastSeen).toBeGreaterThan(initialLastSeen);
    closeWs(ui);
    closeWs(daemon);
  });

  it("evicts stale source via alarm", async () => {
    const userUuid = "alarm-evict-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const uiWs = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    // Drain UI until this source is marked online.
    await waitForRelayedMessageMatching(uiWs, (msg) => {
      if (msg.message?.payload?.$case !== "sourceState") return false;
      return msg.message.payload.sourceState.sources.some(
        (s) => s.sourceId === sourceUuid && s.online,
      );
    });

    // Attach the offline-state matcher BEFORE triggering the alarm —
    // otherwise the offline broadcast can arrive in the gap between the
    // online matcher resolving and the next handler being attached, and
    // we'd never see it.
    const offlinePromise = waitForRelayedMessageMatching(uiWs, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const s = m.message.payload.sourceState.sources.find((d) => d.sourceId === sourceUuid);
      return s !== undefined && !s.online;
    });

    await ageLastSeenAndFireAlarm(
      env.SOURCE_HUB.get(env.SOURCE_HUB.idFromName(sourceUuid)),
      sourceUuid,
    );

    const freshMsg = await offlinePromise;
    const ds = requireInnerPayload(freshMsg, "sourceState");
    const source = ds.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    expect(source?.online).toBeFalsy();

    closeWs(uiWs);
    closeWs(daemon);
  });

  it("graceful offline deletes alarm -- lastSeen unchanged after wait", async () => {
    const userUuid = "alarm-lifecycle-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    const ui = await connectWs("/ws/ui", userUuid);

    sendProto(daemon, sourceOnlineMsg());
    // Wait for the source to be marked online so we have a stable lastSeen.
    await waitForRelayedMessageMatching(ui, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      return m.message.payload.sourceState.sources.some(
        (s) => s.sourceId === sourceUuid && s.online,
      );
    });

    // Attach the offline matcher BEFORE closing — closing triggers the
    // daemon-disconnect broadcast (sourceOffline event + state update with
    // online=false + lastSeen set). Waiting for that broadcast is the
    // deterministic sync point that handleDaemonDisconnect has completed,
    // including its deleteAlarm() call.
    const offlinePromise = waitForRelayedMessageMatching(ui, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const s = m.message.payload.sourceState.sources.find((d) => d.sourceId === sourceUuid);
      return s !== undefined && !s.online && s.lastSeen !== undefined;
    });
    closeWs(daemon);
    const msg1 = await offlinePromise;
    const lastSeenBefore = requireInnerPayload(msg1, "sourceState").sources.find(
      (d) => d.sourceId === sourceUuid,
    )?.lastSeen;
    expect(lastSeenBefore).toBeDefined();

    // If graceful offline (via handleDaemonDisconnect) correctly deleted
    // the alarm, runDurableObjectAlarm returns false.
    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const fired = await runDurableObjectAlarm(env.SOURCE_HUB.get(doId));
    expect(fired).toBe(false);

    // Confirm lastSeen is unchanged from before (no alarm fired = no eviction
    // mutation = no lastSeen update).
    const ui2 = await connectWs("/ws/ui", userUuid);
    const msg2 = await waitForRelayedMessageMatching(ui2, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const s = m.message.payload.sourceState.sources.find((d) => d.sourceId === sourceUuid);
      return s?.lastSeen !== undefined;
    });
    const lastSeenAfter = requireInnerPayload(msg2, "sourceState").sources.find(
      (d) => d.sourceId === sourceUuid,
    )?.lastSeen;
    expect(lastSeenAfter?.toISOString()).toBe(lastSeenBefore?.toISOString());

    closeWs(ui);
    closeWs(ui2);
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

    closeWs(daemonWs);
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

    closeWs(uiWs);
    closeWs(daemonWs);
  });

  it("rescan returns error when can_rescan is false", async () => {
    const userUuid = "no-rescan-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare("UPDATE sources SET can_rescan = 0 WHERE source_uuid = ?")
      .bind(sourceUuid)
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);
    sendProto(daemonWs, sourceOnlineMsg());
    // Drain until configUpdate to ensure sourceOnline processing completed
    await waitForPayload(daemonWs, "configUpdate");

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

    closeWs(daemonWs);
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

    closeWs(daemonWs);
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

    closeWs(daemonWs);
    closeWs(uiWs);
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

    closeWs(daemonWs);
  });

  it("auto-creates config when daemon sends gameDetected", async () => {
    const userUuid = "auto-enable-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);

    sendProto(daemonWs, sourceOnlineMsg());
    // sourceOnline may produce sourceLinked + initial configUpdate in either
    // order; the unconditional waitForProtoMessage below takes whichever
    // arrives first. We rely on the post-gameDetected configUpdate (below)
    // as the deterministic D1-write signal, so we don't care which one this
    // catches — only that the daemon has been processed at least once.
    await waitForProtoMessage(daemonWs);

    sendProto(daemonWs, {
      payload: {
        $case: "gameDetected",
        gameDetected: { gameId: "d2r", path: "/home/user/.d2r/saves", saveCount: 3 },
      },
    });

    // maybeAutoEnableGame writes source_configs then calls pushConfigToSource
    // which sends a configUpdate carrying d2r. Drain until we see d2r —
    // discards any leftover initial configUpdate (which has no games) so we
    // only assert after the gameDetected-triggered write committed.
    await waitForProtoMessageMatching(
      daemonWs,
      (msg) => msg.payload?.$case === "configUpdate" && "d2r" in msg.payload.configUpdate.games,
    );

    const rows = await env.DB.prepare(
      "SELECT * FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceUuid, "d2r")
      .all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.save_path).toBe("/home/user/.d2r/saves");
    expect(rows.results[0]!.enabled).toBe(1);

    closeWs(daemonWs);
  });

  it("pushes auto-created config to daemon on reconnect", async () => {
    const userUuid = "auto-enable-reconnect-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon1 = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon1);
    await waitForPayload(daemon1, "configUpdate"); // drain configUpdate (empty)
    sendProto(daemon1, {
      payload: {
        $case: "gameDetected",
        gameDetected: { gameId: "d2r", path: "/saves/d2r", saveCount: 2 },
      },
    });
    // maybeAutoEnableGame sends a configUpdate after writing source_configs.
    // Wait for that as the deterministic "gameDetected was processed" signal.
    await waitForPayload(daemon1, "configUpdate");
    closeWs(daemon1);

    const daemon2 = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon2);
    const configMsg = await waitForPayload(daemon2, "configUpdate");

    const cu = requirePayload(configMsg, "configUpdate");
    const d2rConfig = cu.games.d2r;
    expect(d2rConfig).toBeDefined();
    expect(d2rConfig!.savePath).toBe("/saves/d2r");
    expect(d2rConfig!.enabled).toBe(true);

    closeWs(daemon2);
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
    await waitForPayload(daemonWs, "configUpdate"); // drain configUpdate

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

    closeWs(daemonWs);
  });

  it("excludes disabled games from SourceState after push-config", async () => {
    const userUuid = "disabled-game-state-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    // Set up a game config and get daemon online with game state
    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    const daemon = await connectDaemonWs(sourceToken);

    // Get daemon online and let it settle
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

    // Daemon reports watching the game
    sendProto(daemon, {
      payload: {
        $case: "watching",
        watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 3 },
      },
    });

    // Verify game is in SourceState via fresh UI connection — drain until
    // the broadcast carrying d2r arrives. Event-driven; no sleep.
    const ui1 = await connectWs("/ws/ui", userUuid);
    const msg1 = await waitForRelayedMessageMatching(ui1, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      return Boolean(
        m.message.payload.sourceState.sources[0]?.games.find((g) => g.gameId === "d2r"),
      );
    });
    const ds1 = requireInnerPayload(msg1, "sourceState");
    expect(ds1.sources[0]?.games.find((g) => g.gameId === "d2r")).toBeDefined();
    closeWs(ui1);

    // Now disable the game (simulating what handleDeleteGame does)
    await env.DB.prepare(
      "UPDATE source_configs SET enabled = 0 WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceUuid, "d2r")
      .run();

    // Trigger push-config on the SourceHub (like handleDeleteGame does)
    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    const configResp = await doStub.fetch(
      new Request("https://do/push-config", {
        method: "POST",
        body: JSON.stringify({ sourceId: sourceUuid }),
      }),
    );
    await configResp.text();

    // Verify game is NO LONGER in SourceState — drain until the broadcast
    // reflects the config update (d2r missing). The push-config call above
    // triggers a UserHub broadcast synchronously, so once the matcher
    // resolves, we know propagation completed.
    const ui2 = await connectWs("/ws/ui", userUuid);
    const msg2 = await waitForRelayedMessageMatching(ui2, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const games = m.message.payload.sourceState.sources[0]?.games;
      return games !== undefined && !games.some((g) => g.gameId === "d2r");
    });
    const ds2 = requireInnerPayload(msg2, "sourceState");
    const d2rGame = ds2.sources[0]?.games.find((g) => g.gameId === "d2r");
    expect(d2rGame).toBeUndefined();

    closeWs(ui2);
    closeWs(daemon);
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
    await waitForPayload(daemonWs, "configUpdate"); // drain configUpdate

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

    closeWs(daemonWs);
  });

  it("auto-creates config from gamesDiscovered and pushes config to daemon", async () => {
    const userUuid = "auto-discover-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);

    sendProto(daemonWs, sourceOnlineMsg());
    // sourceOnline triggers both sourceLinked and configUpdate — drain until
    // we get the configUpdate so later waits don't pick up stale messages.
    await waitForPayload(daemonWs, "configUpdate");

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
              filePatterns: [],
              excludeDirs: [],
            },
            {
              gameId: "sdv",
              name: "Stardew Valley",
              path: "/home/user/.sdv/saves",
              fileCount: 1,
              fileExtensions: [],
              filePatterns: [],
              excludeDirs: [],
            },
          ],
        },
      },
    });

    const configMsg = await waitForPayload(daemonWs, "configUpdate");
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

    closeWs(daemonWs);
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
    // sourceOnline triggers both sourceLinked and configUpdate — drain until
    // we get the configUpdate so later waits don't pick up stale messages.
    await waitForPayload(daemonWs, "configUpdate");

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
              filePatterns: [],
              excludeDirs: [],
            },
            {
              gameId: "sdv",
              name: "Stardew Valley",
              path: "/home/user/.sdv/saves",
              fileCount: 1,
              fileExtensions: [],
              filePatterns: [],
              excludeDirs: [],
            },
          ],
        },
      },
    });

    const configMsg = await waitForPayload(daemonWs, "configUpdate");
    const cu = requirePayload(configMsg, "configUpdate");
    expect(cu.games.d2r!.savePath).toBe("/custom/path");
    expect(cu.games.sdv!.savePath).toBe("/home/user/.sdv/saves");

    closeWs(daemonWs);
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

    closeWs(daemonWs);
    closeWs(uiWs);
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
    await sendSourceOnlineAndDrainLinkState(daemonWs);

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

    // Poll D1 until the worker persists configResult to source_configs.
    // Side-effect-driven; no UI WebSocket or sleep needed.
    const d2rRow = await pollUntil(
      () =>
        env.DB.prepare(
          "SELECT config_status, resolved_path, last_error, result_at FROM source_configs WHERE source_uuid = ? AND game_id = ?",
        )
          .bind(sourceUuid, "d2r")
          .first<{
            config_status: string;
            resolved_path: string;
            last_error: string;
            result_at: string | null;
          }>()
          .then((row) => (row?.config_status === "success" ? row : null)),
      { label: "d2r config_status=success" },
    );
    expect(d2rRow.resolved_path).toBe("/home/user/saves/d2r");
    expect(d2rRow.last_error).toBe("");
    expect(d2rRow.result_at).toBeTruthy();

    const sdvRow = await pollUntil(
      () =>
        env.DB.prepare(
          "SELECT config_status, resolved_path, last_error, result_at FROM source_configs WHERE source_uuid = ? AND game_id = ?",
        )
          .bind(sourceUuid, "sdv")
          .first<{
            config_status: string;
            resolved_path: string;
            last_error: string;
            result_at: string | null;
          }>()
          .then((row) => (row?.config_status === "error" ? row : null)),
      { label: "sdv config_status=error" },
    );
    expect(sdvRow.resolved_path).toBe("/saves/sdv");
    expect(sdvRow.last_error).toBe("path not found: /saves/sdv");
    expect(sdvRow.result_at).toBeTruthy();

    closeWs(daemonWs);
  });

  // ── PushSave over WebSocket ─────────────────────────────────────

  it("handles pushSave: writes to D1 and responds with PushSaveResult", async () => {
    const userUuid = "ws-push-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);

    // Must go online first so sourceId is stored
    sendProto(daemon, sourceOnlineMsg());
    await waitForProtoMessage(daemon); // configUpdate response

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
    const resultMsg = await waitForPayload(daemon, "pushSaveResult");
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

    closeWs(daemon);
  });

  it("pushSave updates SourceState with pushCompleted", async () => {
    const userUuid = "ws-push-state-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);

    // Go online first
    sendProto(daemon, sourceOnlineMsg());
    await waitForProtoMessage(daemon); // configUpdate response

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
    const resultMsg = await waitForPayload(daemon, "pushSaveResult");
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
    closeWs(ui);
    const freshUi = await connectWs("/ws/ui", userUuid);
    const stateMsg = await waitForRelayedMessage(freshUi);
    const state = requireInnerPayload(stateMsg, "sourceState");
    const game = state.sources[0]?.games.find((g) => g.gameId === "d2r");
    expect(game).toBeDefined();
    const save = game!.saves.find((s) => s.saveUuid === result.saveUuid);
    expect(save?.summary).toBe("Test Character");

    closeWs(freshUi);
    closeWs(daemon);
  });

  it("pushSave from unlinked source stores save with null user_uuid", async () => {
    const { sourceToken, sourceUuid } = await seedSource(null); // unlinked

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

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

    const result = await waitForPayload(daemon, "pushSaveResult");
    const pushResult = requirePayload(result, "pushSaveResult");
    expect(pushResult.saveUuid).toBeTruthy();

    // Save exists with null user_uuid
    const save = await env.DB.prepare(
      "SELECT user_uuid, last_source_uuid FROM saves WHERE save_name = 'UnlinkedTest'",
    ).first<{ user_uuid: string | null; last_source_uuid: string }>();
    expect(save).not.toBeNull();
    expect(save!.user_uuid).toBeNull();
    expect(save!.last_source_uuid).toBe(sourceUuid);

    closeWs(daemon);
  });

  it("rejects pushSave with too many sections", async () => {
    const userUuid = "push-cap-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

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

    // Wait for the worker's rejection acknowledgement so we know it
    // finished processing the bad pushSave. Result has empty saveUuid +
    // unspecified error code for validation-driven rejections.
    const rej = await waitForPayload(daemon, "pushSaveResult");
    expect(requirePayload(rej, "pushSaveResult").saveUuid).toBe("");

    // No save should have been created
    const save = await env.DB.prepare(
      "SELECT 1 FROM saves WHERE save_name = 'TooManySections'",
    ).first();
    expect(save).toBeNull();

    closeWs(daemon);
  });

  it("rejects pushSave exceeding total size limit", async () => {
    const userUuid = "push-size-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

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

    // Wait for the worker's rejection acknowledgement so we know it
    // finished processing the bad pushSave. Result has empty saveUuid +
    // unspecified error code for validation-driven rejections.
    const rej = await waitForPayload(daemon, "pushSaveResult");
    expect(requirePayload(rej, "pushSaveResult").saveUuid).toBe("");

    // No save should have been created
    const save = await env.DB.prepare("SELECT 1 FROM saves WHERE save_name = 'TooBig'").first();
    expect(save).toBeNull();

    closeWs(daemon);
  });

  it("rejects pushSave with missing identity", async () => {
    const userUuid = "push-no-identity";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

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

    const rej1 = await waitForPayload(daemon, "pushSaveResult");
    expect(requirePayload(rej1, "pushSaveResult").saveUuid).toBe("");

    const save = await env.DB.prepare("SELECT 1 FROM saves WHERE user_uuid = ?")
      .bind(userUuid)
      .first();
    expect(save).toBeNull();

    closeWs(daemon);
  });

  it("rejects pushSave with empty gameId", async () => {
    const userUuid = "push-no-gameid";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

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

    const rej2 = await waitForPayload(daemon, "pushSaveResult");
    expect(requirePayload(rej2, "pushSaveResult").saveUuid).toBe("");

    const save = await env.DB.prepare(
      "SELECT 1 FROM saves WHERE save_name = 'EmptyGameId'",
    ).first();
    expect(save).toBeNull();

    closeWs(daemon);
  });

  it("rejects pushSave for disabled game with GAME_REMOVED error", async () => {
    const userUuid = "push-disabled-game";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    // Seed a source_config with enabled = 0 (simulates game removal)
    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "d2r", "/saves/d2r", 0, JSON.stringify([".d2s"]))
      .run();

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "RejectedChar", extra: undefined },
          summary: "Level 1",
          parsedAt: new Date(),
          sections: [{ name: "stats", description: "Stats", data: { level: 1 } }],
        },
      },
    });

    // Should receive PushSaveResult with GAME_REMOVED error
    const resultMsg = await waitForPayload(daemon, "pushSaveResult");
    const result = requirePayload(resultMsg, "pushSaveResult");
    expect(result.error).toBe(PushSaveError.PUSH_SAVE_ERROR_GAME_REMOVED);
    expect(result.saveUuid).toBe("");

    // No save should have been created
    const save = await env.DB.prepare(
      "SELECT 1 FROM saves WHERE save_name = 'RejectedChar' AND user_uuid = ?",
    )
      .bind(userUuid)
      .first();
    expect(save).toBeNull();

    closeWs(daemon);
  });

  it("allows pushSave when no source_configs row exists", async () => {
    const userUuid = "push-no-config";
    const { sourceToken } = await seedSource(userUuid);

    // No source_configs seeded — game has never been configured
    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "NoConfigChar", extra: undefined },
          summary: "Level 1",
          parsedAt: new Date(),
          sections: [{ name: "stats", description: "Stats", data: { level: 1 } }],
        },
      },
    });

    // Should succeed — no config row means the game is allowed (not explicitly disabled)
    const resultMsg = await waitForPayload(daemon, "pushSaveResult");
    const result = requirePayload(resultMsg, "pushSaveResult");
    expect(result.error).toBe(PushSaveError.PUSH_SAVE_ERROR_UNSPECIFIED);
    expect(result.saveUuid).toBeTruthy();

    // Save should exist in D1
    const save = await env.DB.prepare(
      "SELECT 1 FROM saves WHERE save_name = 'NoConfigChar' AND user_uuid = ?",
    )
      .bind(userUuid)
      .first();
    expect(save).not.toBeNull();

    closeWs(daemon);
  });

  it("rejects pushSave for excluded save with SAVE_REMOVED error", async () => {
    const userUuid = "push-excluded-save";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    // Seed source_config with exclude_saves containing the target save
    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions, exclude_saves)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
      .bind(
        sourceUuid,
        "d2r",
        "/saves/d2r",
        JSON.stringify([".d2s"]),
        JSON.stringify(["Atmus.d2s"]),
      )
      .run();

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "Atmus.d2s", extra: undefined },
          summary: "Hammerdin, Level 89",
          parsedAt: new Date(),
          sections: [{ name: "stats", description: "Stats", data: { level: 89 } }],
        },
      },
    });

    const resultMsg = await waitForPayload(daemon, "pushSaveResult");
    const result = requirePayload(resultMsg, "pushSaveResult");
    expect(result.error).toBe(PushSaveError.PUSH_SAVE_ERROR_SAVE_REMOVED);
    expect(result.saveUuid).toBe("");

    // No save should have been created
    const save = await env.DB.prepare(
      "SELECT 1 FROM saves WHERE save_name = 'Atmus.d2s' AND user_uuid = ?",
    )
      .bind(userUuid)
      .first();
    expect(save).toBeNull();

    closeWs(daemon);
  });

  it("allows pushSave for non-excluded save when exclude_saves is set", async () => {
    const userUuid = "push-non-excluded-save";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    // Seed source_config with exclude_saves that does NOT include the pushed save
    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions, exclude_saves)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
      .bind(
        sourceUuid,
        "d2r",
        "/saves/d2r",
        JSON.stringify([".d2s"]),
        JSON.stringify(["Atmus.d2s"]),
      )
      .run();

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "Blizzara.d2s", extra: undefined },
          summary: "Blizzard Sorc, Level 78",
          parsedAt: new Date(),
          sections: [{ name: "stats", description: "Stats", data: { level: 78 } }],
        },
      },
    });

    const resultMsg = await waitForPayload(daemon, "pushSaveResult");
    const result = requirePayload(resultMsg, "pushSaveResult");
    expect(result.error).toBe(PushSaveError.PUSH_SAVE_ERROR_UNSPECIFIED);
    expect(result.saveUuid).not.toBe("");

    closeWs(daemon);
  });

  it("removed save disappears from SourceState after config push", async () => {
    const userUuid = "push-remove-state";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    // Seed source_config so push is accepted
    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, 1, ?)`,
    )
      .bind(sourceUuid, "d2r", "/saves/d2r", JSON.stringify([".d2s"]))
      .run();

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

    // Push a save so it appears in SourceState
    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "ToRemove.d2s", extra: undefined },
          summary: "Will be removed",
          parsedAt: new Date(),
          sections: [{ name: "stats", description: "Stats", data: { level: 1 } }],
        },
      },
    });
    const pushResult = await waitForPayload(daemon, "pushSaveResult");
    const saveUuid = requirePayload(pushResult, "pushSaveResult").saveUuid;
    expect(saveUuid).toBeTruthy();

    // Verify save is in SourceState — drain UI until the broadcast contains
    // this saveUuid. Event-driven; no sleep.
    const ui1 = await connectWs("/ws/ui", userUuid);
    const msg1 = await waitForRelayedMessageMatching(ui1, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const game = m.message.payload.sourceState.sources[0]?.games.find((g) => g.gameId === "d2r");
      return Boolean(game?.saves.some((s) => s.saveUuid === saveUuid));
    });
    const state1 = requireInnerPayload(msg1, "sourceState");
    const game1 = state1.sources[0]?.games.find((g) => g.gameId === "d2r");
    expect(game1?.saves.some((s) => s.saveUuid === saveUuid)).toBe(true);
    closeWs(ui1);

    // Remove the save via API
    const resp = await SELF.fetch(`https://test-host/api/v1/saves/${saveUuid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${userUuid}` },
    });
    expect(resp.status).toBe(200);

    // Drain UI until the deletion is reflected (save missing from broadcast).
    const ui2 = await connectWs("/ws/ui", userUuid);
    const msg2 = await waitForRelayedMessageMatching(ui2, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const game = m.message.payload.sourceState.sources[0]?.games.find((g) => g.gameId === "d2r");
      return game !== undefined && !game.saves.some((s) => s.saveUuid === saveUuid);
    });
    const state2 = requireInnerPayload(msg2, "sourceState");
    const game2 = state2.sources[0]?.games.find((g) => g.gameId === "d2r");
    const removedSave = game2?.saves.find((s) => s.saveUuid === saveUuid);
    expect(removedSave).toBeUndefined();
    closeWs(ui2);

    // Restore the save via API
    const restoreResp = await SELF.fetch(`https://test-host/api/v1/saves/${saveUuid}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userUuid}` },
    });
    expect(restoreResp.status).toBe(200);

    // Drain UI until the restored save reappears in the broadcast.
    const ui3 = await connectWs("/ws/ui", userUuid);
    const msg3 = await waitForRelayedMessageMatching(ui3, (m) => {
      if (m.message?.payload?.$case !== "sourceState") return false;
      const game = m.message.payload.sourceState.sources[0]?.games.find((g) => g.gameId === "d2r");
      return Boolean(game?.saves.some((s) => s.saveUuid === saveUuid));
    });
    const state3 = requireInnerPayload(msg3, "sourceState");
    const game3 = state3.sources[0]?.games.find((g) => g.gameId === "d2r");
    const restoredSave = game3?.saves.find((s) => s.saveUuid === saveUuid);
    expect(restoredSave).toBeDefined();
    expect(restoredSave?.summary).toBe("Will be removed");
    closeWs(ui3);

    closeWs(daemon);
  });

  it("idempotent push updates existing save instead of duplicating", async () => {
    const userUuid = "push-idempotent";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

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
    const first = await waitForPayload(daemon, "pushSaveResult");
    const firstResult = requirePayload(first, "pushSaveResult");

    // Second push — same save name
    sendProto(daemon, pushPayload(42));
    const second = await waitForPayload(daemon, "pushSaveResult");
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

    closeWs(daemon);
  });

  it("partial push preserves existing sections in D1", async () => {
    const userUuid = "partial-push-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

    // First push: 3 sections.
    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "PartialChar", extra: undefined },
          summary: "Level 50",
          parsedAt: new Date("2026-03-20T12:00:00Z"),
          sections: [
            { name: "overview", description: "Overview", data: { level: 50 } },
            { name: "skills", description: "Skills", data: { points: 100 } },
            { name: "inventory", description: "Inventory", data: { gold: 5000 } },
          ],
          allSectionNames: ["overview", "skills", "inventory"],
        },
      },
    });
    const first = await waitForProtoMessage(daemon);
    const firstResult = requirePayload(first, "pushSaveResult");

    // Second push: only overview changed (partial push).
    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "PartialChar", extra: undefined },
          summary: "Level 51",
          parsedAt: new Date("2026-03-20T12:01:00Z"),
          sections: [{ name: "overview", description: "Overview", data: { level: 51 } }],
          allSectionNames: ["overview", "skills", "inventory"],
        },
      },
    });
    const second = await waitForProtoMessage(daemon);
    const secondResult = requirePayload(second, "pushSaveResult");
    expect(secondResult.saveUuid).toBe(firstResult.saveUuid);

    // Verify all 3 sections exist in D1 with correct data.
    const sections = await env.DB.prepare(
      "SELECT name, data FROM sections WHERE save_uuid = ? ORDER BY name",
    )
      .bind(firstResult.saveUuid)
      .all<{ name: string; data: string }>();

    expect(sections.results.length).toBe(3);
    const byName = new Map(sections.results.map((s) => [s.name, JSON.parse(s.data)]));
    expect(byName.get("overview").level).toBe(51); // updated
    expect(byName.get("skills").points).toBe(100); // preserved
    expect(byName.get("inventory").gold).toBe(5000); // preserved

    closeWs(daemon);
  });

  it("allSectionNames deletes stale sections from D1", async () => {
    const userUuid = "stale-section-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

    // First push: 3 sections.
    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "StaleChar", extra: undefined },
          summary: "Level 50",
          parsedAt: new Date("2026-03-20T12:00:00Z"),
          sections: [
            { name: "overview", description: "Overview", data: { level: 50 } },
            { name: "skills", description: "Skills", data: { points: 100 } },
            { name: "draft", description: "Draft", data: { picks: 3 } },
          ],
          allSectionNames: ["overview", "skills", "draft"],
        },
      },
    });
    const first = await waitForProtoMessage(daemon);
    const firstResult = requirePayload(first, "pushSaveResult");

    // Second push: plugin stopped producing "draft" section.
    sendProto(daemon, {
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "StaleChar", extra: undefined },
          summary: "Level 51",
          parsedAt: new Date("2026-03-20T12:01:00Z"),
          sections: [{ name: "overview", description: "Overview", data: { level: 51 } }],
          allSectionNames: ["overview", "skills"], // draft removed
        },
      },
    });
    await waitForProtoMessage(daemon);

    // Verify: overview updated, skills preserved, draft deleted.
    const sections = await env.DB.prepare(
      "SELECT name FROM sections WHERE save_uuid = ? ORDER BY name",
    )
      .bind(firstResult.saveUuid)
      .all<{ name: string }>();

    const names = sections.results.map((s) => s.name);
    expect(names).toEqual(["overview", "skills"]);
    expect(names).not.toContain("draft");

    closeWs(daemon);
  });

  it("accepts gzip-compressed pushSave messages", async () => {
    const userUuid = "gzip-push-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

    // Build a PushSave message and gzip it manually.
    const msg = MessageCodec.fromPartial({
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "GzipChar", extra: undefined },
          summary: "Gzip Test, Level 50",
          parsedAt: new Date(),
          sections: [{ name: "stats", description: "Stats", data: { level: 50 } }],
        },
      },
    });
    const raw = MessageCodec.encode(msg).finish();

    // Compress with CompressionStream (gzip)
    const cs = new CompressionStream("gzip");
    const writer = cs.writable.getWriter();
    writer.write(raw);
    writer.close();
    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const compressed = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      compressed.set(chunk, offset);
      offset += chunk.length;
    }

    // Verify it's actually gzipped (magic header)
    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);

    // Send gzipped bytes directly
    daemon.send(compressed);

    const response = await waitForProtoMessage(daemon);
    const result = requirePayload(response, "pushSaveResult");
    expect(result.saveUuid).toBeTruthy();
    expect(result.error).toBe(PushSaveError.PUSH_SAVE_ERROR_UNSPECIFIED);

    // Verify data was stored correctly
    const section = await env.DB.prepare(
      "SELECT data FROM sections WHERE save_uuid = ? AND name = 'stats'",
    )
      .bind(result.saveUuid)
      .first<{ data: string }>();
    expect(JSON.parse(section!.data).level).toBe(50);

    closeWs(daemon);
  });

  it("accepts uncompressed pushSave messages (backwards compat)", async () => {
    const userUuid = "raw-push-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemon);
    await waitForPayload(daemon, "configUpdate"); // drain configUpdate

    // Build a PushSave message and send raw bytes (no gzip).
    const msg = MessageCodec.fromPartial({
      payload: {
        $case: "pushSave",
        pushSave: {
          gameId: "d2r",
          identity: { name: "RawChar", extra: undefined },
          summary: "Raw Test, Level 30",
          parsedAt: new Date(),
          sections: [{ name: "stats", description: "Stats", data: { level: 30 } }],
        },
      },
    });
    const raw = MessageCodec.encode(msg).finish();

    // Verify it's NOT gzipped
    expect(raw[0]).not.toBe(0x1f);

    // Send raw bytes directly
    daemon.send(raw);

    const response = await waitForProtoMessage(daemon);
    const result = requirePayload(response, "pushSaveResult");
    expect(result.saveUuid).toBeTruthy();
    expect(result.error).toBe(PushSaveError.PUSH_SAVE_ERROR_UNSPECIFIED);

    // Verify data was stored correctly
    const section = await env.DB.prepare(
      "SELECT data FROM sections WHERE save_uuid = ? AND name = 'stats'",
    )
      .bind(result.saveUuid)
      .first<{ data: string }>();
    expect(JSON.parse(section!.data).level).toBe(30);

    closeWs(daemon);
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

    closeWs(daemon);

    // Verify we receive the explicit sourceOffline event (not just state)
    const offlineRelayed = await offlineEventPromise;
    expect(offlineRelayed.sourceId).toBe(sourceUuid);
    expect(offlineRelayed.message?.payload?.$case).toBe("sourceOffline");

    closeWs(uiWs);
  });

  // Adapter no-evict test lives in adapter-state.test.ts (correct context,
  // no redundant /register step, and already exercises the full set-game-status path).

  it("alarm reschedules even after stale eviction", async () => {
    // Verifies the alarm doesn't silently stop after evicting a stale source.
    // After eviction, a new sourceOnline should still get alarm-evicted.
    const userUuid = "alarm-resilience-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);
    const doId = env.SOURCE_HUB.idFromName(sourceUuid);
    const stub = env.SOURCE_HUB.get(doId);

    // First cycle: go online, age lastSeen, fire alarm → eviction.
    const daemon1 = await connectDaemonWs(sourceToken);
    const ui1 = await connectWs("/ws/ui", userUuid);
    await sendSourceOnlineAndDrainLinkState(daemon1);
    await waitForRelayedMessageMatching(ui1, (msg) => {
      if (msg.message?.payload?.$case !== "sourceState") return false;
      return msg.message.payload.sourceState.sources.some(
        (s) => s.sourceId === sourceUuid && s.online,
      );
    });
    const offline1 = waitForRelayedMessageMatching(ui1, (msg) => {
      if (msg.message?.payload?.$case !== "sourceState") return false;
      const s = msg.message.payload.sourceState.sources.find((d) => d.sourceId === sourceUuid);
      return s !== undefined && !s.online;
    });
    await ageLastSeenAndFireAlarm(stub, sourceUuid);
    const offline1Msg = await offline1;
    expect(offline1Msg.message?.payload?.$case).toBe("sourceState");
    closeWs(ui1);
    closeWs(daemon1);

    // Second cycle: go online again, verify alarm still works.
    const daemon2 = await connectDaemonWs(sourceToken);
    const ui2 = await connectWs("/ws/ui", userUuid);
    await sendSourceOnlineAndDrainLinkState(daemon2);
    await waitForRelayedMessageMatching(ui2, (msg) => {
      if (msg.message?.payload?.$case !== "sourceState") return false;
      return msg.message.payload.sourceState.sources.some(
        (s) => s.sourceId === sourceUuid && s.online,
      );
    });
    const offline2 = waitForRelayedMessageMatching(ui2, (msg) => {
      if (msg.message?.payload?.$case !== "sourceState") return false;
      const s = msg.message.payload.sourceState.sources.find((d) => d.sourceId === sourceUuid);
      return s !== undefined && !s.online;
    });
    await ageLastSeenAndFireAlarm(stub, sourceUuid);
    const offline2Msg = await offline2;
    expect(offline2Msg.message?.payload?.$case).toBe("sourceState");
    closeWs(ui2);
    closeWs(daemon2);
  });
});
