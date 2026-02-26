import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("Health check", () => {
  it("returns ok", async () => {
    const resp = await SELF.fetch("https://test-host/health");
    expect(resp.status).toBe(200);
    const body = await resp.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });

  it("returns 404 for unknown routes", async () => {
    const resp = await SELF.fetch("https://test-host/nonexistent");
    expect(resp.status).toBe(404);
  });
});
