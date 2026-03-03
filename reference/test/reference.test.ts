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

  it("computes drop probabilities for a monster", async () => {
    const input = JSON.stringify({ module: "drop_calc", monster: "mephisto", difficulty: "hell" });
    const response = await query(input);
    expect(response.status).toBe(200);

    const text = await response.text();
    const lines = text
      .trim()
      .split("\n")
      .filter((l: string) => l.length > 0);
    expect(lines.length).toBeGreaterThan(10);

    const first = JSON.parse(lines[0]!) as {
      type: string;
      data: { code: string; name: string; base_prob: number; quality: { unique: number } };
    };
    expect(first.type).toBe("result");
    expect(first.data.code).toBeTruthy();
    expect(first.data.base_prob).toBeGreaterThan(0);
    expect(first.data.quality.unique).toBeGreaterThan(0);
  });

  it("finds item sources via reverse lookup", async () => {
    const input = JSON.stringify({
      module: "drop_calc",
      item: "r13",
      difficulty: "hell",
      boss_only: true,
    });
    const response = await query(input);
    expect(response.status).toBe(200);

    const text = await response.text();
    const lines = text
      .trim()
      .split("\n")
      .filter((l: string) => l.length > 0);
    expect(lines.length).toBeGreaterThan(0);

    const first = JSON.parse(lines[0]!) as {
      type: string;
      data: { monster_id: string; is_boss: boolean; base_prob: number };
    };
    expect(first.type).toBe("result");
    expect(first.data.is_boss).toBe(true);
    expect(first.data.base_prob).toBeGreaterThan(0);
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

  it("returns error for unknown item", async () => {
    const input = JSON.stringify({ module: "drop_calc", item: "nonexistent_item_xyz" });
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

  it("captures ndjson output as single line for schema", async () => {
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
