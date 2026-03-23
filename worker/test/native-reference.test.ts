import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearNativeRegistry,
  getNativeModule,
  getNativeModules,
  registerNativeModule,
} from "../src/reference/registry";
import type { NativeReferenceModule } from "../src/reference/types";
import { queryReference } from "../src/mcp/tools";

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
    execute: async () => ({ type: "formatted", content: "hello from native" }),
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
      execute: async (query) => ({
        type: "formatted",
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
      execute: async () => ({
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
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed).toEqual({ cards: ["Lightning Bolt"], count: 1 });
  });

  it("returns error when native module throws", async () => {
    const failingModule: NativeReferenceModule = {
      id: "failing_mod",
      name: "Failing Module",
      description: "Always fails",
      execute: async () => {
        throw new Error("database connection failed");
      },
    };
    registerNativeModule("testgame", failingModule);

    const result = await queryReference(
      env.REFERENCE_PLUGINS,
      "testgame",
      "failing_mod",
      {},
      env,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("database connection failed");
  });

  it("falls through to WfP dispatch when module is not native", async () => {
    // No native module registered for "unknown_game".
    // WfP dispatch will also fail (no Worker deployed), but we verify the
    // error comes from the WfP path, not native routing.
    const result = await queryReference(
      env.REFERENCE_PLUGINS,
      "unknown_game",
      "some_module",
      {},
      env,
    );

    expect(result.isError).toBe(true);
    // WfP dispatch error message pattern
    expect(result.content[0]!.text).toMatch(/reference module/i);
  });

  it("falls through when game has native modules but not the requested one", async () => {
    const nativeModule: NativeReferenceModule = {
      id: "module_a",
      name: "Module A",
      description: "A module",
      execute: async () => ({ type: "formatted", content: "A" }),
    };
    registerNativeModule("testgame", nativeModule);

    // Request module_b, which is not registered natively.
    // Should fall through to WfP dispatch (which will fail in tests).
    const result = await queryReference(
      env.REFERENCE_PLUGINS,
      "testgame",
      "module_b",
      {},
      env,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/reference module/i);
  });
});
