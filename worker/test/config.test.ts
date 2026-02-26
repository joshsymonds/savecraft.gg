import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, connectWs, waitForMessage } from "./helpers";

interface ConfigUpdateMsg {
  configUpdate: {
    games: Record<
      string,
      {
        savePath: string;
        enabled: boolean;
        fileExtensions: string[];
      }
    >;
  };
}

describe("Device Config API", () => {
  beforeEach(cleanAll);

  it("saves config to D1 via PUT", async () => {
    const userUuid = "config-put-user";
    const deviceId = "steam-deck";

    const resp = await SELF.fetch(`https://test-host/api/v1/devices/${deviceId}/config`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${userUuid}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        games: {
          d2r: {
            savePath: "/saves/d2r",
            enabled: true,
            fileExtensions: [".d2s"],
          },
        },
      }),
    });

    expect(resp.status).toBe(200);

    const rows = await env.DB.prepare(
      "SELECT * FROM device_configs WHERE user_uuid = ? AND device_id = ?",
    )
      .bind(userUuid, deviceId)
      .all<{
        game_id: string;
        save_path: string;
        enabled: number;
        file_extensions: string;
      }>();

    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.game_id).toBe("d2r");
    expect(rows.results[0]!.save_path).toBe("/saves/d2r");
    expect(rows.results[0]!.enabled).toBe(1);
    expect(JSON.parse(rows.results[0]!.file_extensions)).toEqual([".d2s"]);
  });

  it("upserts config on repeated PUT", async () => {
    const userUuid = "config-upsert-user";
    const deviceId = "desktop";

    const putConfig = async (savePath: string): Promise<Response> =>
      SELF.fetch(`https://test-host/api/v1/devices/${deviceId}/config`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${userUuid}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          games: { d2r: { savePath, enabled: true, fileExtensions: [".d2s"] } },
        }),
      });

    await putConfig("/old/path");
    await putConfig("/new/path");

    const rows = await env.DB.prepare(
      "SELECT save_path FROM device_configs WHERE user_uuid = ? AND device_id = ? AND game_id = ?",
    )
      .bind(userUuid, deviceId, "d2r")
      .all<{ save_path: string }>();

    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.save_path).toBe("/new/path");
  });

  it("removes games not in the update", async () => {
    const userUuid = "config-remove-user";
    const deviceId = "pc";

    // First: add two games
    await SELF.fetch(`https://test-host/api/v1/devices/${deviceId}/config`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${userUuid}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        games: {
          d2r: { savePath: "/d2r", enabled: true, fileExtensions: [".d2s"] },
          stardew: { savePath: "/stardew", enabled: true, fileExtensions: [".xml"] },
        },
      }),
    });

    // Second: update with only d2r — stardew should be removed
    await SELF.fetch(`https://test-host/api/v1/devices/${deviceId}/config`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${userUuid}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        games: {
          d2r: { savePath: "/d2r", enabled: true, fileExtensions: [".d2s"] },
        },
      }),
    });

    const rows = await env.DB.prepare(
      "SELECT game_id FROM device_configs WHERE user_uuid = ? AND device_id = ?",
    )
      .bind(userUuid, deviceId)
      .all<{ game_id: string }>();

    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.game_id).toBe("d2r");
  });

  it("requires auth", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/devices/my-pc/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ games: {} }),
    });
    expect(resp.status).toBe(401);
  });
});

describe("Config push via DaemonHub", () => {
  beforeEach(cleanAll);

  it("pushes config to daemon on daemonOnline", async () => {
    const userUuid = "config-push-user";
    const deviceId = "steam-deck";

    // Pre-populate config in D1
    await env.DB.prepare(
      `INSERT INTO device_configs (user_uuid, device_id, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(userUuid, deviceId, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    // Connect daemon and send daemonOnline
    const daemonWs = await connectWs("/ws/daemon", userUuid);
    daemonWs.send(JSON.stringify({ daemonOnline: { deviceId, version: "0.1.0" } }));

    // Daemon should receive a configUpdate message
    const msg = await waitForMessage<ConfigUpdateMsg>(daemonWs);
    expect(msg.configUpdate).toBeDefined();
    expect(msg.configUpdate.games.d2r).toBeDefined();
    expect(msg.configUpdate.games.d2r.savePath).toBe("/saves/d2r");
    expect(msg.configUpdate.games.d2r.enabled).toBe(true);
    expect(msg.configUpdate.games.d2r.fileExtensions).toEqual([".d2s"]);

    daemonWs.close();
  });

  it("pushes empty config when no configs exist", async () => {
    const userUuid = "config-empty-user";
    const deviceId = "unknown-device";

    const daemonWs = await connectWs("/ws/daemon", userUuid);
    daemonWs.send(JSON.stringify({ daemonOnline: { deviceId, version: "0.1.0" } }));

    const msg = await waitForMessage<ConfigUpdateMsg>(daemonWs);
    expect(msg.configUpdate).toBeDefined();
    expect(Object.keys(msg.configUpdate.games)).toHaveLength(0);

    daemonWs.close();
  });

  it("pushes config update when API writes new config", async () => {
    const userUuid = "config-live-push-user";
    const deviceId = "my-pc";

    // Connect daemon first
    const daemonWs = await connectWs("/ws/daemon", userUuid);

    // Send daemonOnline (initial empty config push)
    daemonWs.send(JSON.stringify({ daemonOnline: { deviceId, version: "0.1.0" } }));
    // Consume the initial (empty) configUpdate
    await waitForMessage<ConfigUpdateMsg>(daemonWs);

    // Register listener BEFORE the API call — the DO sends the configUpdate
    // synchronously within the fetch, so the listener must already be waiting.
    const configPromise = waitForMessage<ConfigUpdateMsg>(daemonWs);

    // Now save config via API — this should trigger a push to the daemon
    const resp = await SELF.fetch(`https://test-host/api/v1/devices/${deviceId}/config`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${userUuid}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        games: {
          d2r: { savePath: "/saves/d2r", enabled: true, fileExtensions: [".d2s"] },
        },
      }),
    });
    expect(resp.status).toBe(200);

    // Daemon should receive the updated config
    const msg = await configPromise;
    expect(msg.configUpdate.games.d2r).toBeDefined();
    expect(msg.configUpdate.games.d2r.savePath).toBe("/saves/d2r");

    daemonWs.close();
  });
});
