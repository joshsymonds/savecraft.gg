import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, seedSource } from "./helpers";

const TEST_USER = "unlink-test-user";

describe("Source Unlinking", () => {
  beforeEach(cleanAll);

  describe("POST /api/v1/source/unlink", () => {
    it("unlinks a linked source and returns new link code", async () => {
      const { sourceUuid, sourceToken } = await seedSource(TEST_USER);

      // Verify source is linked
      const before = await env.DB.prepare(
        "SELECT user_uuid, user_email, user_display_name FROM sources WHERE source_uuid = ?",
      )
        .bind(sourceUuid)
        .first<{
          user_uuid: string | null;
          user_email: string | null;
          user_display_name: string | null;
        }>();
      expect(before!.user_uuid).toBe(TEST_USER);

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/source/unlink", {
          method: "POST",
          headers: { Authorization: `Bearer ${sourceToken}` },
        }),
      );

      expect(resp.status).toBe(200);
      const body = await resp.json<{ link_code: string; link_code_expires_at: string }>();
      expect(body.link_code).toMatch(/^\d{6}$/);
      expect(body.link_code_expires_at).toBeTruthy();

      // Verify TTL is ~20 minutes
      const expiresAt = new Date(body.link_code_expires_at).getTime();
      const diffMinutes = (expiresAt - Date.now()) / 60_000;
      expect(diffMinutes).toBeGreaterThan(19);
      expect(diffMinutes).toBeLessThanOrEqual(20);

      // Verify D1 state: user cleared, link code set
      const after = await env.DB.prepare(
        "SELECT user_uuid, user_email, user_display_name, link_code, link_code_expires_at FROM sources WHERE source_uuid = ?",
      )
        .bind(sourceUuid)
        .first<{
          user_uuid: string | null;
          user_email: string | null;
          user_display_name: string | null;
          link_code: string | null;
          link_code_expires_at: string | null;
        }>();
      expect(after!.user_uuid).toBeNull();
      expect(after!.user_email).toBeNull();
      expect(after!.user_display_name).toBeNull();
      expect(after!.link_code).toBe(body.link_code);
      expect(after!.link_code_expires_at).toBeTruthy();
    });

    it("works on already-unlinked source (idempotent)", async () => {
      const { sourceUuid, sourceToken } = await seedSource(); // no user

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/source/unlink", {
          method: "POST",
          headers: { Authorization: `Bearer ${sourceToken}` },
        }),
      );

      expect(resp.status).toBe(200);
      const body = await resp.json<{ link_code: string; link_code_expires_at: string }>();
      expect(body.link_code).toMatch(/^\d{6}$/);

      // Verify D1 state: still unlinked, new code set
      const after = await env.DB.prepare(
        "SELECT user_uuid, link_code FROM sources WHERE source_uuid = ?",
      )
        .bind(sourceUuid)
        .first<{ user_uuid: string | null; link_code: string | null }>();
      expect(after!.user_uuid).toBeNull();
      expect(after!.link_code).toBe(body.link_code);
    });

    it("preserves source identity (uuid and token unchanged)", async () => {
      const { sourceUuid, sourceToken } = await seedSource(TEST_USER);

      const beforeHash = await env.DB.prepare(
        "SELECT token_hash FROM sources WHERE source_uuid = ?",
      )
        .bind(sourceUuid)
        .first<{ token_hash: string }>();

      await SELF.fetch(
        new Request("https://test-host/api/v1/source/unlink", {
          method: "POST",
          headers: { Authorization: `Bearer ${sourceToken}` },
        }),
      );

      // Source UUID still exists with same token hash
      const afterHash = await env.DB.prepare("SELECT token_hash FROM sources WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first<{ token_hash: string }>();
      expect(afterHash!.token_hash).toBe(beforeHash!.token_hash);

      // Token still authenticates
      const verifyResp = await SELF.fetch(
        new Request("https://test-host/api/v1/source/status", {
          headers: { Authorization: `Bearer ${sourceToken}` },
        }),
      );
      expect(verifyResp.status).toBe(200);
    });

    it("requires source auth", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/source/unlink", {
          method: "POST",
        }),
      );

      expect(resp.status).toBe(401);
    });
  });
});
