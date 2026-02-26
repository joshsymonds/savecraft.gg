import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, connectWs, waitForMessage } from "./helpers";

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

    daemonWs.close();
    uiWs.close();
  });

  it("relays UI commands to daemon", async () => {
    const userUuid = "relay-ui-test-user";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    const uiWs = await connectWs("/ws/ui", userUuid);

    const command = { rescanGame: { gameId: "d2r" } };
    uiWs.send(JSON.stringify(command));

    const received = await waitForMessage<typeof command>(daemonWs);
    expect(received.rescanGame.gameId).toBe("d2r");

    daemonWs.close();
    uiWs.close();
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

    daemonWs.close();
    uiWs.close();
  });

  it("requires auth for WebSocket connections", async () => {
    const resp = await SELF.fetch("https://test-host/ws/daemon", {
      headers: { Upgrade: "websocket" },
    });
    // Without auth header, should get 401 (not a WS upgrade)
    expect(resp.status).toBe(401);
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

    temporaryUi.close();

    // Fresh UI: first message should be DeviceState, then activity feed
    const freshUi = await connectWs("/ws/ui", userUuid);

    const msg1 = await waitForMessage<Record<string, unknown>>(freshUi);
    expect(msg1).toHaveProperty("deviceState");

    const msg2 = await waitForMessage<Record<string, unknown>>(freshUi);
    const firstKey = Object.keys(msg2)[0];
    expect(["daemonOnline", "scanCompleted", "parseCompleted"]).toContain(firstKey);

    freshUi.close();
    daemonWs.close();
  });

  it("builds DeviceState with online device from daemonOnline", async () => {
    const userUuid = "ds-online-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "my-pc", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    temporaryUi.close();

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    expect(msg).toHaveProperty("deviceState");
    const ds = msg.deviceState as { devices: { deviceId: string; online: boolean }[] };
    expect(ds.devices).toHaveLength(1);
    expect(ds.devices[0]!.deviceId).toBe("my-pc");
    expect(ds.devices[0]!.online).toBe(true);

    freshUi.close();
    daemon.close();
  });

  it("marks device offline on daemonOffline", async () => {
    const userUuid = "ds-offline-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "laptop", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);

    daemon.send(JSON.stringify({ daemonOffline: { deviceId: "laptop" } }));
    await waitForMessage(temporaryUi);
    temporaryUi.close();

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.deviceState as { devices: { deviceId: string; online?: boolean }[] };
    const device = ds.devices.find((d) => d.deviceId === "laptop");
    expect(device).toBeDefined();
    // Proto3 JSON omits false (the default) — absent online means offline
    expect(device?.online).toBeFalsy();

    freshUi.close();
    daemon.close();
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
    temporaryUi.close();

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.deviceState as {
      devices: { games: { gameId: string; status: string }[] }[];
    };
    const game = ds.devices[0]?.games.find((g) => g.gameId === "d2r");
    expect(game?.status).toBe("GAME_STATUS_ENUM_WATCHING");

    freshUi.close();
    daemon.close();
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
    temporaryUi.close();

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.deviceState as {
      devices: { games: { saves: { saveUuid: string; summary: string }[] }[] }[];
    };
    const save = ds.devices[0]?.games[0]?.saves.find((s) => s.saveUuid === "save-123");
    expect(save?.summary).toBe("Hammerdin Lv89");

    freshUi.close();
    daemon.close();
  });

  it("marks device offline on daemon WebSocket close", async () => {
    const userUuid = "ds-wsclose-user";

    const daemon = await connectWs("/ws/daemon", userUuid);
    const temporaryUi = await connectWs("/ws/ui", userUuid);

    daemon.send(JSON.stringify({ daemonOnline: { deviceId: "steamdeck", version: "0.1.0" } }));
    await waitForMessage(temporaryUi);
    temporaryUi.close();

    // Close daemon WS — should mark device offline
    daemon.close();

    // Allow close handler to process
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.deviceState as { devices: { deviceId: string; online?: boolean }[] };
    const device = ds.devices.find((d) => d.deviceId === "steamdeck");
    expect(device).toBeDefined();
    // Proto3 JSON omits false (the default) — absent online means offline
    expect(device?.online).toBeFalsy();

    freshUi.close();
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
    temporaryUi.close();

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

    freshUi.close();
    daemonA.close();
    daemonB.close();
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
    temporaryUi.close();

    // Close only device A
    daemonA.close();
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.deviceState as { devices: { deviceId: string; online?: boolean }[] };
    const desktop = ds.devices.find((d) => d.deviceId === "desktop");
    const steamdeck = ds.devices.find((d) => d.deviceId === "steamdeck");

    expect(desktop).toBeDefined();
    expect(desktop?.online).toBeFalsy();
    expect(steamdeck).toBeDefined();
    expect(steamdeck?.online).toBe(true);

    freshUi.close();
    daemonB.close();
  });

  it("enriches SaveInfo with identity from D1", async () => {
    const userUuid = "ds-identity-user";

    // Pre-populate a save in D1 (as if push API already ran)
    await env.DB.prepare(
      "INSERT INTO saves (uuid, user_uuid, game_id, character_name, summary) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("save-abc", userUuid, "d2r", "Hammerdin", "Hammerdin, Level 89 Paladin")
      .run();

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
        },
      }),
    );
    await waitForMessage(temporaryUi);
    temporaryUi.close();

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    const ds = msg.deviceState as {
      devices: {
        games: { saves: { saveUuid: string; identity: { name: string } }[] }[];
      }[];
    };
    const save = ds.devices[0]?.games[0]?.saves.find((s) => s.saveUuid === "save-abc");
    expect(save?.identity.name).toBe("Hammerdin");

    freshUi.close();
    daemon.close();
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

    daemonA.close();
    daemonB.close();
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

    daemonA.close();
    uiA.close();
    uiB.close();
  });
});
