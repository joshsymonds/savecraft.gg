import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getModuleParameters, queryReference } from "../src/mcp/tools";
import {
  clearNativeRegistry,
  getNativeModule,
  getNativeModules,
  registerNativeModule,
} from "../src/reference/registry";
import type { NativeReferenceModule } from "../src/reference/types";

// ── Registry unit tests ──────────────────────────────────────

describe("NativeReferenceModule registry", () => {
  beforeEach(() => {
    clearNativeRegistry();
  });

  const fakeModule: NativeReferenceModule = {
    id: "test_module",
    name: "Test Module",
    description: "A test module",
    parameters: { type: "object", properties: { q: { type: "string" } } },
    execute: () => Promise.resolve({ type: "text", content: "hello from native" }),
  };

  it("registers and retrieves a module", () => {
    registerNativeModule("game1", fakeModule);
    expect(getNativeModule("game1", "test_module")).toBe(fakeModule);
  });

  it("returns undefined for unregistered game", () => {
    expect(getNativeModule("nonexistent", "test_module")).toBeUndefined();
  });

  it("returns undefined for unregistered module", () => {
    registerNativeModule("game1", fakeModule);
    expect(getNativeModule("game1", "other_module")).toBeUndefined();
  });

  it("lists native modules for a game", () => {
    registerNativeModule("game1", fakeModule);
    const modules = getNativeModules("game1");
    expect(modules).toEqual([
      {
        id: "test_module",
        name: "Test Module",
        description: "A test module",
        parameters: { type: "object", properties: { q: { type: "string" } } },
        visual: false,
      },
    ]);
  });

  it("returns empty array for game with no native modules", () => {
    expect(getNativeModules("nonexistent")).toEqual([]);
  });

  it("does not leak execute function into metadata", () => {
    registerNativeModule("game1", fakeModule);
    const modules = getNativeModules("game1");
    expect(modules[0]).not.toHaveProperty("execute");
  });

  it("clears all registrations", () => {
    registerNativeModule("game1", fakeModule);
    clearNativeRegistry();
    expect(getNativeModule("game1", "test_module")).toBeUndefined();
  });
});

// ── queryReference routing tests ─────────────────────────────

