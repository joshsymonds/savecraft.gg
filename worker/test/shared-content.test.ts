/**
 * Unit tests for shared/content/* composer functions.
 *
 * The MCP `setup_help` integration tests in mcp-tools.test.ts cover the
 * worker handler end-to-end with generic substring assertions ("open
 * source", "curl", "Steam Workshop"). They do NOT exercise the composer
 * dispatch logic directly — `blurbForDbSourceKind`'s "daemon" / "wasm"
 * and "adapter" / "api" alias fall-through, the `" Additionally: "`
 * join when a game has multiple sources, the dynamic source-kind
 * layer count in the about blob, or the storage-layer rendering helper.
 * These tests target that dispatch behavior directly so a regression in
 * the mapping cannot pass through unnoticed.
 */

import { aboutTextForMcp, SOURCE_KIND_ORDER } from "@savecraft/content/about";
import { SOURCE_KINDS, STORAGE_LAYERS } from "@savecraft/content/facts";
import { privacyTextForMcp } from "@savecraft/content/privacy";
import { sourceSetupBlurbForMcp } from "@savecraft/content/setup";
import { describe, expect, it } from "vitest";

describe("sourceSetupBlurbForMcp (DB-kind dispatch)", () => {
  it("maps 'daemon' to the wasm setupBlurb", () => {
    expect(sourceSetupBlurbForMcp(["daemon"])).toBe(SOURCE_KINDS.wasm.setupBlurb);
  });

  it("maps 'wasm' to the wasm setupBlurb (alias)", () => {
    expect(sourceSetupBlurbForMcp(["wasm"])).toBe(SOURCE_KINDS.wasm.setupBlurb);
  });

  it("maps 'adapter' to the api setupBlurb", () => {
    expect(sourceSetupBlurbForMcp(["adapter"])).toBe(SOURCE_KINDS.api.setupBlurb);
  });

  it("maps 'api' to the api setupBlurb (alias)", () => {
    expect(sourceSetupBlurbForMcp(["api"])).toBe(SOURCE_KINDS.api.setupBlurb);
  });

  it("includes both mod flavors when given 'mod'", () => {
    const blurb = sourceSetupBlurbForMcp(["mod"]);
    expect(blurb).toContain("Steam Workshop");
    expect(blurb).toContain("Factorio");
  });

  it("joins multi-source blurbs with ' Additionally: '", () => {
    const blurb = sourceSetupBlurbForMcp(["wasm", "adapter"]);
    expect(blurb).toContain(" Additionally: ");
    expect(blurb).toContain(SOURCE_KINDS.wasm.setupBlurb);
    expect(blurb).toContain(SOURCE_KINDS.api.setupBlurb);
  });

  it("falls back to wasm.setupBlurb when no source matches", () => {
    expect(sourceSetupBlurbForMcp(["unknown-future-kind"])).toBe(SOURCE_KINDS.wasm.setupBlurb);
  });

  it("ignores unknown source kinds when mixed with known ones", () => {
    const blurb = sourceSetupBlurbForMcp(["wasm", "unknown"]);
    expect(blurb).toBe(SOURCE_KINDS.wasm.setupBlurb);
  });
});

describe("aboutTextForMcp (dynamic layer count)", () => {
  it("uses SOURCE_KIND_ORDER.length for the layer count", () => {
    const text = aboutTextForMcp();
    expect(text).toContain(`${String(SOURCE_KIND_ORDER.length)} ways games connect`);
  });

  it("mentions every source kind label by name", () => {
    const text = aboutTextForMcp();
    for (const id of SOURCE_KIND_ORDER) {
      expect(text).toContain(SOURCE_KINDS[id].label);
    }
  });

  it("includes the Apache 2.0 license name (not source-available)", () => {
    const text = aboutTextForMcp();
    expect(text).toContain("Apache License 2.0");
    expect(text).not.toContain("Source-available");
  });
});

describe("privacyTextForMcp (storage / logging / security composition)", () => {
  it("renders every STORAGE_LAYERS key with its display name", () => {
    const text = privacyTextForMcp();
    // D1 / R2 / KV / Durable Objects (not DURABLEOBJECTS — verifies LAYER_NAMES is in use)
    expect(text).toContain("D1 stores");
    expect(text).toContain("R2 stores");
    expect(text).toContain("KV stores");
    expect(text).toContain("Durable Objects stores");
    expect(text).not.toContain("DURABLEOBJECTS");
  });

  it("renders each STORAGE_LAYERS item verbatim", () => {
    const text = privacyTextForMcp();
    for (const items of Object.values(STORAGE_LAYERS)) {
      for (const item of items as readonly string[]) {
        expect(text).toContain(item);
      }
    }
  });

  it("discloses mcp_tool_calls 90-day retention", () => {
    const text = privacyTextForMcp();
    expect(text).toContain("90 days");
    expect(text).toContain("MCP tool calls");
  });

  it("discloses source IP rate-limiting", () => {
    const text = privacyTextForMcp();
    expect(text).toContain("requesting IP");
    expect(text).toMatch(/per IP/i);
  });

  it("returns the same string on repeated calls (memoization safety)", () => {
    expect(privacyTextForMcp()).toBe(privacyTextForMcp());
  });
});
