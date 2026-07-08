import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildPlannerModule } from "../../plugins/poe2/reference/build-planner";
import { getNativeModule, registerNativeModule } from "../src/reference/registry";
import type { Env } from "../src/types";

import { mockFetch } from "./helpers";
import { cleanAll } from "./helpers";

const POB = "https://pob.savecraft.gg";

function poe2Env(): Env {
  return { ...env, POB_URL: POB } as unknown as Env;
}

const USER = "bp2-user";

/**
 * Seed a PoE2 save (optionally with a poe2_build_snapshot row). Returns the
 * save uuid. `lastUpdated` controls most-recently-played ("current")
 * resolution via saves.last_updated DESC.
 */
async function seedPoe2Save(options: {
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
    "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid) VALUES (?, ?, 'poe2', 'Path of Exile 2', ?, ?, ?, ?)",
  )
    .bind(
      saveUuid,
      USER,
      options.saveName,
      `${options.saveName}, Level 92 Titan`,
      options.lastUpdated,
      sourceUuid,
    )
    .run();
  if (options.snapshot) {
    await env.DB.prepare(
      `INSERT INTO poe2_build_snapshot (save_uuid, pob_build_id, pob_xml, imported_at)
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

describe("poe2 build_planner registration", () => {
  beforeEach(cleanAll);

  it("is registered as a native module for poe2 with the shared build_planner id", () => {
    registerNativeModule("poe2", buildPlannerModule);
    const module_ = getNativeModule("poe2", "build_planner");
    expect(module_).toBeDefined();
    expect(module_!.id).toBe("build_planner");
    expect(module_!.name).toBe("Build Planner");
  });
});

describe("poe2 build_planner character param", () => {
  beforeEach(cleanAll);
  afterEach(() => {
    mockFetch.deactivate();
  });

  it('character:"current" resolves the most-recently-played save\'s buildId from poe2_build_snapshot', async () => {
    await seedPoe2Save({
      saveName: "OldChar",
      lastUpdated: "2026-05-01T00:00:00Z",
      snapshot: { buildId: "old-build-id", xml: "<PathOfBuilding2>old</PathOfBuilding2>" },
    });
    await seedPoe2Save({
      saveName: "SpiritTitan",
      lastUpdated: "2026-05-17T00:00:00Z",
      snapshot: { buildId: "recent-build-id", xml: "<PathOfBuilding2>recent</PathOfBuilding2>" },
    });

    mockFetch.activate();
    mockFetch
      .get(POB)
      .intercept({ path: "/build/recent-build-id/summary", method: "GET" })
      .reply(200, calcJson("recent-build-id"), {
        headers: { "content-type": "application/json" },
      });

    const result = await buildPlannerModule.execute(
      { user_id: USER, character: "current" },
      poe2Env(),
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unreachable");
    expect(result.data.buildId).toBe("recent-build-id");
  });

  it('character:"<name>" resolves that specific save\'s snapshot', async () => {
    await seedPoe2Save({
      saveName: "SpiritTitan",
      lastUpdated: "2026-05-17T00:00:00Z",
      snapshot: { buildId: "recent-build-id", xml: "<PathOfBuilding2>recent</PathOfBuilding2>" },
    });
    await seedPoe2Save({
      saveName: "OldChar",
      lastUpdated: "2026-05-20T00:00:00Z",
      snapshot: { buildId: "old-build-id", xml: "<PathOfBuilding2>old</PathOfBuilding2>" },
    });

    mockFetch.activate();
    mockFetch
      .get(POB)
      .intercept({ path: "/build/recent-build-id/summary", method: "GET" })
      .reply(200, calcJson("recent-build-id"), {
        headers: { "content-type": "application/json" },
      });

    const result = await buildPlannerModule.execute(
      { user_id: USER, character: "SpiritTitan" },
      poe2Env(),
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unreachable");
    expect(result.data.buildId).toBe("recent-build-id");
  });

  it("evicted buildId (pob-server 404) → stored xml re-fed to /calc, identical buildId", async () => {
    await seedPoe2Save({
      saveName: "SpiritTitan",
      lastUpdated: "2026-05-17T00:00:00Z",
      snapshot: { buildId: "deadbeef2", xml: "<PathOfBuilding2>snapshot</PathOfBuilding2>" },
    });

    mockFetch.activate();
    // Build evicted from the store — summary 404s.
    mockFetch
      .get(POB)
      .intercept({ path: "/build/deadbeef2/summary", method: "GET" })
      .reply(404, JSON.stringify({ error: "build not found" }), {
        headers: { "content-type": "application/json" },
      });
    // Re-feed: stored XML → /calc yields the IDENTICAL content-addressed id.
    mockFetch
      .get(POB)
      .intercept({ path: "/calc", method: "POST" })
      .reply(200, calcJson("deadbeef2"), {
        headers: { "content-type": "application/json" },
      });

    const result = await buildPlannerModule.execute(
      { user_id: USER, character: "current" },
      poe2Env(),
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unreachable");
    expect(result.data.buildId).toBe("deadbeef2");
  });

  it("evicted buildId on a live-calc op (/modify 404) → re-fed then retried", async () => {
    await seedPoe2Save({
      saveName: "SpiritTitan",
      lastUpdated: "2026-05-17T00:00:00Z",
      snapshot: { buildId: "deadbeef2", xml: "<PathOfBuilding2>snapshot</PathOfBuilding2>" },
    });

    mockFetch.activate();
    mockFetch
      .get(POB)
      .intercept({ path: "/modify", method: "POST" })
      .reply(404, JSON.stringify({ error: "build not found" }), {
        headers: { "content-type": "application/json" },
      });
    mockFetch
      .get(POB)
      .intercept({ path: "/calc", method: "POST" })
      .reply(200, calcJson("deadbeef2"), {
        headers: { "content-type": "application/json" },
      });
    mockFetch
      .get(POB)
      .intercept({ path: "/modify", method: "POST" })
      .reply(200, JSON.stringify({ buildId: "deadbeef2", data: { changes: {} } }), {
        headers: { "content-type": "application/json" },
      });

    const result = await buildPlannerModule.execute(
      {
        user_id: USER,
        character: "current",
        operations: [{ op: "set_level", level: 95 }],
      },
      poe2Env(),
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unreachable");
    expect(result.data.buildId).toBe("deadbeef2");
  });

  it("never-refreshed character → structured refresh-first guidance naming PoE2, not an exception", async () => {
    // Save exists but no poe2_build_snapshot row.
    await seedPoe2Save({ saveName: "FreshChar", lastUpdated: "2026-05-17T00:00:00Z" });

    mockFetch.activate();

    const result = await buildPlannerModule.execute(
      { user_id: USER, character: "FreshChar" },
      poe2Env(),
    );

    expect(result.type).toBe("text");
    if (result.type !== "text") throw new Error("unreachable");
    expect(result.content.toLowerCase()).toContain("refresh");
    expect(result.content).toContain("PoE2");
    // No pob-server / GGG call happened — any unintercepted request
    // would have thrown "Unmocked fetch:" via the mockFetch helper.
  });

  it("regression: build_id flow unchanged when character is absent", async () => {
    mockFetch.activate();
    mockFetch
      .get(POB)
      .intercept({ path: "/build/url-build-id/summary", method: "GET" })
      .reply(200, calcJson("url-build-id"), {
        headers: { "content-type": "application/json" },
      });

    const result = await buildPlannerModule.execute(
      { user_id: USER, build_id: "url-build-id" },
      poe2Env(),
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unreachable");
    expect(result.data.buildId).toBe("url-build-id");
  });
});

describe("poe2 build_planner resolve (analyze) via build URL", () => {
  beforeEach(cleanAll);
  afterEach(() => {
    mockFetch.deactivate();
  });

  it("resolves a build URL against pob-server's /resolve endpoint", async () => {
    mockFetch.activate();
    mockFetch
      .get(POB)
      .intercept({ path: "/resolve", method: "POST" })
      .reply(
        200,
        JSON.stringify({
          buildId: "resolved-poe2-id",
          data: { summary: { Life: 4800, CombinedDPS: 850_000 } },
        }),
        { headers: { "content-type": "application/json" } },
      );

    const result = await buildPlannerModule.execute(
      { build: "https://pobb.in/poe2-example" },
      poe2Env(),
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unreachable");
    expect(result.data.buildId).toBe("resolved-poe2-id");
  });
});

describe("poe2 build_planner: no bandits, no pantheon, no buy_similar", () => {
  beforeEach(cleanAll);
  afterEach(() => {
    mockFetch.deactivate();
  });

  it("operations schema documents no set_bandit or set_pantheon op (PoE2 has neither system)", () => {
    const operationsDescription = (
      buildPlannerModule.parameters!.operations as { description: string }
    ).description;
    // Neither op is listed as an available "op":"..." entry — the
    // description may still explain their absence in prose.
    expect(operationsDescription).not.toContain('"op":"set_bandit"');
    expect(operationsDescription).not.toContain('"op":"set_pantheon"');
  });

  it("parameters schema does not declare buy_similar, league, or buy_similar_filters", () => {
    expect(buildPlannerModule.parameters).not.toHaveProperty("buy_similar");
    expect(buildPlannerModule.parameters).not.toHaveProperty("league");
    expect(buildPlannerModule.parameters).not.toHaveProperty("buy_similar_filters");
  });

  it("rejects buy_similar=true on a compare call with a clear error, not a silent no-op", async () => {
    mockFetch.activate();
    // No /compare interceptor registered — a call that reached pob-server
    // would throw "Unmocked fetch:" and fail the test, proving the
    // rejection short-circuits before any network call.

    const result = await buildPlannerModule.execute(
      {
        build_id: "some-build-id",
        compare_with: ["other-build-id"],
        buy_similar: true,
      },
      poe2Env(),
    );

    expect(result.type).toBe("text");
    if (result.type !== "text") throw new Error("unreachable");
    expect(result.content).toContain("Error");
    expect(result.content.toLowerCase()).toContain("buy_similar");
    expect(result.content).toContain("Path of Exile 2");
  });

  it("rejects buy_similar_filters without buy_similar on a compare call, not a silent no-op", async () => {
    mockFetch.activate();
    // No /compare interceptor registered — a call that reached pob-server
    // would throw "Unmocked fetch:" and fail the test, proving the
    // rejection short-circuits before any network call.

    const result = await buildPlannerModule.execute(
      {
        build_id: "some-build-id",
        compare_with: ["other-build-id"],
        buy_similar_filters: { mods: [{ mod_text: "+# to maximum Life", min: 90 }] },
      },
      poe2Env(),
    );

    expect(result.type).toBe("text");
    if (result.type !== "text") throw new Error("unreachable");
    expect(result.content).toContain("Error");
    expect(result.content).toContain("buy_similar_filters");
    expect(result.content).toContain("Path of Exile 2");
  });
});
