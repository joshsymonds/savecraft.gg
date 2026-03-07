import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, seedSource } from "./helpers";

describe("Source Token Authentication", () => {
  beforeEach(cleanAll);

  it("authenticates a registered source via verify endpoint", async () => {
    const { sourceUuid, sourceToken } = await seedSource();

    const resp = await SELF.fetch("https://test-host/api/v1/source/verify", {
      headers: { Authorization: `Bearer ${sourceToken}` },
    });
    expect(resp.status).toBe(200);

    const body = await resp.json<{ status: string; source_uuid: string }>();
    expect(body.status).toBe("ok");
    expect(body.source_uuid).toBe(sourceUuid);
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
    const { sourceToken } = await seedSource();

    const resp = await SELF.fetch("https://test-host/api/v1/source/verify", {
      headers: { Authorization: `Bearer ${sourceToken}` },
    });
    const body = await resp.json<{ user_uuid: string | null }>();
    expect(body.user_uuid).toBeNull();
  });

  it("returns userUuid for linked source", async () => {
    const { sourceUuid, sourceToken } = await seedSource();
    const testUserUuid = "linked-user-123";

    // Simulate linking by updating the source row directly
    await env.DB.prepare("UPDATE sources SET user_uuid = ? WHERE source_uuid = ?")
      .bind(testUserUuid, sourceUuid)
      .run();

    const resp = await SELF.fetch("https://test-host/api/v1/source/verify", {
      headers: { Authorization: `Bearer ${sourceToken}` },
    });
    const body = await resp.json<{ user_uuid: string | null }>();
    expect(body.user_uuid).toBe(testUserUuid);
  });
});
