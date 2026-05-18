import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildPlannerModule } from "../../plugins/poe/reference/build-planner";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const POB = "https://pob.savecraft.gg";

function poeEnv(): Env {
  return { ...env, POB_URL: POB } as unknown as Env;
}

const USER = "bp-user";

/**
 * Seed a PoE save (optionally with a poe_build_snapshot row). Returns the
 * save uuid. `lastUpdated` controls most-recently-played ("current")
 * resolution via saves.last_updated DESC.
 */
async function seedPoeSave(options: {
  saveName: string;
  lastUpdated: string;
  snapshot?: { buildId: string; xml: string };
}): Promise<string> {
  const sourceUuid = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind, can_rescan, can_receive_config) VALUES (?, ?, ?, 'adapter', 0, 0)",
  )
    .bind(sourceUuid, USER, `h-${sourceUuid}`)
    .run();
  const saveUuid = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid) VALUES (?, ?, 'poe', 'Path of Exile', ?, ?, ?, ?)",
  )
    .bind(
      saveUuid,
      USER,
      options.saveName,
      `${options.saveName}, Level 92 Juggernaut`,
      options.lastUpdated,
      sourceUuid,
    )
    .run();
  if (options.snapshot) {
    await env.DB.prepare(
      `INSERT INTO poe_build_snapshot (save_uuid, pob_build_id, pob_xml, imported_at)
       VALUES (?, ?, ?, datetime('now'))`,
    )
      .bind(saveUuid, options.snapshot.buildId, options.snapshot.xml)
      .run();
  }
  return saveUuid;
}

function calcJson(buildId: string): string {
  return JSON.stringify({
    buildId,
    data: { summary: { Life: 5200, CombinedDPS: 1_000_000 } },
  });
}

