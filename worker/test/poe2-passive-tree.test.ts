import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { passiveTreeModule } from "../../plugins/poe2/reference/passive-tree";
import { registerNativeModule } from "../src/reference/registry";

import { cleanAll } from "./helpers";

interface SeedNode {
  hash: number;
  name: string;
  isNotable?: boolean;
  isKeystone?: boolean;
  isMastery?: boolean;
  ascendancyName?: string | null;
  stats?: string[];
}

async function seedNode(node: SeedNode): Promise<void> {
  const statsJSON = JSON.stringify(node.stats ?? []);
  const ascendancyName = node.ascendancyName ?? null;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO poe2_passive_nodes (hash, name, is_notable, is_keystone, is_mastery, ascendancy_name, stats)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      node.hash,
      node.name,
      node.isNotable ? 1 : 0,
      node.isKeystone ? 1 : 0,
      node.isMastery ? 1 : 0,
      ascendancyName,
      statsJSON,
    ),
    env.DB.prepare(
      `INSERT INTO poe2_passive_nodes_fts (hash, name, stats, ascendancy_name) VALUES (?, ?, ?, ?)`,
    ).bind(node.hash, node.name, statsJSON, ascendancyName),
  ]);
}

async function seedFixtureNodes(): Promise<void> {
  await seedNode({
    hash: 100,
    name: "Avatar of Fire",
    isKeystone: true,
    stats: ["75% of Damage Converted to Fire Damage"],
  });
  await seedNode({
    hash: 200,
    name: "Heat of the Forge",
    isNotable: true,
    ascendancyName: "Infernalist",
    stats: ["Fire Spell on Hit"],
  });
  await seedNode({
    hash: 300,
    name: "Bow Mastery",
    isMastery: true,
    stats: [],
  });
  await seedNode({
    hash: 400,
    name: "Fire Damage",
    stats: ["20% increased Fire Damage"],
  });
}

describe("passive_tree native module (poe2)", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("poe2", passiveTreeModule);
  });

  it("returns usage text when no query or hashes are provided", async () => {
    const result = await passiveTreeModule.execute({}, env as never);
    expect(result.type).toBe("text");
    if (result.type !== "text") throw new Error("unreachable");
    expect(result.content).toContain("query");
    expect(result.content).toContain("hashes");
  });

  describe("search (FTS5)", () => {
    beforeEach(seedFixtureNodes);

    it("finds a node by name", async () => {
      const result = await passiveTreeModule.execute({ query: "Avatar of Fire" }, env as never);
      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unreachable");
      const data = result.data as { results: { hash: number; name: string }[] };
      expect(data.results.map((r) => r.hash)).toContain(100);
    });

    it("finds a node by stat text", async () => {
      const result = await passiveTreeModule.execute({ query: "Fire Spell on Hit" }, env as never);
      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unreachable");
      const data = result.data as { results: { hash: number }[] };
      expect(data.results.map((r) => r.hash)).toContain(200);
    });

    it("filters by node type", async () => {
      const result = await passiveTreeModule.execute(
        { query: "Fire", type: "keystone" },
        env as never,
      );
      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unreachable");
      const data = result.data as { results: { hash: number; type: string }[] };
      expect(data.results.every((r) => r.type === "keystone")).toBe(true);
      expect(data.results.map((r) => r.hash)).toContain(100);
      expect(data.results.map((r) => r.hash)).not.toContain(400);
    });

    it("filters by ascendancy", async () => {
      const result = await passiveTreeModule.execute(
        { query: "Fire", ascendancy: "Infernalist" },
        env as never,
      );
      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unreachable");
      const data = result.data as { results: { hash: number; ascendancy: string | null }[] };
      expect(data.results.map((r) => r.hash)).toEqual([200]);
      expect(data.results[0]!.ascendancy).toBe("Infernalist");
    });

    it("reports data-not-populated when the table is empty", async () => {
      await env.DB.prepare("DELETE FROM poe2_passive_nodes").run();
      await env.DB.prepare("DELETE FROM poe2_passive_nodes_fts").run();
      const result = await passiveTreeModule.execute({ query: "Fire" }, env as never);
      expect(result.type).toBe("text");
      if (result.type !== "text") throw new Error("unreachable");
      expect(result.content.toLowerCase()).toContain("not");
    });
  });

  describe("resolve_hashes", () => {
    beforeEach(seedFixtureNodes);

    it("resolves known hashes to name/type/stats, preserving input order", async () => {
      const result = await passiveTreeModule.execute({ hashes: [300, 100] }, env as never);
      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unreachable");
      const data = result.data as {
        results: { hash: number; name: string; type: string; stats: unknown[] }[];
        unknown_hashes: unknown[];
      };
      expect(data.results.map((r) => r.hash)).toEqual([300, 100]);
      expect(data.results[0]!.name).toBe("Bow Mastery");
      expect(data.results[0]!.type).toBe("mastery");
      expect(data.results[1]!.name).toBe("Avatar of Fire");
      expect(data.results[1]!.type).toBe("keystone");
      expect(data.unknown_hashes).toEqual([]);
    });

    it("silently skips unknown hashes but reports them in unknown_hashes", async () => {
      const result = await passiveTreeModule.execute({ hashes: [300, 999, 100] }, env as never);
      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unreachable");
      const data = result.data as {
        results: { hash: number }[];
        unknown_hashes: unknown[];
      };
      expect(data.results.map((r) => r.hash)).toEqual([300, 100]);
      expect(data.unknown_hashes).toEqual([999]);
    });

    it("treats non-numeric entries as unknown and reports them verbatim", async () => {
      const result = await passiveTreeModule.execute({ hashes: [300, "abc"] }, env as never);
      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unreachable");
      const data = result.data as {
        results: { hash: number }[];
        unknown_hashes: unknown[];
      };
      expect(data.results.map((r) => r.hash)).toEqual([300]);
      expect(data.unknown_hashes).toEqual(["abc"]);
    });

    it("repeats a hash in results if it appears more than once in the input", async () => {
      const result = await passiveTreeModule.execute({ hashes: [100, 100] }, env as never);
      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unreachable");
      const data = result.data as { results: { hash: number }[] };
      expect(data.results.map((r) => r.hash)).toEqual([100, 100]);
    });

    it("returns empty results and unknown_hashes for an empty hashes array", async () => {
      const result = await passiveTreeModule.execute({ hashes: [] }, env as never);
      expect(result.type).toBe("structured");
      if (result.type !== "structured") throw new Error("unreachable");
      const data = result.data as { results: unknown[]; unknown_hashes: unknown[] };
      expect(data.results).toEqual([]);
      expect(data.unknown_hashes).toEqual([]);
    });
  });
});
