import { env, SELF } from "cloudflare:test";
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
      body: JSON.stringify({ hostname: "test-pc", os: "linux", arch: "amd64" }),
    }),
  );
  return resp.json<RegisterResponse>();
}

describe("Source Token Authentication", () => {
  beforeEach(cleanAll);

  it("authenticates a registered source via verify endpoint", async () => {
    const source = await registerSource();

    const resp = await SELF.fetch("https://test-host/api/v1/source/verify", {
      headers: { Authorization: `Bearer ${source.source_token}` },
    });
    expect(resp.status).toBe(200);

    const body = await resp.json<{ status: string; source_uuid: string }>();
    expect(body.status).toBe("ok");
    expect(body.source_uuid).toBe(source.source_uuid);
  });

  it("rejects invalid source token", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/source/verify", {
      headers: { Authorization: "Bearer sct_invalid_token_here" },
    });
    expect(resp.status).toBe(401);
  });

  it("rejects missing auth header", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/source/verify");
    expect(resp.status).toBe(401);
  });

  it("returns null userUuid for unlinked source", async () => {
    const source = await registerSource();

    const resp = await SELF.fetch("https://test-host/api/v1/source/verify", {
      headers: { Authorization: `Bearer ${source.source_token}` },
    });
    const body = await resp.json<{ user_uuid: string | null }>();
    expect(body.user_uuid).toBeNull();
  });

  it("returns userUuid for linked source", async () => {
    const source = await registerSource();
    const testUserUuid = "linked-user-123";

    // Simulate linking by updating the source row directly
    await env.DB.prepare("UPDATE sources SET user_uuid = ? WHERE source_uuid = ?")
      .bind(testUserUuid, source.source_uuid)
      .run();

    const resp = await SELF.fetch("https://test-host/api/v1/source/verify", {
      headers: { Authorization: `Bearer ${source.source_token}` },
    });
    const body = await resp.json<{ user_uuid: string | null }>();
    expect(body.user_uuid).toBe(testUserUuid);
  });
});
