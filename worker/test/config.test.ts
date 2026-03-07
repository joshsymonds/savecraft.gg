import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { GameStatusEnum } from "../src/proto/savecraft/v1/protocol";

import {
  cleanAll,
  closeWs,
  connectDaemonWs,
  connectWs,
  requireInnerPayload,
  requirePayload,
  seedSource,
  sendProto,
  waitForProtoMessage,
  waitForRelayedMessage,
} from "./helpers";

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

    const rows = await env.DB.prepare("SELECT * FROM source_configs WHERE source_uuid = ?")
      .bind(sourceId)
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
      "SELECT save_path FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceId, "d2r")
      .all<{ save_path: string }>();

    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.save_path).toBe("/new/path");
  });

  it("removes games not in the update", async () => {
    const userUuid = "config-remove-user";
    const sourceId = "pc";

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

    const rows = await env.DB.prepare("SELECT game_id FROM source_configs WHERE source_uuid = ?")
      .bind(sourceId)
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

describe("Per-game config PATCH", () => {
  beforeEach(cleanAll);

  it("disables a single game via PATCH", async () => {
    const userUuid = "patch-disable-user";
    const { sourceUuid: sourceId } = await seedSource(userUuid);

    for (const [gameId, path] of [
      ["d2r", "/d2r"],
      ["stardew", "/stardew"],
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
         VALUES (?, ?, ?, 1, '[]')`,
      )
        .bind(sourceId, gameId, path)
        .run();
    }

    const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config/d2r`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${userUuid}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: false }),
    });

    expect(resp.status).toBe(200);

    const d2r = await env.DB.prepare(
      "SELECT enabled FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceId, "d2r")
      .first<{ enabled: number }>();
    expect(d2r!.enabled).toBe(0);

    const stardew = await env.DB.prepare(
      "SELECT enabled FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceId, "stardew")
      .first<{ enabled: number }>();
    expect(stardew!.enabled).toBe(1);
  });

  it("returns 404 for nonexistent config", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/sources/no-source/config/no-game", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer test-user`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: false }),
    });

    expect(resp.status).toBe(404);
  });

  it("returns 403 when source belongs to another user", async () => {
    const { sourceUuid } = await seedSource("owner-user");

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, 1, '[]')`,
    )
      .bind(sourceUuid, "d2r", "/d2r")
      .run();

    const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}/config/d2r`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer attacker-user",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: false }),
    });
    expect(resp.status).toBe(403);

    const config = await env.DB.prepare(
      "SELECT enabled FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceUuid, "d2r")
      .first<{ enabled: number }>();
    expect(config!.enabled).toBe(1);
  });

  it("re-enables a disabled game via PATCH", async () => {
    const userUuid = "patch-enable-user";
    const { sourceUuid } = await seedSource(userUuid);

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, 0, '[]')`,
    )
      .bind(sourceUuid, "d2r", "/d2r")
      .run();

    const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}/config/d2r`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${userUuid}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: true }),
    });
    expect(resp.status).toBe(200);

    const config = await env.DB.prepare(
      "SELECT enabled FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceUuid, "d2r")
      .first<{ enabled: number }>();
    expect(config!.enabled).toBe(1);
  });

  it("requires auth", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/sources/my-pc/config/d2r", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(resp.status).toBe(401);
  });
});

describe("Config push via SourceHub", () => {
  beforeEach(cleanAll);

  it("pushes config to daemon on sourceOnline", async () => {
    const userUuid = "config-push-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);
    sendProto(daemonWs, {
      payload: {
        $case: "sourceOnline",
        sourceOnline: { version: "0.1.0", timestamp: undefined, platform: "", os: "", arch: "" },
      },
    });

    const msg = await waitForProtoMessage(daemonWs);
    const cu = requirePayload(msg, "configUpdate");
    expect(cu.games["d2r"]).toBeDefined();
    expect(cu.games["d2r"]!.savePath).toBe("/saves/d2r");
    expect(cu.games["d2r"]!.enabled).toBe(true);
    expect(cu.games["d2r"]!.fileExtensions).toEqual([".d2s"]);

    await closeWs(daemonWs);
  });

  it("pushes empty config when no configs exist", async () => {
    const userUuid = "config-empty-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);
    sendProto(daemonWs, {
      payload: {
        $case: "sourceOnline",
        sourceOnline: { version: "0.1.0", timestamp: undefined, platform: "", os: "", arch: "" },
      },
    });

    const msg = await waitForProtoMessage(daemonWs);
    const cu = requirePayload(msg, "configUpdate");
    expect(Object.keys(cu.games)).toHaveLength(0);

    await closeWs(daemonWs);
  });

  it("does not set ACTIVATING status when pushing config", async () => {
    const userUuid = "config-activating-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);
    sendProto(daemonWs, {
      payload: {
        $case: "sourceOnline",
        sourceOnline: { version: "0.1.0", timestamp: undefined, platform: "", os: "", arch: "" },
      },
    });
    await waitForProtoMessage(daemonWs);

    const uiWs = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(uiWs);
    const state = requireInnerPayload(msg, "sourceState");
    const source = state.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    const activatingGames = source!.games.filter((g) => g.status === GameStatusEnum.GAME_STATUS_ENUM_ACTIVATING);
    expect(activatingGames).toHaveLength(0);

    await closeWs(uiWs);
    await closeWs(daemonWs);
  });

  it("does not set ACTIVATING for disabled games", async () => {
    const userUuid = "config-disabled-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "stardew", "/saves/stardew", 0, JSON.stringify([".xml"]))
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);
    sendProto(daemonWs, {
      payload: {
        $case: "sourceOnline",
        sourceOnline: { version: "0.1.0", timestamp: undefined, platform: "", os: "", arch: "" },
      },
    });
    await waitForProtoMessage(daemonWs);

    const uiWs = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(uiWs);
    const state = requireInnerPayload(msg, "sourceState");
    const source = state.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    const activatingGames = source!.games.filter((g) => g.status === GameStatusEnum.GAME_STATUS_ENUM_ACTIVATING);
    expect(activatingGames).toHaveLength(0);

    await closeWs(uiWs);
    await closeWs(daemonWs);
  });

  it("config push does not create game entries in SourceState", async () => {
    const userUuid = "config-broadcast-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);
    sendProto(daemonWs, {
      payload: {
        $case: "sourceOnline",
        sourceOnline: { version: "0.1.0", timestamp: undefined, platform: "", os: "", arch: "" },
      },
    });
    await waitForProtoMessage(daemonWs);

    await closeWs(daemonWs);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(freshUi);
    const state = requireInnerPayload(msg, "sourceState");
    const source = state.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    const activatingGames = source!.games.filter((g) => g.status === GameStatusEnum.GAME_STATUS_ENUM_ACTIVATING);
    expect(activatingGames).toHaveLength(0);

    await closeWs(freshUi);
  });

  it("pushes config update when API writes new config", async () => {
    const userUuid = "config-live-push-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);

    sendProto(daemonWs, {
      payload: {
        $case: "sourceOnline",
        sourceOnline: { version: "0.1.0", timestamp: undefined, platform: "", os: "", arch: "" },
      },
    });
    await waitForProtoMessage(daemonWs);

    const configPromise = waitForProtoMessage(daemonWs);

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

    const msg = await configPromise;
    const cu = requirePayload(msg, "configUpdate");
    expect(cu.games["d2r"]).toBeDefined();
    expect(cu.games["d2r"]!.savePath).toBe("/saves/d2r");

    await closeWs(daemonWs);
  });
});
