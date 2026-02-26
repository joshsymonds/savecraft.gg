import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { connectWs, waitForMessage } from "./helpers";

describe("DaemonHub", () => {
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
      "SELECT * FROM device_events WHERE event_type = 'daemonOnline'"
    ).all();

    expect(rows.results.length).toBeGreaterThanOrEqual(1);
    const row = rows.results[0]!;
    expect(row["device_id"]).toBe("steam-deck");
    expect(row["event_type"]).toBe("daemonOnline");

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
