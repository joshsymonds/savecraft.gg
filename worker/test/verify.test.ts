import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, seedSource } from "./helpers";

describe("Verify API", () => {
  beforeEach(cleanAll);

  it("returns 200 for valid source token", async () => {
    const { sourceToken } = await seedSource();
    const resp = await SELF.fetch("https://test-host/api/v1/verify", {
      headers: { Authorization: `Bearer ${sourceToken}` },
    });
    expect(resp.status).toBe(200);
    const body = await resp.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });

  it("returns 401 without auth header", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/verify");
    expect(resp.status).toBe(401);
  });

  it("returns 401 for invalid token", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/verify", {
      headers: { Authorization: "Bearer sct_bogus_token" },
    });
    expect(resp.status).toBe(401);
  });

  it("rejects POST method", async () => {
    const { sourceToken } = await seedSource();
    const resp = await SELF.fetch("https://test-host/api/v1/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${sourceToken}` },
    });
    expect(resp.status).toBe(404);
  });

  it("includes X-Savecraft-Version header", async () => {
    const { sourceToken } = await seedSource();
    const resp = await SELF.fetch("https://test-host/api/v1/verify", {
      headers: { Authorization: `Bearer ${sourceToken}` },
    });
    expect(resp.headers.get("X-Savecraft-Version")).toBe("dev");
  });
});
