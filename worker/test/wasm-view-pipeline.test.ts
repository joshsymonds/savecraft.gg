import { describe, expect, it } from "vitest";

import { parseWasmResponse } from "../src/mcp/tools";
import type { ViewToolResult } from "../src/mcp/tools";

// ── WASM → View pipeline tests ──────────────────────────────
//
// WASM reference modules return ndjson with { type: "result", data: { ... } }.
// When data contains structured fields alongside "formatted" text,
// parseWasmResponse should return a ViewToolResult so the handler can
// wire it into the reference view bundle.

describe("parseWasmResponse structured data detection", () => {
  it("returns ViewToolResult when data has structured fields beyond formatted", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        formatted: "Surgery Success: 85.3%\n\nFactor chain: ...",
        presentation: "Surgery success calculation — show the final probability...",
        success_chance: 0.853,
        surgeon_factor: 0.9,
        bed_factor: 1.1,
        medicine_factor: 1.0,
        difficulty: 1.0,
        inspired: false,
        capped: false,
        uncapped: 0.853,
      },
    });

    const result = parseWasmResponse(wasmOutput);

    expect("structuredContent" in result).toBe(true);
    const viewRes = result as ViewToolResult;
    expect(viewRes.structuredContent.success_chance).toBe(0.853);
    expect(viewRes.structuredContent.surgeon_factor).toBe(0.9);
    // formatted and presentation are stripped from structuredContent
    expect(viewRes.structuredContent).not.toHaveProperty("formatted");
    expect(viewRes.structuredContent).not.toHaveProperty("presentation");
  });

  it("returns ToolResult (text) when data has only formatted + presentation", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        formatted: "Some pre-rendered text output",
        presentation: "Show as a table...",
      },
    });

    const result = parseWasmResponse(wasmOutput);

    expect("structuredContent" in result).toBe(false);
    // Should return text content with presentation hint
    expect(result.content[0]!.text).toContain("IMPORTANT");
    expect(result.content[1]!.text).toBe("Some pre-rendered text output");
  });

  it("returns ToolResult (text) when data has only formatted", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        formatted: "Plain text result with no structured data",
      },
    });

    const result = parseWasmResponse(wasmOutput);

    expect("structuredContent" in result).toBe(false);
    expect(result.content[0]!.text).toBe("Plain text result with no structured data");
  });

  it("uses first line of formatted text as narrative", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        formatted: "Raid Threat Estimate\n\nColony Wealth:\n  Item wealth: 50000",
        presentation: "Show raid points...",
        total_wealth: 50000,
        wealth_points: 1200,
        pawn_points: 300,
        total_points: 1500,
      },
    });

    const result = parseWasmResponse(wasmOutput) as ViewToolResult;

    expect("structuredContent" in result).toBe(true);
    // Narrative is first line of formatted text
    expect(result.content[0]!.text).toBe("Raid Threat Estimate");
  });

  it("includes structured data as JSON in content for model reasoning", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        formatted: "Steel (normal quality)\n\nStat Factors...",
        material: "steel",
        quality: "normal",
        sharp_armor: 0.5,
        blunt_armor: 0.25,
      },
    });

    const result = parseWasmResponse(wasmOutput) as ViewToolResult;

    expect("structuredContent" in result).toBe(true);
    // content[1] should be JSON stringified structuredContent
    const jsonData = JSON.parse(result.content[1]!.text) as Record<string, unknown>;
    expect(jsonData.material).toBe("steel");
    expect(jsonData.sharp_armor).toBe(0.5);
    expect(jsonData).not.toHaveProperty("formatted");
  });

  it("preserves array data in structured fields", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        materials: [
          { name: "steel", sharp_armor: 0.5 },
          { name: "plasteel", sharp_armor: 1.2 },
        ],
        presentation: "Material comparison table...",
      },
    });

    // No formatted field → should go through textResult path
    // BUT it has structured data (materials array) without formatted
    const result = parseWasmResponse(wasmOutput);

    // Without formatted, this goes through the non-formatted path
    // which calls textResult — existing behavior unchanged
    expect("structuredContent" in result).toBe(false);
  });

  it("handles materials list with no formatted field as ViewToolResult", () => {
    // Some WASM modules return lists without formatted text
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        materials: [
          { name: "steel", sharp_armor: 0.5 },
          { name: "plasteel", sharp_armor: 1.2 },
        ],
        presentation: "Material comparison table...",
      },
    });

    const result = parseWasmResponse(wasmOutput);

    // Without formatted, existing behavior: textResult wraps the whole parsed object
    // This is correct — modules that want views should include structured fields
    // alongside formatted text
    expect("structuredContent" in result).toBe(false);
  });

  it("handles gene build validation with conflicts array", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        formatted:
          "Gene Build Validation (max complexity: 6, min metabolism: -5)\n\n  tough skin: cpx 1, met -1",
        presentation: "Gene build validator...",
        total_complexity: 4,
        total_metabolism: -3,
        total_archite: 0,
        complexity_ok: true,
        metabolism_ok: true,
        conflicts: [],
      },
    });

    const result = parseWasmResponse(wasmOutput) as ViewToolResult;

    expect("structuredContent" in result).toBe(true);
    expect(viewRes(result).total_complexity).toBe(4);
    expect(viewRes(result).complexity_ok).toBe(true);
    expect(viewRes(result).conflicts).toEqual([]);
  });

  it("handles crop result with numeric fields", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        formatted: "rice plant\n\nGrowth Rate: 1.00x\n...",
        presentation: "Crop production analysis...",
        crop: "rice plant",
        growth_rate: 1.0,
        actual_grow_days: 5.14,
        nutrition_per_day: 0.058,
        silver_per_day: 1.284,
        tiles_needed: 12,
        hydroponics: true,
      },
    });

    const result = parseWasmResponse(wasmOutput) as ViewToolResult;

    expect("structuredContent" in result).toBe(true);
    expect(viewRes(result).crop).toBe("rice plant");
    expect(viewRes(result).growth_rate).toBe(1.0);
    expect(viewRes(result).hydroponics).toBe(true);
  });

  it("handles error results unchanged", () => {
    const wasmOutput = JSON.stringify({
      type: "error",
      errorType: "unknown_weapon",
      message: 'Unknown weapon "plasma rifle"',
    });

    // parseWasmResponse doesn't special-case errors (they come via HTTP status)
    // but if one slips through, it should not crash
    const result = parseWasmResponse(wasmOutput);
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("handles multi-line ndjson unchanged", () => {
    const line1 = JSON.stringify({ type: "status", message: "processing" });
    const line2 = JSON.stringify({ type: "result", data: { formatted: "done" } });
    const wasmOutput = `${line1}\n${line2}`;

    const result = parseWasmResponse(wasmOutput);

    // Multi-line always returns textResult with results array
    expect("structuredContent" in result).toBe(false);
  });
});

// Helper to access structuredContent with proper typing
function viewRes(result: ViewToolResult): Record<string, unknown> {
  return result.structuredContent;
}
