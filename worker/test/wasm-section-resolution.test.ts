import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  resolveWasmSectionParams,
  type VerifiedSaveCache,
} from "../src/reference/section-resolution";

import { cleanAll, seedSaveWithData } from "./helpers";

describe("WASM section resolution", () => {
  const USER_A = "user-aaa";
  const USER_B = "user-bbb";

  beforeEach(async () => {
    await cleanAll();
  });

  it("injects section data under mapped query keys", async () => {
    const saveId = await seedSaveWithData(USER_A, "factorio", "TestFactory");
    const machinesData = {
      by_recipe: {
        "electronic-circuit": { machine_type: "assembling-machine-2", count: 8, modules: {} },
      },
      by_type: { "assembling-machine": 8 },
      beacon_count: 0,
    };
    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveId, "machines", "Active crafting entities", JSON.stringify(machinesData))
      .run();

    const sectionMappings: Record<string, string> = {
      existing_machines: "machines",
    };

    const query: Record<string, unknown> = {
      save_id: saveId,
      target_item: "electronic-circuit",
      target_rate: 60,
    };

    const resolved = await resolveWasmSectionParams(env.DB, USER_A, sectionMappings, query);

    expect(resolved.existing_machines).toEqual(machinesData);
    expect(resolved.target_item).toBe("electronic-circuit");
    expect(resolved.target_rate).toBe(60);
    // save_id should be stripped
    expect(resolved.save_id).toBeUndefined();
  });

  it("resolves multiple section mappings in parallel", async () => {
    const saveId = await seedSaveWithData(USER_A, "factorio", "TestFactory");
    const machinesData = { by_recipe: {}, by_type: {}, beacon_count: 0 };
    const flowData = { items: {}, fluids: {}, top_deficits: [], top_surpluses: [] };

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
      ).bind(saveId, "machines", "Machines", JSON.stringify(machinesData)),
      env.DB.prepare(
        "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
      ).bind(saveId, "production_flow", "Production flow", JSON.stringify(flowData)),
    ]);

    const sectionMappings: Record<string, string> = {
      existing_machines: "machines",
      actual_flow: "production_flow",
    };

    const query: Record<string, unknown> = {
      save_id: saveId,
      target_item: "iron-plate",
    };

    const resolved = await resolveWasmSectionParams(env.DB, USER_A, sectionMappings, query);

    expect(resolved.existing_machines).toEqual(machinesData);
    expect(resolved.actual_flow).toEqual(flowData);
    expect(resolved.save_id).toBeUndefined();
  });

  it("passes through query unchanged when save_id is absent", async () => {
    const sectionMappings: Record<string, string> = {
      existing_machines: "machines",
    };

    const query: Record<string, unknown> = {
      target_item: "electronic-circuit",
      target_rate: 60,
    };

    const resolved = await resolveWasmSectionParams(env.DB, USER_A, sectionMappings, query);

    expect(resolved).toEqual(query);
  });

  it("rejects cross-user section access", async () => {
    const saveId = await seedSaveWithData(USER_A, "factorio", "TestFactory");
    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveId, "machines", "Machines", '{"by_recipe":{}}')
      .run();

    const sectionMappings: Record<string, string> = {
      existing_machines: "machines",
    };

    const query: Record<string, unknown> = {
      save_id: saveId,
      target_item: "iron-plate",
    };

    await expect(resolveWasmSectionParams(env.DB, USER_B, sectionMappings, query)).rejects.toThrow(
      "Save not found",
    );
  });

  it("throws when section not found in save", async () => {
    const saveId = await seedSaveWithData(USER_A, "factorio", "TestFactory");

    const sectionMappings: Record<string, string> = {
      existing_machines: "machines",
    };

    const query: Record<string, unknown> = {
      save_id: saveId,
      target_item: "iron-plate",
    };

    await expect(resolveWasmSectionParams(env.DB, USER_A, sectionMappings, query)).rejects.toThrow(
      'requires the "machines" section from save data',
    );
  });

  it("uses verified save cache across calls", async () => {
    const saveId = await seedSaveWithData(USER_A, "factorio", "TestFactory");
    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveId, "machines", "Machines", '{"by_recipe":{}}')
      .run();

    const sectionMappings: Record<string, string> = {
      existing_machines: "machines",
    };

    const cache: VerifiedSaveCache = new Set();

    const query: Record<string, unknown> = {
      save_id: saveId,
      target_item: "iron-plate",
    };

    // First call populates cache
    await resolveWasmSectionParams(env.DB, USER_A, sectionMappings, query, cache);
    expect(cache.has(saveId)).toBe(true);

    // Second call should use cache (won't fail even if we somehow invalidated the save row)
    const resolved = await resolveWasmSectionParams(
      env.DB,
      USER_A,
      sectionMappings,
      { ...query },
      cache,
    );
    expect(resolved.existing_machines).toEqual({ by_recipe: {} });
  });

  it("does not override explicit query params with section data", async () => {
    const saveId = await seedSaveWithData(USER_A, "factorio", "TestFactory");
    const machinesData = { by_recipe: { "iron-plate": { count: 5 } } };
    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveId, "machines", "Machines", JSON.stringify(machinesData))
      .run();

    const sectionMappings: Record<string, string> = {
      existing_machines: "machines",
    };

    // Caller explicitly passes existing_machines — should win over section data
    const inlineMachines = { by_recipe: { "copper-plate": { count: 3 } } };
    const query: Record<string, unknown> = {
      save_id: saveId,
      target_item: "iron-plate",
      existing_machines: inlineMachines,
    };

    const resolved = await resolveWasmSectionParams(env.DB, USER_A, sectionMappings, query);

    expect(resolved.existing_machines).toEqual(inlineMachines);
    expect(resolved.save_id).toBeUndefined();
  });
});
