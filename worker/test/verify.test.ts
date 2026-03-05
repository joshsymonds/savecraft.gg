import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

interface RegisterResponse {
  source_uuid: string;
  source_token: string;
  link_code: string;
  link_code_expires_at: string;
}

async function registerSource(): Promise<RegisterResponse> {
  const resp = await SELF.fetch(
    new Request("https://test-host/api/v1/source/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostname: "verify-test-pc" }),
    }),
  );
  return resp.json<RegisterResponse>();
}

describe("Verify API", () => {
  beforeEach(cleanAll);

  it("returns 200 for valid source token", async () => {
    const source = await registerSource();
    const resp = await SELF.fetch("https://test-host/api/v1/verify", {
      headers: { Authorization: `Bearer ${source.source_token}` },
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
    const source = await registerSource();
    const resp = await SELF.fetch("https://test-host/api/v1/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${source.source_token}` },
    });
    expect(resp.status).toBe(404);
  });

  it("includes X-Savecraft-Version header", async () => {
    const source = await registerSource();
    const resp = await SELF.fetch("https://test-host/api/v1/verify", {
      headers: { Authorization: `Bearer ${source.source_token}` },
    });
    expect(resp.headers.get("X-Savecraft-Version")).toBe("dev");
  });
});
