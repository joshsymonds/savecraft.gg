import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const TEST_USER = "verify-test-user";

describe("Verify API", () => {
  it("returns 200 for valid daemon token", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/verify", {
      headers: { Authorization: `Bearer ${TEST_USER}` },
    });
    expect(resp.status).toBe(200);
    const body = await resp.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });

  it("returns 401 without auth header", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/verify");
    expect(resp.status).toBe(401);
  });

  it("rejects POST method", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_USER}` },
    });
    expect(resp.status).toBe(404);
  });

  it("includes X-Savecraft-Version header", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/verify", {
      headers: { Authorization: `Bearer ${TEST_USER}` },
    });
    expect(resp.headers.get("X-Savecraft-Version")).toBe("dev");
  });
});
