import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function query(body: string): Promise<Response> {
  return SELF.fetch("https://internal/query", {
    method: "POST",
    body,
  });
}

describe("D2R Reference Worker", () => {
  it("returns schema on empty query", async () => {
    const response = await query("{}");
    expect(response.status).toBe(200);

    const text = await response.text();
    const parsed = JSON.parse(text.trim()) as {
      type: string;
      data: { modules: Array<{ id: string; name: string }> };
    };
    expect(parsed.type).toBe("result");
    expect(parsed.data.modules).toBeInstanceOf(Array);
    expect(parsed.data.modules[0]!.id).toBe("drop_calc");
    expect(parsed.data.modules[0]!.name).toBe("Drop Calculator");
  });

  it("echoes non-empty query", async () => {
    const input = JSON.stringify({ module: "drop_calc", monster: "Mephisto" });
    const response = await query(input);
    expect(response.status).toBe(200);

    const text = await response.text();
    const parsed = JSON.parse(text.trim()) as {
      type: string;
      data: { echo: { module: string; monster: string } };
    };
    expect(parsed.type).toBe("result");
    expect(parsed.data.echo.module).toBe("drop_calc");
    expect(parsed.data.echo.monster).toBe("Mephisto");
  });

  it("returns error on invalid JSON input", async () => {
    const response = await query("not json");
    expect(response.status).toBe(422);

    const text = await response.text();
    const parsed = JSON.parse(text.trim()) as {
      type: string;
      errorType: string;
      message: string;
    };
    expect(parsed.type).toBe("error");
    expect(parsed.errorType).toBe("parse_error");
    expect(parsed.message).toContain("invalid");
  });

  it("captures ndjson output as single line", async () => {
    const response = await query("{}");
    expect(response.status).toBe(200);

    const text = await response.text();
    const lines = text
      .trim()
      .split("\n")
      .filter((l: string) => l.length > 0);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as { type: string };
    expect(parsed.type).toBe("result");
  });

  it("rejects non-POST requests", async () => {
    const response = await SELF.fetch("https://internal/query");
    expect(response.status).toBe(405);
  });
});
