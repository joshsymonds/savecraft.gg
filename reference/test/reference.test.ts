import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function query(body: string): Promise<Response> {
  return SELF.fetch("https://internal/query", {
    method: "POST",
    body,
  });
}

// These tests verify the reference Worker infrastructure (WASI shim, HTTP handler,
// ndjson contract) using whichever plugin wasm is in reference.wasm. The specific
// plugin doesn't matter — we're testing the plumbing, not game logic.
describe("Reference Worker Infrastructure", () => {
  it("returns schema on empty query", async () => {
    const response = await query("{}");
    expect(response.status).toBe(200);

    const text = await response.text();
    const parsed = JSON.parse(text.trim()) as {
      type: string;
      data: { modules: Array<{ id: string; name: string; parameters: Record<string, unknown> }> };
    };
    expect(parsed.type).toBe("result");
    expect(parsed.data.modules).toBeInstanceOf(Array);
    expect(parsed.data.modules.length).toBeGreaterThan(0);

    // Every module must have id, name, and parameters
    for (const mod of parsed.data.modules) {
      expect(mod.id).toBeTruthy();
      expect(mod.name).toBeTruthy();
      expect(mod.parameters).toBeTruthy();
    }
  });

  it("returns valid ndjson with type field", async () => {
    const response = await query("{}");
    expect(response.status).toBe(200);

    const text = await response.text();
    const lines = text
      .trim()
      .split("\n")
      .filter((l: string) => l.length > 0);

    // Schema is always a single line
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as { type: string };
    expect(parsed.type).toBe("result");
  });

  it("returns 422 with error type on invalid JSON", async () => {
    const response = await query("not json");
    expect(response.status).toBe(422);

    const text = await response.text();
    const parsed = JSON.parse(text.trim()) as {
      type: string;
      errorType: string;
      message: string;
    };
    expect(parsed.type).toBe("error");
    expect(parsed.errorType).toBeTruthy();
    expect(parsed.message).toBeTruthy();
  });

  it("returns 422 with error for unknown module", async () => {
    const input = JSON.stringify({ module: "nonexistent_module_xyz" });
    const response = await query(input);
    expect(response.status).toBe(422);

    const text = await response.text();
    const parsed = JSON.parse(text.trim()) as {
      type: string;
      errorType: string;
      message: string;
    };
    expect(parsed.type).toBe("error");
    expect(parsed.message).toContain("unknown");
  });

  it("returns formatted result for a valid query", async () => {
    // Discover the first module and its parameters from the schema
    const schemaResp = await query("{}");
    const schemaText = await schemaResp.text();
    const schema = JSON.parse(schemaText.trim()) as {
      data: { modules: Array<{ id: string; parameters: Record<string, { type: string }> }> };
    };
    const mod = schema.data.modules[0]!;

    // Build a minimal query using the first string parameter
    const queryObj: Record<string, string> = { module: mod.id };
    for (const [key, param] of Object.entries(mod.parameters)) {
      if (param.type === "string") {
        queryObj[key] = "test_value";
        break;
      }
    }

    const response = await query(JSON.stringify(queryObj));
    // Should get either a successful result or a domain error (not a crash)
    expect([200, 422]).toContain(response.status);

    const text = await response.text();
    const parsed = JSON.parse(text.trim()) as { type: string };
    expect(["result", "error"]).toContain(parsed.type);
  });

  it("rejects non-POST requests", async () => {
    const response = await SELF.fetch("https://internal/query");
    expect(response.status).toBe(405);
  });
});