describe("queryReference native routing", () => {
  beforeEach(() => {
    clearNativeRegistry();
  });

  afterEach(() => {
    clearNativeRegistry();
  });

  it("routes to native module when registered", async () => {
    const nativeModule: NativeReferenceModule = {
      id: "test_search",
      name: "Test Search",
      description: "Test search module",
      execute: (query) =>
        Promise.resolve({
          type: "text",
          content: `searched for: ${String(query.keyword)}`,
        }),
    };
    registerNativeModule("testgame", nativeModule);

    const result = await queryReference(
      env.REFERENCE_PLUGINS,
      "testgame",
      "test_search",
      { keyword: "deathtouch" },
      env,
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toBe("searched for: deathtouch");
  });

  it("returns structured data as JSON", async () => {
    const nativeModule: NativeReferenceModule = {
      id: "structured_mod",
      name: "Structured Module",
      description: "Returns structured data",
      execute: () =>
        Promise.resolve({
          type: "structured",
          data: { cards: ["Lightning Bolt"], count: 1 },
        }),
    };
    registerNativeModule("testgame", nativeModule);

    const result = await queryReference(
      env.REFERENCE_PLUGINS,
      "testgame",
      "structured_mod",
      {},
      env,
    );

    expect(result.isError).toBeFalsy();
    // Structured results return ViewToolResult with structuredContent
    expect("structuredContent" in result).toBe(true);
    const viewRes = result as unknown as { structuredContent: Record<string, unknown> };
    expect(viewRes.structuredContent).toEqual({ cards: ["Lightning Bolt"], count: 1 });
  });

  it("returns error when native module throws", async () => {
    const failingModule: NativeReferenceModule = {
      id: "failing_mod",
      name: "Failing Module",
      description: "Always fails",
      execute: () => {
        throw new Error("database connection failed");
      },
    };
    registerNativeModule("testgame", failingModule);

    const result = await queryReference(env.REFERENCE_PLUGINS, "testgame", "failing_mod", {}, env);

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("database connection failed");
  });

  it("falls through to WfP dispatch when module is not native", async () => {
    // No native module registered for "unknown_game".
    // WfP dispatch will also fail (no Worker deployed), but we verify the
    // error directs the LLM to list_games for discovery.
    const result = await queryReference(
      env.REFERENCE_PLUGINS,
      "unknown_game",
      "some_module",
      {},
      env,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('"some_module" not found');
    expect(result.content[0]!.text).toContain('list_games(filter="unknown_game")');
  });

  it("returns ViewToolResult for structured result", async () => {
    const nativeModule: NativeReferenceModule = {
      id: "viz_structured",
      name: "Viz Structured",
      description: "Returns structured data",
      execute: () =>
        Promise.resolve({
          type: "structured",
          data: { win_rate: 0.58, matches: 42 },
        }),
    };
    registerNativeModule("testgame", nativeModule);

    const result = await queryReference(
      env.REFERENCE_PLUGINS,
      "testgame",
      "viz_structured",
      {},
      env,
    );

    expect(result.isError).toBeFalsy();
    expect("structuredContent" in result).toBe(true);
    const viewRes = result as unknown as {
      structuredContent: Record<string, unknown>;
      content: { text: string }[];
    };
    expect(viewRes.structuredContent).toEqual({ win_rate: 0.58, matches: 42 });
    // content carries JSON data for model reasoning
    expect(viewRes.content).toHaveLength(1);
  });

  it("returns plain text for formatted result", async () => {
    const nativeModule: NativeReferenceModule = {
      id: "viz_formatted",
      name: "Viz Formatted",
      description: "Returns formatted content",
      execute: () =>
        Promise.resolve({
          type: "text",
          content: "Rule 702.1: Flying",
        }),
    };
    registerNativeModule("testgame", nativeModule);

    const result = await queryReference(
      env.REFERENCE_PLUGINS,
      "testgame",
      "viz_formatted",
      {},
      env,
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.text).toContain("Rule 702.1: Flying");
  });

  it("falls through when game has native modules but not the requested one", async () => {
    const nativeModule: NativeReferenceModule = {
      id: "module_a",
      name: "Module A",
      description: "A module",
      execute: () => Promise.resolve({ type: "text", content: "A" }),
    };
    registerNativeModule("testgame", nativeModule);

    // Request module_b, which is not registered natively.
    // Should fall through to WfP dispatch (which will fail in tests),
    // then direct the LLM to list_games for discovery.
    const result = await queryReference(env.REFERENCE_PLUGINS, "testgame", "module_b", {}, env);

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('"module_b" not found');
    expect(result.content[0]!.text).toContain('list_games(filter="testgame")');
  });
});

// ── Schema hint on error tests ──────────────────────────────

describe("queryReference schema hint on error", () => {
  beforeEach(() => {
    clearNativeRegistry();
  });

  afterEach(() => {
    clearNativeRegistry();
  });

  it("appends parameter schema when native module returns an error", async () => {
    const moduleWithSchema: NativeReferenceModule = {
      id: "schema_mod",
      name: "Schema Module",
      description: "Module with parameters",
      parameters: {
        build: { type: "string", description: "URL to a build" },
        sections: { type: "string", description: "Sections to include" },
      },
      execute: () => {
        throw new Error("build must be a URL");
      },
    };
    registerNativeModule("testgame", moduleWithSchema);

    const result = await queryReference(env.REFERENCE_PLUGINS, "testgame", "schema_mod", {}, env);

    expect(result.isError).toBe(true);
    const text = result.content[0]!.text;
    expect(text).toContain("build must be a URL");
    expect(text).toContain("This module's actual parameters:");
    expect(text).toContain("build (string): URL to a build");
    expect(text).toContain("sections (string): Sections to include");
  });

  it("does not append schema hint on successful result", async () => {
    const moduleWithSchema: NativeReferenceModule = {
      id: "ok_mod",
      name: "OK Module",
      description: "Returns success",
      parameters: {
        query: { type: "string", description: "Search query" },
      },
      execute: () => Promise.resolve({ type: "text", content: "result: ok" }),
    };
    registerNativeModule("testgame", moduleWithSchema);

    const result = await queryReference(
      env.REFERENCE_PLUGINS,
      "testgame",
      "ok_mod",
      { query: "test" },
      env,
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toBe("result: ok");
    expect(result.content[0]!.text).not.toContain("actual parameters");
  });

  it("does not append schema when module has no parameters", async () => {
    const noParameterModule: NativeReferenceModule = {
      id: "noparam_mod",
      name: "No Params",
      description: "No parameters defined",
      execute: () => {
        throw new Error("something went wrong");
      },
    };
    registerNativeModule("testgame", noParameterModule);

    const result = await queryReference(env.REFERENCE_PLUGINS, "testgame", "noparam_mod", {}, env);

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("something went wrong");
    expect(result.content[0]!.text).not.toContain("actual parameters");
  });
});

// ── getModuleParameters tests ───────────────────────────────

describe("getModuleParameters", () => {
  beforeEach(() => {
    clearNativeRegistry();
  });

  afterEach(() => {
    clearNativeRegistry();
  });

  it("returns parameters for a registered native module", () => {
    const mod: NativeReferenceModule = {
      id: "param_mod",
      name: "Param Module",
      description: "Has params",
      parameters: { q: { type: "string", description: "query" } },
      execute: () => Promise.resolve({ type: "text", content: "" }),
    };
    registerNativeModule("testgame", mod);

    expect(getModuleParameters("testgame", "param_mod")).toEqual({
      q: { type: "string", description: "query" },
    });
  });

  it("returns undefined for unregistered module with no manifest", () => {
    expect(getModuleParameters("nonexistent", "nonexistent")).toBeUndefined();
  });
});
