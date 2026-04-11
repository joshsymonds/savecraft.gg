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
  sendSourceOnlineAndDrainLinkState,
  waitForPayload,
  waitForProtoMessage,
  waitForRelayedMessage,
} from "./helpers";

/** Create a source row with a known UUID linked to a user. */
async function seedSourceWithId(sourceId: string, userUuid: string): Promise<void> {
  await env.DB.prepare("INSERT INTO sources (source_uuid, user_uuid, token_hash) VALUES (?, ?, ?)")
    .bind(sourceId, userUuid, crypto.randomUUID())
    .run();
}

describe("Source Config API", () => {
  beforeEach(cleanAll);

  it("saves config to D1 via PUT", async () => {
    const userUuid = "config-put-user";
    const sourceId = "steam-deck";
    await seedSourceWithId(sourceId, userUuid);

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
    await seedSourceWithId(sourceId, userUuid);

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

  it("preserves games not in the update (upsert-only)", async () => {
    const userUuid = "config-preserve-other-user";
    const sourceId = "pc";
    await seedSourceWithId(sourceId, userUuid);

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

    // Second PUT with only d2r — stardew should be preserved
    await SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${userUuid}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        games: {
          d2r: { savePath: "/d2r-updated", enabled: true, fileExtensions: [".d2s"] },
        },
      }),
    });

    const rows = await env.DB.prepare(
      "SELECT game_id, save_path FROM source_configs WHERE source_uuid = ? ORDER BY game_id",
    )
      .bind(sourceId)
      .all<{ game_id: string; save_path: string }>();

    expect(rows.results).toHaveLength(2);
    expect(rows.results[0]!.game_id).toBe("d2r");
    expect(rows.results[0]!.save_path).toBe("/d2r-updated");
    expect(rows.results[1]!.game_id).toBe("stardew");
    expect(rows.results[1]!.save_path).toBe("/stardew");
  });

  it("re-enables a previously disabled game via PUT", async () => {
    const userUuid = "config-readd-user";
    const sourceId = "readd-source";
    await seedSourceWithId(sourceId, userUuid);

    // Seed a disabled config (simulating Remove Game)
    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, 0, ?)`,
    )
      .bind(sourceId, "d2r", "/old/path", JSON.stringify([".d2s"]))
      .run();

    // Re-add via PUT (what GamePickerModal does)
    const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${userUuid}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        games: {
          d2r: { savePath: "/new/path", enabled: true, fileExtensions: [".d2s", ".d2i"] },
        },
      }),
    });
    expect(resp.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT save_path, enabled, file_extensions FROM source_configs WHERE source_uuid = ? AND game_id = ?",
    )
      .bind(sourceId, "d2r")
      .first<{ save_path: string; enabled: number; file_extensions: string }>();

    expect(row).not.toBeNull();
    expect(row!.enabled).toBe(1);
    expect(row!.save_path).toBe("/new/path");
    expect(JSON.parse(row!.file_extensions)).toEqual([".d2s", ".d2i"]);
  });

  it("preserves other game configs when adding a single game via PUT", async () => {
    const userUuid = "config-preserve-user";
    const sourceId = "preserve-source";
    await seedSourceWithId(sourceId, userUuid);

    // Seed an existing enabled config
    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, 1, ?)`,
    )
      .bind(sourceId, "stardew", "/saves/stardew", JSON.stringify([".xml"]))
      .run();

    // Add d2r via PUT — stardew should NOT be deleted
    const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config`, {
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

    const rows = await env.DB.prepare(
      "SELECT game_id, enabled FROM source_configs WHERE source_uuid = ? ORDER BY game_id",
    )
      .bind(sourceId)
      .all<{ game_id: string; enabled: number }>();

    expect(rows.results).toHaveLength(2);
    expect(rows.results[0]!.game_id).toBe("d2r");
    expect(rows.results[0]!.enabled).toBe(1);
    expect(rows.results[1]!.game_id).toBe("stardew");
    expect(rows.results[1]!.enabled).toBe(1);
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
    await seedSourceWithId(sourceId, userUuid);

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
    const sourceId = "empty-config-source";
    await seedSourceWithId(sourceId, userUuid);

    const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceId}/config`, {
      method: "GET",
      headers: { Authorization: `Bearer ${userUuid}` },
    });
    expect(resp.status).toBe(200);

    const body = await resp.json<{ games: Record<string, unknown> }>();
    expect(body.games).toEqual({});
  });

  it("GET /api/v1/sources/:id/config returns 404 for nonexistent source", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/sources/nonexistent/config", {
      method: "GET",
      headers: { Authorization: "Bearer some-user" },
    });
    expect(resp.status).toBe(404);
  });

  it("GET /api/v1/sources/:id/config returns 404 for another user's source", async () => {
    await seedSourceWithId("other-source", "owner-user");
    const resp = await SELF.fetch("https://test-host/api/v1/sources/other-source/config", {
      method: "GET",
      headers: { Authorization: "Bearer attacker-user" },
    });
    expect(resp.status).toBe(404);
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

    await env.DB.prepare(
      `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(sourceUuid, "d2r", "/saves/d2r", 1, JSON.stringify([".d2s"]))
      .run();

    const daemonWs = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemonWs);

    const msg = await waitForPayload(daemonWs, "configUpdate");
    const cu = requirePayload(msg, "configUpdate");
    expect(cu.games.d2r).toBeDefined();
    expect(cu.games.d2r!.savePath).toBe("/saves/d2r");
    expect(cu.games.d2r!.enabled).toBe(true);
    expect(cu.games.d2r!.fileExtensions).toEqual([".d2s"]);

    await closeWs(daemonWs);
  });

  it("pushes empty config when no configs exist", async () => {
    const userUuid = "config-empty-user";
    const { sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);
    await sendSourceOnlineAndDrainLinkState(daemonWs);

    const msg = await waitForPayload(daemonWs, "configUpdate");
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
    await sendSourceOnlineAndDrainLinkState(daemonWs);
    await waitForPayload(daemonWs, "configUpdate");

    const uiWs = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(uiWs);
    const state = requireInnerPayload(msg, "sourceState");
    const source = state.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    const activatingGames = source!.games.filter(
      (g) => g.status === GameStatusEnum.GAME_STATUS_ENUM_ACTIVATING,
    );
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
    await sendSourceOnlineAndDrainLinkState(daemonWs);
    await waitForPayload(daemonWs, "configUpdate");

    const uiWs = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(uiWs);
    const state = requireInnerPayload(msg, "sourceState");
    const source = state.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    const activatingGames = source!.games.filter(
      (g) => g.status === GameStatusEnum.GAME_STATUS_ENUM_ACTIVATING,
    );
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
    await sendSourceOnlineAndDrainLinkState(daemonWs);
    await waitForPayload(daemonWs, "configUpdate");

    await closeWs(daemonWs);

    const freshUi = await connectWs("/ws/ui", userUuid);
    const msg = await waitForRelayedMessage(freshUi);
    const state = requireInnerPayload(msg, "sourceState");
    const source = state.sources.find((d) => d.sourceId === sourceUuid);
    expect(source).toBeDefined();
    const activatingGames = source!.games.filter(
      (g) => g.status === GameStatusEnum.GAME_STATUS_ENUM_ACTIVATING,
    );
    expect(activatingGames).toHaveLength(0);

    await closeWs(freshUi);
  });

  it("pushes config update when API writes new config", async () => {
    const userUuid = "config-live-push-user";
    const { sourceUuid, sourceToken } = await seedSource(userUuid);

    const daemonWs = await connectDaemonWs(sourceToken);

    await sendSourceOnlineAndDrainLinkState(daemonWs);
    await waitForPayload(daemonWs, "configUpdate");

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
    expect(cu.games.d2r).toBeDefined();
    expect(cu.games.d2r!.savePath).toBe("/saves/d2r");

    await closeWs(daemonWs);
  });
});