describe("build_planner character param", () => {
  beforeEach(cleanAll);
  afterEach(() => {
    fetchMock.deactivate();
  });

  it('character:"current" resolves the most-recently-played save\'s buildId (no build/build_id arg)', async () => {
    await seedPoeSave({
      saveName: "OldChar",
      lastUpdated: "2026-05-01T00:00:00Z",
      snapshot: { buildId: "old-build-id", xml: "<PathOfBuilding>old</PathOfBuilding>" },
    });
    await seedPoeSave({
      saveName: "BoneShatterJugg",
      lastUpdated: "2026-05-17T00:00:00Z",
      snapshot: { buildId: "recent-build-id", xml: "<PathOfBuilding>recent</PathOfBuilding>" },
    });

    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get(POB)
      .intercept({ path: "/build/recent-build-id/summary", method: "GET" })
      .reply(200, calcJson("recent-build-id"), {
        headers: { "content-type": "application/json" },
      });

    const result = await buildPlannerModule.execute(
      { user_id: USER, character: "current" },
      poeEnv(),
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unreachable");
    expect(result.data.buildId).toBe("recent-build-id");
  });

  it('character:"<name>" resolves that specific save\'s snapshot', async () => {
    await seedPoeSave({
      saveName: "BoneShatterJugg",
      lastUpdated: "2026-05-17T00:00:00Z",
      snapshot: { buildId: "recent-build-id", xml: "<PathOfBuilding>recent</PathOfBuilding>" },
    });
    await seedPoeSave({
      saveName: "OldChar",
      lastUpdated: "2026-05-20T00:00:00Z",
      snapshot: { buildId: "old-build-id", xml: "<PathOfBuilding>old</PathOfBuilding>" },
    });

    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get(POB)
      .intercept({ path: "/build/recent-build-id/summary", method: "GET" })
      .reply(200, calcJson("recent-build-id"), {
        headers: { "content-type": "application/json" },
      });

    const result = await buildPlannerModule.execute(
      { user_id: USER, character: "BoneShatterJugg" },
      poeEnv(),
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unreachable");
    expect(result.data.buildId).toBe("recent-build-id");
  });

  it("evicted buildId (pob-server 404) → stored xml re-fed to /calc, identical buildId", async () => {
    await seedPoeSave({
      saveName: "BoneShatterJugg",
      lastUpdated: "2026-05-17T00:00:00Z",
      snapshot: { buildId: "deadbeef", xml: "<PathOfBuilding>snapshot</PathOfBuilding>" },
    });

    fetchMock.activate();
    fetchMock.disableNetConnect();
    // Build evicted from the store — summary 404s.
    fetchMock
      .get(POB)
      .intercept({ path: "/build/deadbeef/summary", method: "GET" })
      .reply(404, JSON.stringify({ error: "build not found" }), {
        headers: { "content-type": "application/json" },
      });
    // Re-feed: stored XML → /calc yields the IDENTICAL content-addressed id.
    fetchMock
      .get(POB)
      .intercept({ path: "/calc", method: "POST" })
      .reply(200, calcJson("deadbeef"), {
        headers: { "content-type": "application/json" },
      });

    const result = await buildPlannerModule.execute(
      { user_id: USER, character: "current" },
      poeEnv(),
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unreachable");
    expect(result.data.buildId).toBe("deadbeef");
  });

  it("evicted buildId on a live-calc op (/modify 404) → re-fed then retried", async () => {
    await seedPoeSave({
      saveName: "BoneShatterJugg",
      lastUpdated: "2026-05-17T00:00:00Z",
      snapshot: { buildId: "deadbeef", xml: "<PathOfBuilding>snapshot</PathOfBuilding>" },
    });

    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get(POB)
      .intercept({ path: "/modify", method: "POST" })
      .reply(404, JSON.stringify({ error: "build not found" }), {
        headers: { "content-type": "application/json" },
      });
    fetchMock
      .get(POB)
      .intercept({ path: "/calc", method: "POST" })
      .reply(200, calcJson("deadbeef"), {
        headers: { "content-type": "application/json" },
      });
    fetchMock
      .get(POB)
      .intercept({ path: "/modify", method: "POST" })
      .reply(200, JSON.stringify({ buildId: "deadbeef", data: { changes: {} } }), {
        headers: { "content-type": "application/json" },
      });

    const result = await buildPlannerModule.execute(
      {
        user_id: USER,
        character: "current",
        operations: [{ op: "set_level", level: 95 }],
      },
      poeEnv(),
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unreachable");
    expect(result.data.buildId).toBe("deadbeef");
  });

  it("never-refreshed character → structured refresh-first guidance, not an exception", async () => {
    // Save exists but no poe_build_snapshot row.
    await seedPoeSave({ saveName: "FreshChar", lastUpdated: "2026-05-17T00:00:00Z" });

    fetchMock.activate();
    fetchMock.disableNetConnect();

    const result = await buildPlannerModule.execute(
      { user_id: USER, character: "FreshChar" },
      poeEnv(),
    );

    expect(result.type).toBe("text");
    if (result.type !== "text") throw new Error("unreachable");
    expect(result.content.toLowerCase()).toContain("refresh");
    // No pob-server / GGG call happened — disableNetConnect would have
    // thrown on any unintercepted request.
  });

  it("no GGG fetch and no /import call on the character path", async () => {
    await seedPoeSave({
      saveName: "BoneShatterJugg",
      lastUpdated: "2026-05-17T00:00:00Z",
      snapshot: { buildId: "deadbeef", xml: "<PathOfBuilding>x</PathOfBuilding>" },
    });

    fetchMock.activate();
    fetchMock.disableNetConnect();
    // Only the pob-server summary endpoint is registered. A GGG or
    // /import call would hit disableNetConnect and throw, failing the test.
    fetchMock
      .get(POB)
      .intercept({ path: "/build/deadbeef/summary", method: "GET" })
      .reply(200, calcJson("deadbeef"), {
        headers: { "content-type": "application/json" },
      });

    const result = await buildPlannerModule.execute(
      { user_id: USER, character: "current" },
      poeEnv(),
    );

    expect(result.type).toBe("structured");
  });

  it("regression: build_id flow unchanged when character is absent", async () => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get(POB)
      .intercept({ path: "/build/url-build-id/summary", method: "GET" })
      .reply(200, calcJson("url-build-id"), {
        headers: { "content-type": "application/json" },
      });

    const result = await buildPlannerModule.execute(
      { user_id: USER, build_id: "url-build-id" },
      poeEnv(),
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unreachable");
    expect(result.data.buildId).toBe("url-build-id");
  });
});
