import { env, fetchMock, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, closeWs, connectWs, waitForMessage } from "./helpers";

describe("DaemonHub", () => {
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

  it("relays UI commands to daemon", async () => {
    const userUuid = "relay-ui-test-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    const command = { rescanGame: { gameId: "d2r" } };
    uiWs.send(JSON.stringify(command));

    const received = await waitForMessage<typeof command>(daemonWs);
    expect(received.rescanGame.gameId).toBe("d2r");

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  it("persists daemon events to D1", async () => {
    const userUuid = "persist-test-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    const event = {
      daemonOnline: { deviceId: "steam-deck", version: "0.1.0" },
    };
    daemonWs.send(JSON.stringify(event));

    // Wait for the UI to receive (ensures the DO processed the message)
    await waitForMessage(uiWs);

    // Check D1
    const rows = await env.DB.prepare(
      "SELECT * FROM device_events WHERE event_type = 'daemonOnline'",
    ).all();

    expect(rows.results.length).toBeGreaterThanOrEqual(1);
    const row = rows.results[0]!;
    expect(row.device_id).toBe("steam-deck");
    expect(row.event_type).toBe("daemonOnline");

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

  it("sends DeviceState then activity feed on UI connect (cold start)", async () => {
    const userUuid = "coldstart-test-user";

    // Send some events via a daemon WS to populate state and D1
    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    const events = [
      { daemonOnline: { deviceId: "my-pc", version: "0.1.0" } },
      { scanCompleted: { gameId: "d2r", filesFound: 3 } },
      { parseCompleted: { gameId: "d2r", summary: "Hammerdin, Level 89" } },
    ];

    for (const event of events) {
      daemonWs.send(JSON.stringify(event));
      await waitForMessage(temporaryUi);
    }

    await closeWs(temporaryUi);

    // Fresh UI: first message should be DeviceState, then activity feed with _ts
    const freshUi = await connectWs("/ws/ui", userUuid);

    const msg1 = await waitForMessage<Record<string, unknown>>(freshUi);
    expect(msg1).toHaveProperty("deviceState");
    // DeviceState snapshot does NOT have _ts (it's not a replayed event)
    expect(msg1).not.toHaveProperty("_ts");

    const msg2 = await waitForMessage<Record<string, unknown>>(freshUi);
    const firstKey = Object.keys(msg2).find((k) => k !== "_ts");
    expect(["daemonOnline", "scanCompleted", "parseCompleted"]).toContain(firstKey);
    // Replayed events MUST have _ts injected from D1 created_at
    expect(msg2).toHaveProperty("_ts");
    expect(typeof msg2._ts).toBe("string");

    await closeWs(freshUi);
    await closeWs(daemonWs);
  });

  it("builds DeviceState with online device from daemonOnline", async () => {
    const userUuid = "ds-online-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "my-pc", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    expect(msg).toHaveProperty("deviceState");
    const ds = msg.deviceState as { devices: { deviceId: string; online: boolean }[] };
    expect(ds.devices).toHaveLength(1);
    expect(ds.devices[0]!.deviceId).toBe("my-pc");
    expect(ds.devices[0]!.online).toBe(true);

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("marks device offline on daemonOffline", async () => {
    const userUuid = "ds-offline-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "laptop", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);

    daemon.send(JSON.stringify({ daemonOffline: { deviceId: "laptop" } }));
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.deviceState as { devices: { deviceId: string; online?: boolean }[] };
    const device = ds.devices.find((d) => d.deviceId === "laptop");
    expect(device).toBeDefined();
    // Proto3 JSON omits false (the default) — absent online means offline
    expect(device?.online).toBeFalsy();

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("tracks game status from watching event", async () => {
    const userUuid = "ds-watching-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "desktop", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);

    daemon.send(
      JSON.stringify({ watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 5 } }),
    );
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.deviceState as {
      devices: { games: { gameId: string; status: string }[] }[];
    };
    const game = ds.devices[0]?.games.find((g) => g.gameId === "d2r");
    expect(game?.status).toBe("GAME_STATUS_ENUM_WATCHING");

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("tracks saves from pushCompleted", async () => {
    const userUuid = "ds-push-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "pc", version: "0.1.0" } }));
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

    const ds = msg.deviceState as {
      devices: { games: { saves: { saveUuid: string; summary: string }[] }[] }[];
    };
    const save = ds.devices[0]?.games[0]?.saves.find((s) => s.saveUuid === "save-123");
    expect(save?.summary).toBe("Hammerdin Lv89");

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("marks device offline on daemon WebSocket close", async () => {
    const userUuid = "ds-wsclose-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "steamdeck", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    // Close daemon WS — should mark device offline
    await closeWs(daemon);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.deviceState as { devices: { deviceId: string; online?: boolean }[] };
    const device = ds.devices.find((d) => d.deviceId === "steamdeck");
    expect(device).toBeDefined();
    // Proto3 JSON omits false (the default) — absent online means offline
    expect(device?.online).toBeFalsy();

    await closeWs(freshUi);
  });

  it("tracks multiple devices independently", async () => {
    const userUuid = "ds-multi-device-user";

    const daemonA = await connectWs("/ws/daemon", userUuid);
    const daemonB = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    // Device A comes online and watches d2r
    daemonA.send(JSON.stringify({ daemonOnline: { deviceId: "desktop", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    daemonA.send(
      JSON.stringify({ watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 3 } }),
    );
    await waitForMessage(temporaryUi);

    // Device B comes online and watches stardew
    daemonB.send(JSON.stringify({ daemonOnline: { deviceId: "steamdeck", version: "0.1.0" } }));
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

    const ds = msg.deviceState as {
      devices: { deviceId: string; online: boolean; games: { gameId: string }[] }[];
    };
    expect(ds.devices).toHaveLength(2);

    const desktop = ds.devices.find((d) => d.deviceId === "desktop");
    const steamdeck = ds.devices.find((d) => d.deviceId === "steamdeck");

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

  it("marks only the disconnected device offline", async () => {
    const userUuid = "ds-multi-close-user";

    const daemonA = await connectWs("/ws/daemon", userUuid);
    const daemonB = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemonA.send(JSON.stringify({ daemonOnline: { deviceId: "desktop", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    daemonB.send(JSON.stringify({ daemonOnline: { deviceId: "steamdeck", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    // Close only device A
    await closeWs(daemonA);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.deviceState as { devices: { deviceId: string; online?: boolean }[] };
    const desktop = ds.devices.find((d) => d.deviceId === "desktop");
    const steamdeck = ds.devices.find((d) => d.deviceId === "steamdeck");

    expect(desktop).toBeDefined();
    expect(desktop?.online).toBeFalsy();
    expect(steamdeck).toBeDefined();
    expect(steamdeck?.online).toBe(true);

    await closeWs(freshUi);
    await closeWs(daemonB);
  });

  it("stores identity from pushCompleted in DeviceState", async () => {
    const userUuid = "ds-identity-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "pc", version: "0.1.0" } }));
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

    const ds = msg.deviceState as {
      devices: {
        games: { saves: { saveUuid: string; identity: { name: string } }[] }[];
      }[];
    };
    const save = ds.devices[0]?.games[0]?.saves.find((s) => s.saveUuid === "save-abc");
    expect(save?.identity.name).toBe("Hammerdin");

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("scopes configUpdate to the target device only", async () => {
    const userUuid = "config-scope-user";

    // Pre-populate config for desktop only
    await env.DB.prepare(
      `INSERT INTO device_configs (user_uuid, device_id, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(userUuid, "desktop", "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    const daemonA = await connectWs("/ws/daemon", userUuid);
    const daemonB = await connectWs("/ws/daemon", userUuid);

    // Both daemons identify themselves
    daemonA.send(JSON.stringify({ daemonOnline: { deviceId: "desktop", version: "0.1.0" } }));
    const configA = await waitForMessage<Record<string, unknown>>(daemonA);
    expect(configA).toHaveProperty("configUpdate");

    daemonB.send(JSON.stringify({ daemonOnline: { deviceId: "steamdeck", version: "0.1.0" } }));
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

  it("injects _deviceId on live relay", async () => {
    const userUuid = "deviceid-relay-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    // Identify the daemon connection
    daemonWs.send(JSON.stringify({ daemonOnline: { deviceId: "my-pc", version: "0.1.0" } }));
    await waitForMessage(uiWs);

    // Send a game event — UI should receive it with _deviceId injected
    daemonWs.send(
      JSON.stringify({ watching: { gameId: "d2r", path: "/saves/d2r", filesMonitored: 5 } }),
    );
    const received = await waitForMessage<Record<string, unknown>>(uiWs);
    expect(received).toHaveProperty("watching");
    expect(received._deviceId).toBe("my-pc");

    await closeWs(daemonWs);
    await closeWs(uiWs);
  });

  it("injects _deviceId on replayed events", async () => {
    const userUuid = "deviceid-replay-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    // Identify daemon and send an event
    daemonWs.send(JSON.stringify({ daemonOnline: { deviceId: "steam-deck", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    daemonWs.send(
      JSON.stringify({ parseCompleted: { gameId: "d2r", summary: "Hammerdin, Level 89" } }),
    );
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    // Fresh UI should get DeviceState, then replayed events with _deviceId
    const freshUi = await connectWs("/ws/ui", userUuid);

    // Skip DeviceState
    await waitForMessage(freshUi);

    // Collect replayed events — at least one should have _deviceId: "steam-deck"
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
    const withDeviceId = replayed.filter((m) => m._deviceId === "steam-deck");
    expect(withDeviceId.length).toBeGreaterThanOrEqual(1);

    await closeWs(freshUi);
    await closeWs(daemonWs);
  });

  it("sends rescanGame to daemon via /rescan endpoint", async () => {
    const userUuid = "rescan-test-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);

    // Identify the daemon and consume the configUpdate response
    daemonWs.send(JSON.stringify({ daemonOnline: { deviceId: "my-pc", version: "0.1.0" } }));
    await waitForMessage(daemonWs); // configUpdate from maybePushConfig

    // Register listener BEFORE the /rescan call — the DO sends the message
    // synchronously within the fetch, so the listener must already be waiting.
    const rescanPromise = waitForMessage<{ rescanGame: { gameId: string } }>(daemonWs);

    // Call the /rescan endpoint (as the worker would from the MCP tool)
    const doId = env.DAEMON_HUB.idFromName(userUuid);
    const doStub = env.DAEMON_HUB.get(doId);
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

    const doId = env.DAEMON_HUB.idFromName(userUuid);
    const doStub = env.DAEMON_HUB.get(doId);
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

  it("sends daemonUpdateAvailable when daemon version is stale", async () => {
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

    // Send daemonOnline with an older version
    daemonWs.send(
      JSON.stringify({
        daemonOnline: { deviceId: "steam-deck", version: "0.1.0", platform: "linux-amd64" },
      }),
    );

    // Should receive configUpdate first (from maybePushConfig)
    const msg1 = await waitForMessage<Record<string, unknown>>(daemonWs);

    // Should also receive daemonUpdateAvailable
    // It might be the first or second message depending on ordering
    let updateMsg: Record<string, unknown> | undefined;
    if ("daemonUpdateAvailable" in msg1) {
      updateMsg = msg1;
    } else {
      const msg2 = await waitForMessage<Record<string, unknown>>(daemonWs);
      if ("daemonUpdateAvailable" in msg2) {
        updateMsg = msg2;
      }
    }

    expect(updateMsg).toBeDefined();
    const update = updateMsg!.daemonUpdateAvailable as {
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

  it("does not relay daemonHeartbeat to UI", async () => {
    const userUuid = "heartbeat-relay-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    // Identify daemon
    daemonWs.send(JSON.stringify({ daemonOnline: { deviceId: "deck", version: "0.1.0" } }));
    await waitForMessage(uiWs); // daemonOnline relayed

    // Send heartbeat — should NOT be relayed to UI
    daemonWs.send(JSON.stringify({ daemonHeartbeat: {} }));

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

    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "deck", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    await closeWs(temporaryUi);

    // Get initial lastSeen
    const ui1 = await connectWs("/ws/ui", userUuid);
    const msg1 = await waitForMessage<Record<string, unknown>>(ui1);
    const ds1 = msg1.deviceState as { devices: { lastSeen: string }[] };
    const initialLastSeen = ds1.devices[0]!.lastSeen;
    await closeWs(ui1);

    // Wait a bit then send heartbeat
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    daemon.send(JSON.stringify({ daemonHeartbeat: {} }));

    // Give DO time to process
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    // Check lastSeen was updated
    const ui2 = await connectWs("/ws/ui", userUuid);
    const msg2 = await waitForMessage<Record<string, unknown>>(ui2);
    const ds2 = msg2.deviceState as { devices: { lastSeen: string }[] };
    const updatedLastSeen = ds2.devices[0]!.lastSeen;

    expect(updatedLastSeen).not.toBe(initialLastSeen);

    await closeWs(ui2);
    await closeWs(daemon);
  });

  it("evicts stale device via alarm", async () => {
    const userUuid = "alarm-evict-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    // Send daemonOnline — sets alarm (100ms in test config)
    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "deck", version: "0.1.0" } }));
    await waitForMessage(uiWs); // daemonOnline relayed

    // Close daemon WS without sending daemonOffline (simulates suspend)
    // But we can't truly simulate suspend — the DO will see webSocketClose.
    // Instead, verify the alarm fires and marks device offline when lastSeen is stale.
    // The test config has STALE_THRESHOLD_MS=200, ALARM_INTERVAL_MS=100.
    // So if we don't send any messages for 300ms, the alarm should evict.
    await closeWs(uiWs);

    // Wait for stale threshold + alarm interval to pass
    // STALE_THRESHOLD_MS=200, ALARM_INTERVAL_MS=100, so after ~300ms the device
    // should be evicted (alarm fires at 100ms, device not stale yet; fires again
    // at 200ms, still not stale; fires at 300ms, lastSeen is now >200ms ago).
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    // Check device is offline
    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);
    const ds = msg.deviceState as { devices: { deviceId: string; online?: boolean }[] };
    const device = ds.devices.find((d) => d.deviceId === "deck");
    expect(device).toBeDefined();
    expect(device?.online).toBeFalsy();

    await closeWs(freshUi);
    await closeWs(daemon);
  });

  it("alarm does not fire when all devices are offline", async () => {
    const userUuid = "alarm-lifecycle-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    // Device comes online (sets alarm)
    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "deck", version: "0.1.0" } }));
    await waitForMessage(uiWs);

    // Device goes offline gracefully (should delete alarm)
    daemon.send(JSON.stringify({ daemonOffline: { deviceId: "deck" } }));
    await waitForMessage(uiWs);

    await closeWs(daemon);
    await closeWs(uiWs);

    // Wait past the alarm interval — alarm should NOT fire since device is offline
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });

    // Verify device is still offline (not re-evicted or errored)
    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);
    const ds = msg.deviceState as { devices: { deviceId: string; online?: boolean }[] };
    const device = ds.devices.find((d) => d.deviceId === "deck");
    expect(device).toBeDefined();
    expect(device?.online).toBeFalsy();

    await closeWs(freshUi);
  });

  it("does not send daemonUpdateAvailable when daemon is current", async () => {
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

    // Send daemonOnline with current version
    daemonWs.send(
      JSON.stringify({
        daemonOnline: { deviceId: "steam-deck", version: "0.1.0", platform: "linux-amd64" },
      }),
    );

    // Should receive configUpdate
    const msg1 = await waitForMessage<Record<string, unknown>>(daemonWs);
    expect(msg1).toHaveProperty("configUpdate");

    // Should NOT receive daemonUpdateAvailable — wait briefly
    const noUpdate = await waitForMessage(daemonWs, 200).catch(() => null);
    expect(noUpdate).toBeNull();

    await closeWs(daemonWs);
    fetchMock.deactivate();
  });
});
