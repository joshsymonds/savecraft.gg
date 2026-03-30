import { describe, expect, it } from "vitest";

import { parseWasmResponse } from "../src/mcp/tools";
import type { ViewToolResult } from "../src/mcp/tools";

// ── WASM → View pipeline tests ──────────────────────────────
//
// WASM reference modules return ndjson with { type: "result", data: { ... } }.
// When data is a non-null object, parseWasmResponse returns a ViewToolResult
// with data as structuredContent. The same data is JSON-stringified in
// content[0] so the model can reason about it.

describe("parseWasmResponse structured data detection", () => {
  it("returns ViewToolResult when data has structured fields", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        success_chance: 0.853,
        surgeon_factor: 0.9,
        bed_factor: 1.1,
        medicine_factor: 1,
        difficulty: 1,
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
  });

  it("includes structured data as JSON in content for model reasoning", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        material: "steel",
        quality: "normal",
        sharp_armor: 0.5,
        blunt_armor: 0.25,
      },
    });

    const result = parseWasmResponse(wasmOutput) as ViewToolResult;

    expect("structuredContent" in result).toBe(true);
    // content[0] is JSON stringified structuredContent
    const jsonData = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(jsonData.material).toBe("steel");
    expect(jsonData.sharp_armor).toBe(0.5);
  });

  it("preserves array data in structured fields", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
        materials: [
          { name: "steel", sharp_armor: 0.5 },
          { name: "plasteel", sharp_armor: 1.2 },
        ],
      },
    });

    const result = parseWasmResponse(wasmOutput) as ViewToolResult;

    expect("structuredContent" in result).toBe(true);
    expect(viewRes(result).materials).toEqual([
      { name: "steel", sharp_armor: 0.5 },
      { name: "plasteel", sharp_armor: 1.2 },
    ]);
  });

  it("handles gene build validation with conflicts array", () => {
    const wasmOutput = JSON.stringify({
      type: "result",
      data: {
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
        crop: "rice plant",
        growth_rate: 1,
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
    expect(viewRes(result).growth_rate).toBe(1);
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
    const line2 = JSON.stringify({ type: "result", data: { value: "done" } });
    const wasmOutput = `${line1}\n${line2}`;

    const result = parseWasmResponse(wasmOutput);

    // Multi-line always returns textResult with results array
    expect("structuredContent" in result).toBe(false);
  });

  it("falls through to textResult for non-result types", () => {
    const wasmOutput = JSON.stringify({ type: "status", message: "processing" });

    const result = parseWasmResponse(wasmOutput);

    expect("structuredContent" in result).toBe(false);
  });

  it("falls through to textResult when data is not an object", () => {
    const wasmOutput = JSON.stringify({ type: "result", data: "just a string" });

    const result = parseWasmResponse(wasmOutput);

    expect("structuredContent" in result).toBe(false);
  });
});

// Helper to access structuredContent with proper typing
function viewRes(result: ViewToolResult): Record<string, unknown> {
  return result.structuredContent;
}
