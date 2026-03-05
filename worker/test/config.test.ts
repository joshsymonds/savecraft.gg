import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  cleanAll,
  closeWs,
  connectDaemonWs,
  connectWs,
  seedSource,
  waitForMessage,
} from "./helpers";

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

describe("Source Config API", () => {
  beforeEach(cleanAll);

  it("saves config to D1 via PUT", async () => {
    const userUuid = "config-put-user";
    const sourceId = "steam-deck";

    const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config`, {
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
      "SELECT * FROM source_configs WHERE user_uuid = ? AND source_uuid = ?",
    )
      .bind(userUuid, sourceId)
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
    const sourceId = "desktop";

    const putConfig = async (savePath: string): Promise<Response> =>
      SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config`, {
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
      "SELECT save_path FROM source_configs WHERE user_uuid = ? AND source_uuid = ? AND game_id = ?",
    )
      .bind(userUuid, sourceId, "d2r")
      .all<{ save_path: string }>();

    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.save_path).toBe("/new/path");
  });

  it("removes games not in the update", async () => {
    const userUuid = "config-remove-user";
    const sourceId = "pc";

    // First: add two games
    await SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config`, {
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
    await SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config`, {
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
      "SELECT game_id FROM source_configs WHERE user_uuid = ? AND source_uuid = ?",
    )
      .bind(userUuid, sourceId)
      .all<{ game_id: string }>();

    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.game_id).toBe("d2r");
  });

  it("requires auth", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/sources/my-pc/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ games: {} }),
    });
    expect(resp.status).toBe(401);
  });

  it("GET /api/v1/sources/:id/config returns saved config", async () => {
    const userUuid = "config-get-user";
    const sourceId = "my-laptop";

    // PUT a config first
    const putResp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${userUuid}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        games: {
          d2r: { savePath: "/saves/d2r", enabled: true, fileExtensions: [".d2s", ".d2i"] },
          stardew: { savePath: "/saves/stardew", enabled: false, fileExtensions: [".xml"] },
        },
      }),
    });
    expect(putResp.status).toBe(200);

    // GET and verify it matches
    const getResp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config`, {
      method: "GET",
      headers: { Authorization: `Bearer ${userUuid}` },
    });
    expect(getResp.status).toBe(200);

    const body = await getResp.json<{
      games: Record<string, { savePath: string; enabled: boolean; fileExtensions: string[] }>;
    }>();

    expect(body.games.d2r).toEqual({
      savePath: "/saves/d2r",
      enabled: true,
      fileExtensions: [".d2s", ".d2i"],
    });
    expect(body.games.stardew).toEqual({
      savePath: "/saves/stardew",
      enabled: false,
      fileExtensions: [".xml"],
    });
  });

  it("GET /api/v1/sources/:id/config returns empty games when no config", async () => {
    const userUuid = "config-empty-get-user";
    const sourceId = "nonexistent-source";

    const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config`, {
      method: "GET",
      headers: { Authorization: `Bearer ${userUuid}` },
    });
    expect(resp.status).toBe(200);

    const body = await resp.json<{ games: Record<string, unknown> }>();
    expect(body.games).toEqual({});
  });

  it("GET /api/v1/sources/:id/config requires auth", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/sources/my-pc/config", {
      method: "GET",
    });
    expect(resp.status).toBe(401);
  });
});

