import { env, fetchMock, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, closeWs, connectWs, waitForMessage } from "./helpers";

describe("SourceHub", () => {
  beforeEach(cleanAll);

  it("relays daemon messages to UI", async () => {
    const userUuid = "relay-test-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    const event = { parseCompleted: { gameId: "d2r", summary: "Hammerdin, Level 89 Paladin" } };
    daemonWs.send(JSON.stringify(event));

    const received = await waitForMessage<typeof event>(uiWs);
    expect(received.parseCompleted.gameId).toBe("d2r");
    expect(received.parseCompleted.summary).toBe("Hammerdin, Level 89 Paladin");

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  // UI→daemon relay is temporarily removed — UserHub's webSocketMessage
  // is a no-op until SourceHub is rekeyed by source_uuid.

  it("persists daemon events to D1", async () => {
    const userUuid = "persist-test-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    const event = {
      sourceOnline: { sourceId: "steam-deck", version: "0.1.0" },
    };
    daemonWs.send(JSON.stringify(event));

    // Wait for the UI to receive (ensures the DO processed the message)
    await waitForMessage(uiWs);

    // Check D1
    const rows = await env.DB.prepare(
      "SELECT * FROM source_events WHERE event_type = 'sourceOnline'",
    ).all();

    expect(rows.results.length).toBeGreaterThanOrEqual(1);
    const row = rows.results[0]!;
    expect(row.source_id).toBe("steam-deck");
    expect(row.event_type).toBe("sourceOnline");

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  it("requires auth for WebSocket connections", async () => {
    const resp = await SELF.fetch("https://test-host/ws/daemon", {
      headers: { Upgrade: "websocket" },
    });
    // Without auth header, should get 401 (not a WS upgrade)
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

    // Send some events via a daemon WS to populate state and D1
    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    const events = [
      { sourceOnline: { sourceId: "my-pc", version: "0.1.0" } },
      { scanCompleted: { gameId: "d2r", filesFound: 3 } },
      { parseCompleted: { gameId: "d2r", summary: "Hammerdin, Level 89" } },
    ];

    for (const event of events) {
      daemonWs.send(JSON.stringify(event));
      await waitForMessage(temporaryUi);
    }

    await closeWs(temporaryUi);

    // Fresh UI: first message should be SourceState, then activity feed with _ts
    const freshUi = await connectWs("/ws/ui", userUuid);

    const msg1 = await waitForMessage<Record<string, unknown>>(freshUi);
    expect(msg1).toHaveProperty("sourceState");
    // SourceState snapshot does NOT have _ts (it's not a replayed event)
    expect(msg1).not.toHaveProperty("_ts");

    const msg2 = await waitForMessage<Record<string, unknown>>(freshUi);
    const firstKey = Object.keys(msg2).find((k) => k !== "_ts");
    expect(["sourceOnline", "scanCompleted", "parseCompleted"]).toContain(firstKey);
    // Replayed events MUST have _ts injected from D1 created_at
    expect(msg2).toHaveProperty("_ts");
    expect(typeof msg2._ts).toBe("string");

    await closeWs(freshUi);
    await closeWs(daemonWs);
  });

  it("builds SourceState with online source from sourceOnline", async () => {
    const userUuid = "ds-online-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ sourceOnline: { sourceId: "my-pc", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    expect(msg).toHaveProperty("sourceState");
    const ds = msg.sourceState as { sources: { sourceId: string; online: boolean }[] };
    expect(ds.sources).toHaveLength(1);
    expect(ds.sources[0]!.sourceId).toBe("my-pc");
    expect(ds.sources[0]!.online).toBe(true);

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("marks source offline on sourceOffline", async () => {
    const userUuid = "ds-offline-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ sourceOnline: { sourceId: "laptop", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);

    daemon.send(JSON.stringify({ sourceOffline: { sourceId: "laptop" } }));
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.sourceState as { sources: { sourceId: string; online?: boolean }[] };
    const source = ds.sources.find((d) => d.sourceId === "laptop");
    expect(source).toBeDefined();
    // Proto3 JSON omits false (the default) — absent online means offline
    expect(source?.online).toBeFalsy();

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("tracks game status from watching event", async () => {
    const userUuid = "ds-watching-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ sourceOnline: { sourceId: "desktop", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);

    daemon.send(
      JSON.stringify({ watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 5 } }),
    );
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.sourceState as {
      sources: { games: { gameId: string; status: string }[] }[];
    };
    const game = ds.sources[0]?.games.find((g) => g.gameId === "d2r");
    expect(game?.status).toBe("GAME_STATUS_ENUM_WATCHING");

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("tracks saves from pushCompleted", async () => {
    const userUuid = "ds-push-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ sourceOnline: { sourceId: "pc", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);

    daemon.send(
      JSON.stringify({
        pushCompleted: { gameId: "d2r", saveUuid: "save-123", summary: "Hammerdin Lv89" },
      }),
    );
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.sourceState as {
      sources: { games: { saves: { saveUuid: string; summary: string }[] }[] }[];
    };
    const save = ds.sources[0]?.games[0]?.saves.find((s) => s.saveUuid === "save-123");
    expect(save?.summary).toBe("Hammerdin Lv89");

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("marks source offline on daemon WebSocket close", async () => {
    const userUuid = "ds-wsclose-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ sourceOnline: { sourceId: "steamdeck", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    // Close daemon WS — should mark source offline
    await closeWs(daemon);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.sourceState as { sources: { sourceId: string; online?: boolean }[] };
    const source = ds.sources.find((d) => d.sourceId === "steamdeck");
    expect(source).toBeDefined();
    // Proto3 JSON omits false (the default) — absent online means offline
    expect(source?.online).toBeFalsy();

    await closeWs(freshUi);
  });

  it("tracks multiple sources independently", async () => {
    const userUuid = "ds-multi-source-user";

    const daemonA = await connectWs("/ws/daemon", userUuid);
    const daemonB = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    // Source A comes online and watches d2r
    daemonA.send(JSON.stringify({ sourceOnline: { sourceId: "desktop", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    daemonA.send(
      JSON.stringify({ watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 3 } }),
    );
    await waitForMessage(temporaryUi);

    // Source B comes online and watches stardew
    daemonB.send(JSON.stringify({ sourceOnline: { sourceId: "steamdeck", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    daemonB.send(
      JSON.stringify({
        watching: { gameId: "stardew", path: "/saves/stardew", filesMonitored: 1 },
      }),
    );
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.sourceState as {
      sources: { sourceId: string; online: boolean; games: { gameId: string }[] }[];
    };
    expect(ds.sources).toHaveLength(2);

    const desktop = ds.sources.find((d) => d.sourceId === "desktop");
    const steamdeck = ds.sources.find((d) => d.sourceId === "steamdeck");

    expect(desktop).toBeDefined();
    expect(desktop!.online).toBe(true);
    expect(desktop!.games.find((g) => g.gameId === "d2r")).toBeDefined();

    expect(steamdeck).toBeDefined();
    expect(steamdeck!.online).toBe(true);
    expect(steamdeck!.games.find((g) => g.gameId === "stardew")).toBeDefined();

    await closeWs(freshUi);
    await closeWs(daemonA);
    await closeWs(daemonB);
  });

  it("marks only the disconnected source offline", async () => {
    const userUuid = "ds-multi-close-user";

    const daemonA = await connectWs("/ws/daemon", userUuid);
    const daemonB = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemonA.send(JSON.stringify({ sourceOnline: { sourceId: "desktop", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    daemonB.send(JSON.stringify({ sourceOnline: { sourceId: "steamdeck", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    // Close only source A
    await closeWs(daemonA);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.sourceState as { sources: { sourceId: string; online?: boolean }[] };
    const desktop = ds.sources.find((d) => d.sourceId === "desktop");
    const steamdeck = ds.sources.find((d) => d.sourceId === "steamdeck");

    expect(desktop).toBeDefined();
    expect(desktop?.online).toBeFalsy();
    expect(steamdeck).toBeDefined();
    expect(steamdeck?.online).toBe(true);

    await closeWs(freshUi);
    await closeWs(daemonB);
  });

  it("stores identity from pushCompleted in SourceState", async () => {
    const userUuid = "ds-identity-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ sourceOnline: { sourceId: "pc", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);

    daemon.send(
      JSON.stringify({
        pushCompleted: {
          gameId: "d2r",
          saveUuid: "save-abc",
          summary: "Hammerdin, Level 89 Paladin",
          identity: { name: "Hammerdin", extra: { class: "Paladin", level: 89 } },
        },
      }),
    );
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.sourceState as {
      sources: {
        games: { saves: { saveUuid: string; identity: { name: string } }[] }[];
      }[];
    };
    const save = ds.sources[0]?.games[0]?.saves.find((s) => s.saveUuid === "save-abc");
    expect(save?.identity.name).toBe("Hammerdin");

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("scopes configUpdate to the target source only", async () => {
    const userUuid = "config-scope-user";

    // Pre-populate config for desktop only
    await env.DB.prepare(
      `INSERT INTO source_configs (user_uuid, source_id, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(userUuid, "desktop", "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    const daemonA = await connectWs("/ws/daemon", userUuid);
    const daemonB = await connectWs("/ws/daemon", userUuid);

    // Both daemons identify themselves
    daemonA.send(JSON.stringify({ sourceOnline: { sourceId: "desktop", version: "0.1.0" } }));
    const configA = await waitForMessage<Record<string, unknown>>(daemonA);
    expect(configA).toHaveProperty("configUpdate");

    daemonB.send(JSON.stringify({ sourceOnline: { sourceId: "steamdeck", version: "0.1.0" } }));
    const configB = await waitForMessage<Record<string, unknown>>(daemonB);
    expect(configB).toHaveProperty("configUpdate");

    // Desktop's configUpdate should have d2r, steamdeck's should be empty
    const desktopGames = (configA.configUpdate as { games: Record<string, unknown> }).games;
    const steamdeckGames = (configB.configUpdate as { games: Record<string, unknown> }).games;
    expect(Object.keys(desktopGames)).toHaveLength(1);
    expect(Object.keys(steamdeckGames)).toHaveLength(0);

    await closeWs(daemonA);
    await closeWs(daemonB);
  });

  it("injects _sourceId on live relay", async () => {
    const userUuid = "deviceid-relay-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    // Identify the daemon connection
    daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: "my-pc", version: "0.1.0" } }));
    await waitForMessage(uiWs);

    // Send a game event — UI should receive it with _sourceId injected
    daemonWs.send(
      JSON.stringify({ watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 5 } }),
    );
    const received = await waitForMessage<Record<string, unknown>>(uiWs);
    expect(received).toHaveProperty("watching");
    expect(received._sourceId).toBe("my-pc");

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  it("injects _sourceId on replayed events", async () => {
    const userUuid = "deviceid-replay-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    // Identify daemon and send an event
    daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: "steam-deck", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    daemonWs.send(
      JSON.stringify({ parseCompleted: { gameId: "d2r", summary: "Hammerdin, Level 89" } }),
    );
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    // Fresh UI should get SourceState, then replayed events with _sourceId
    const freshUi = await connectWs("/ws/ui", userUuid);

    // Skip SourceState
    await waitForMessage(freshUi);

    // Collect replayed events — at least one should have _sourceId: "steam-deck"
    const replayed: Record<string, unknown>[] = [];
    try {
      while (replayed.length < 10) {
        const msg = await waitForMessage<Record<string, unknown>>(freshUi, 500);
        replayed.push(msg);
      }
    } catch {
      // Timeout expected — we've drained all replayed events
    }

    expect(replayed.length).toBeGreaterThanOrEqual(1);
    const withSourceId = replayed.filter((m) => m._sourceId === "steam-deck");
    expect(withSourceId.length).toBeGreaterThanOrEqual(1);

    await closeWs(freshUi);
    await closeWs(daemonWs);
  });

  it("sends rescanGame to daemon via /rescan endpoint", async () => {
    const userUuid = "rescan-test-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);

    // Identify the daemon and consume the configUpdate response
    daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: "my-pc", version: "0.1.0" } }));
    await waitForMessage(daemonWs); // configUpdate from maybePushConfig

    // Register listener BEFORE the /rescan call — the DO sends the message
    // synchronously within the fetch, so the listener must already be waiting.
    const rescanPromise = waitForMessage<{ rescanGame: { gameId: string } }>(daemonWs);

    // Call the /rescan endpoint (as the worker would from the MCP tool)
    const doId = env.SOURCE_HUB.idFromName(userUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    const resp = await doStub.fetch(
      new Request("https://do/rescan", {
        method: "POST",
        headers: { "X-User-UUID": userUuid },
        body: JSON.stringify({ gameId: "d2r" }),
      }),
    );

    expect(resp.status).toBe(200);
    const body = await resp.json<{ sent: boolean; daemon_count: number }>();
    expect(body.sent).toBe(true);
    expect(body.daemon_count).toBe(1);

    // Daemon should have received the rescanGame message
    const received = await rescanPromise;
    expect(received.rescanGame.gameId).toBe("d2r");

    await closeWs(daemonWs);
  });

  it("returns daemon_online: false from /rescan when no daemon connected", async () => {
    const userUuid = "rescan-offline-user";

    const doId = env.SOURCE_HUB.idFromName(userUuid);
    const doStub = env.SOURCE_HUB.get(doId);
    const resp = await doStub.fetch(
      new Request("https://do/rescan", {
        method: "POST",
        headers: { "X-User-UUID": userUuid },
        body: JSON.stringify({ gameId: "d2r" }),
      }),
    );

    expect(resp.status).toBe(200);
    const body = await resp.json<{ sent: boolean; daemon_online: boolean }>();
    expect(body.sent).toBe(false);
    expect(body.daemon_online).toBe(false);
  });

  it("isolates users — messages don't leak across DOs", async () => {
    const daemonA = await connectWs("/ws/daemon", "user-a");
    const uiA = await connectWs("/ws/ui", "user-a");
    const uiB = await connectWs("/ws/ui", "user-b");

    const event = { pluginUpdated: { gameId: "d2r", version: "1.0.0" } };
    daemonA.send(JSON.stringify(event));

    // User A's UI should receive it
    const received = await waitForMessage(uiA);
    expect(received).toBeTruthy();

    // User B's UI should NOT receive it (wait briefly, expect timeout)
    const noMessage = await waitForMessage(uiB, 200).catch(() => null);
    expect(noMessage).toBeNull();

    await closeWs(daemonA);
    await closeWs(uiA);
    await closeWs(uiB);
  });

  it("sends sourceUpdateAvailable when daemon version is stale", async () => {
    const userUuid = "update-check-user";

    // Mock the install worker manifest endpoint
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

    const daemonWs = await connectWs("/ws/daemon", userUuid);

    // Send sourceOnline with an older version
    daemonWs.send(
      JSON.stringify({
        sourceOnline: { sourceId: "steam-deck", version: "0.1.0", platform: "linux-amd64" },
      }),
    );

    // Should receive configUpdate first (from maybePushConfig)
    const msg1 = await waitForMessage<Record<string, unknown>>(daemonWs);

    // Should also receive sourceUpdateAvailable
    // It might be the first or second message depending on ordering
    let updateMsg: Record<string, unknown> | undefined;
    if ("sourceUpdateAvailable" in msg1) {
      updateMsg = msg1;
    } else {
      const msg2 = await waitForMessage<Record<string, unknown>>(daemonWs);
      if ("sourceUpdateAvailable" in msg2) {
        updateMsg = msg2;
      }
    }

    expect(updateMsg).toBeDefined();
    const update = updateMsg!.sourceUpdateAvailable as {
      version: string;
      url: string;
      sha256: string;
    };
    expect(update.version).toBe("0.2.0");
    expect(update.url).toBe("https://install.savecraft.gg/daemon/savecraft-daemon-linux-amd64");
    expect(update.sha256).toBe("abc123");

    await closeWs(daemonWs);
    fetchMock.deactivate();
  });

  it("does not relay sourceHeartbeat to UI", async () => {
    const userUuid = "heartbeat-relay-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    // Identify daemon
    daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: "deck", version: "0.1.0" } }));
    await waitForMessage(uiWs); // sourceOnline relayed

    // Send heartbeat — should NOT be relayed to UI
    daemonWs.send(JSON.stringify({ sourceHeartbeat: {} }));

    // Wait briefly — UI should NOT receive anything
    const noMessage = await waitForMessage(uiWs, 200).catch(() => null);
    expect(noMessage).toBeNull();

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  it("updates lastSeen on heartbeat", async () => {
    const userUuid = "heartbeat-lastseen-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ sourceOnline: { sourceId: "deck", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    // Get initial lastSeen
    const ui1 = await connectWs("/ws/ui", userUuid);
    const msg1 = await waitForMessage<Record<string, unknown>>(ui1);
    const ds1 = msg1.sourceState as { sources: { lastSeen: string }[] };
    const initialLastSeen = new Date(ds1.sources[0]!.lastSeen).getTime();
    await closeWs(ui1);

    // Wait enough to guarantee temporal separation, then send heartbeat
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    daemon.send(JSON.stringify({ sourceHeartbeat: {} }));

    // Give DO time to process
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    // Check lastSeen was updated — assert strictly newer (not just different)
    const ui2 = await connectWs("/ws/ui", userUuid);
    const msg2 = await waitForMessage<Record<string, unknown>>(ui2);
    const ds2 = msg2.sourceState as { sources: { lastSeen: string }[] };
    const updatedLastSeen = new Date(ds2.sources[0]!.lastSeen).getTime();

    expect(updatedLastSeen).toBeGreaterThan(initialLastSeen);

    await closeWs(ui2);
    await closeWs(daemon);
  });

  it("evicts stale source via alarm", async () => {
    const userUuid = "alarm-evict-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    // Send sourceOnline — sets alarm (100ms in test config)
    daemon.send(JSON.stringify({ sourceOnline: { sourceId: "deck", version: "0.1.0" } }));
    await waitForMessage(uiWs); // sourceOnline relayed
    await closeWs(uiWs);

    // Pre-assertion: source must be online before we test eviction
    const preUi = await connectWs("/ws/ui", userUuid);
    const preMsg = await waitForMessage<Record<string, unknown>>(preUi);
    const preDs = preMsg.sourceState as { sources: { sourceId: string; online?: boolean }[] };
    const preSource = preDs.sources.find((d) => d.sourceId === "deck");
    expect(preSource).toBeDefined();
    expect(preSource?.online).toBe(true);
    await closeWs(preUi);

    // Wait for stale threshold + alarm interval to pass
    // STALE_THRESHOLD_MS=200, ALARM_INTERVAL_MS=100, so after ~300ms the source
    // should be evicted (alarm fires at 100ms, source not stale yet; fires again
    // at 200ms, still not stale; fires at 300ms, lastSeen is now >200ms ago).
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    // Post-assertion: source must now be offline (evicted by alarm)
    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);
    const ds = msg.sourceState as { sources: { sourceId: string; online?: boolean }[] };
    const source = ds.sources.find((d) => d.sourceId === "deck");
    expect(source).toBeDefined();
    expect(source?.online).toBeFalsy();

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("graceful offline deletes alarm — lastSeen unchanged after wait", async () => {
    const userUuid = "alarm-lifecycle-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    // Source comes online (sets alarm)
    daemon.send(JSON.stringify({ sourceOnline: { sourceId: "deck", version: "0.1.0" } }));
    await waitForMessage(uiWs);

    // Source goes offline gracefully (should delete alarm)
    daemon.send(JSON.stringify({ sourceOffline: { sourceId: "deck" } }));
    await waitForMessage(uiWs);

    await closeWs(daemon);
    await closeWs(uiWs);

    // Snapshot lastSeen immediately after offline
    const ui1 = await connectWs("/ws/ui", userUuid);
    const msg1 = await waitForMessage<Record<string, unknown>>(ui1);
    const ds1 = msg1.sourceState as { sources: { sourceId: string; lastSeen?: string }[] };
    const lastSeenBefore = ds1.sources.find((d) => d.sourceId === "deck")?.lastSeen;
    expect(lastSeenBefore).toBeDefined();
    await closeWs(ui1);

    // Wait past the alarm interval — alarm should NOT fire since source is offline
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });

    // lastSeen must be identical — proves no alarm fired and re-processed the source
    const ui2 = await connectWs("/ws/ui", userUuid);
    const msg2 = await waitForMessage<Record<string, unknown>>(ui2);
    const ds2 = msg2.sourceState as { sources: { sourceId: string; lastSeen?: string }[] };
    const lastSeenAfter = ds2.sources.find((d) => d.sourceId === "deck")?.lastSeen;
    expect(lastSeenAfter).toBe(lastSeenBefore);

    await closeWs(ui2);
  });

  it("does not send sourceUpdateAvailable when daemon is current", async () => {
    const userUuid = "update-current-user";

    // Mock the install worker manifest endpoint
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

    const daemonWs = await connectWs("/ws/daemon", userUuid);

    // Send sourceOnline with current version
    daemonWs.send(
      JSON.stringify({
        sourceOnline: { sourceId: "steam-deck", version: "0.1.0", platform: "linux-amd64" },
      }),
    );

    // Should receive configUpdate
    const msg1 = await waitForMessage<Record<string, unknown>>(daemonWs);
    expect(msg1).toHaveProperty("configUpdate");

    // Should NOT receive sourceUpdateAvailable — wait briefly
    const noUpdate = await waitForMessage(daemonWs, 200).catch(() => null);
    expect(noUpdate).toBeNull();

    await closeWs(daemonWs);
    fetchMock.deactivate();
  });
});