describe("Config push via SourceHub", () => {
  beforeEach(cleanAll);

  it("pushes config to daemon on sourceOnline", async () => {
    const userUuid = "config-push-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    // Pre-populate config in D1 using sourceUuid
    await env.DB.prepare(
      `INSERT INTO source_configs (user_uuid, source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(userUuid, sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    // Connect daemon and send sourceOnline
    const daemonWs = await connectDaemonWs(sourceToken);
    daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: sourceUuid, version: "0.1.0" } }));

    // Daemon should receive a configUpdate message
    const msg = await waitForMessage<ConfigUpdateMsg>(daemonWs);
    expect(msg.configUpdate).toBeDefined();
    expect(msg.configUpdate.games.d2r).toBeDefined();
    expect(msg.configUpdate.games.d2r!.savePath).toBe("/saves/d2r");
    expect(msg.configUpdate.games.d2r!.enabled).toBe(true);
    expect(msg.configUpdate.games.d2r!.fileExtensions).toEqual([".d2s"]);

    await closeWs(daemonWs);
  });

  it("pushes empty config when no configs exist", async () => {
    const userUuid = "config-empty-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);
    daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: sourceUuid, version: "0.1.0" } }));

    const msg = await waitForMessage<ConfigUpdateMsg>(daemonWs);
    expect(msg.configUpdate).toBeDefined();
    expect(Object.keys(msg.configUpdate.games)).toHaveLength(0);

    await closeWs(daemonWs);
  });

  it("sets ACTIVATING status in SourceState when pushing config", async () => {
    const userUuid = "config-activating-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    // Pre-populate config with an enabled game
    await env.DB.prepare(
      `INSERT INTO source_configs (user_uuid, source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(userUuid, sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    // Connect daemon and identify it — daemon sends any hostname, server ignores it
    const daemonWs = await connectDaemonWs(sourceToken);
    daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: "any-hostname", version: "0.1.0" } }));
    await waitForMessage(daemonWs); // configUpdate

    // Connect a fresh UI and check SourceState — game should be ACTIVATING
    // sourceId in state should be the real sourceUuid, not the daemon's hostname
    const uiWs = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(uiWs);

    expect(msg).toHaveProperty("sourceState");
    const ds = msg.sourceState as {
      sources: { sourceId: string; games: { gameId: string; status: string }[] }[];
    };
    const source = ds.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    const game = source!.games.find((g) => g.gameId === "d2r");
    expect(game).toBeDefined();
    expect(game!.status).toBe("GAME_STATUS_ENUM_ACTIVATING");

    await closeWs(uiWs);
    await closeWs(daemonWs);
  });

  it("does not set ACTIVATING for disabled games", async () => {
    const userUuid = "config-disabled-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    // Pre-populate config with a disabled game
    await env.DB.prepare(
      `INSERT INTO source_configs (user_uuid, source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(userUuid, sourceUuid, "stardew", "/saves/stardew", 0, JSON.stringify([".xml"]))
      .run();

    // Connect daemon and identify it — daemon sends any hostname, server uses sourceUuid
    const daemonWs = await connectDaemonWs(sourceToken);
    daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: "any-hostname", version: "0.1.0" } }));
    await waitForMessage(daemonWs); // configUpdate

    // Connect a fresh UI — disabled game should NOT appear with ACTIVATING
    const uiWs = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(uiWs);

    expect(msg).toHaveProperty("sourceState");
    const ds = msg.sourceState as {
      sources: { sourceId: string; games?: { gameId: string; status: string }[] }[];
    };
    const source = ds.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    // Disabled game should not appear with ACTIVATING — games may be omitted (proto3 empty array)
    const games = source!.games ?? [];
    const activatingGames = games.filter((g) => g.status === "GAME_STATUS_ENUM_ACTIVATING");
    expect(activatingGames).toHaveLength(0);

    await closeWs(uiWs);
    await closeWs(daemonWs);
  });

  it("ACTIVATING persists and is visible to new UI connections after push-config", async () => {
    const userUuid = "config-broadcast-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    // Pre-populate config with an enabled game
    await env.DB.prepare(
      `INSERT INTO source_configs (user_uuid, source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(userUuid, sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    // Connect daemon, identify it (triggers push-config which sets ACTIVATING)
    // Daemon sends any hostname — server uses sourceUuid from storage
    const daemonWs = await connectDaemonWs(sourceToken);
    daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: "any-hostname", version: "0.1.0" } }));
    await waitForMessage(daemonWs); // configUpdate

    // Close daemon — ACTIVATING should survive in persisted state
    await closeWs(daemonWs);

    // Fresh UI connect should see ACTIVATING in cold-start SourceState
    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForMessage<Record<string, unknown>>(freshUi);

    expect(msg).toHaveProperty("sourceState");
    const ds = msg.sourceState as {
      sources: { sourceId: string; games: { gameId: string; status: string }[] }[];
    };
    const source = ds.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    const game = source!.games.find((g) => g.gameId === "d2r");
    expect(game).toBeDefined();
    expect(game!.status).toBe("GAME_STATUS_ENUM_ACTIVATING");

    await closeWs(freshUi);
  });

  it("pushes config update when API writes new config", async () => {
    const userUuid = "config-live-push-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    // Connect daemon first
    const daemonWs = await connectDaemonWs(sourceToken);

    // Send sourceOnline (initial empty config push)
    daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: sourceUuid, version: "0.1.0" } }));
    // Consume the initial (empty) configUpdate
    await waitForMessage<ConfigUpdateMsg>(daemonWs);

    // Register listener BEFORE the API call — the DO sends the configUpdate
    // synchronously within the fetch, so the listener must already be waiting.
    const configPromise = waitForMessage<ConfigUpdateMsg>(daemonWs);

    // Save config via API using sourceUuid in the URL path
    const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}/config`, {
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
    expect(msg.configUpdate.games.d2r!.savePath).toBe("/saves/d2r");

    await closeWs(daemonWs);
  });
});
