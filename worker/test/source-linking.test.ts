import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, seedSource } from "./helpers";

const TEST_USER = "link-test-user";

describe("Source Linking", () => {
  beforeEach(cleanAll);

  // ── POST /api/v1/source/link (session auth) ───────────────

  describe("POST /api/v1/source/link", () => {
    it("links source to user with valid code", async () => {
      const { sourceUuid } = await seedSource();

      // Get the source's link code
      const source = await env.DB.prepare("SELECT link_code FROM sources WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first<{ link_code: string }>();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/source/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_USER}`,
          },
          body: JSON.stringify({
            code: source!.link_code,
            email: "josh@example.com",
            display_name: "Josh",
          }),
        }),
      );

      expect(resp.status).toBe(200);
      const body = await resp.json<{ source_uuid: string }>();
      expect(body.source_uuid).toBe(sourceUuid);

      // Verify D1 state
      const updated = await env.DB.prepare(
        "SELECT user_uuid, user_email, user_display_name, link_code FROM sources WHERE source_uuid = ?",
      )
        .bind(sourceUuid)
        .first<{
          user_uuid: string;
          user_email: string;
          user_display_name: string;
          link_code: string | null;
        }>();
      expect(updated!.user_uuid).toBe(TEST_USER);
      expect(updated!.user_email).toBe("josh@example.com");
      expect(updated!.user_display_name).toBe("Josh");
      expect(updated!.link_code).toBeNull();
    });

    it("rejects expired code", async () => {
      const { sourceUuid } = await seedSource();

      // Set link code to expired
      await env.DB.prepare(
        "UPDATE sources SET link_code_expires_at = datetime('now', '-1 hour') WHERE source_uuid = ?",
      )
        .bind(sourceUuid)
        .run();

      const source = await env.DB.prepare("SELECT link_code FROM sources WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first<{ link_code: string }>();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/source/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_USER}`,
          },
          body: JSON.stringify({ code: source!.link_code }),
        }),
      );

      expect(resp.status).toBe(404);
    });

    it("rejects wrong code", async () => {
      await seedSource();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/source/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_USER}`,
          },
          body: JSON.stringify({ code: "000000" }),
        }),
      );

      expect(resp.status).toBe(404);
    });

    it("re-links source to different user (overwrites)", async () => {
      const { sourceUuid } = await seedSource(TEST_USER);

      // Source is already linked to TEST_USER. Generate a fresh code for re-linking.
      const code = "654321";
      await env.DB.prepare(
        "UPDATE sources SET link_code = ?, link_code_expires_at = datetime('now', '+20 minutes') WHERE source_uuid = ?",
      )
        .bind(code, sourceUuid)
        .run();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/source/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer other-user",
          },
          body: JSON.stringify({
            code,
            email: "other@example.com",
            display_name: "Other",
          }),
        }),
      );

      expect(resp.status).toBe(200);

      const updated = await env.DB.prepare(
        "SELECT user_uuid, user_email FROM sources WHERE source_uuid = ?",
      )
        .bind(sourceUuid)
        .first<{ user_uuid: string; user_email: string }>();
      expect(updated!.user_uuid).toBe("other-user");
      expect(updated!.user_email).toBe("other@example.com");
    });

    it("clears link code after successful link", async () => {
      const { sourceUuid } = await seedSource();

      const source = await env.DB.prepare("SELECT link_code FROM sources WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first<{ link_code: string }>();

      await SELF.fetch(
        new Request("https://test-host/api/v1/source/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_USER}`,
          },
          body: JSON.stringify({ code: source!.link_code }),
        }),
      );

      // Trying same code again should fail
      const resp2 = await SELF.fetch(
        new Request("https://test-host/api/v1/source/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_USER}`,
          },
          body: JSON.stringify({ code: source!.link_code }),
        }),
      );

      expect(resp2.status).toBe(404);
    });

    it("requires session auth", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/source/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "123456" }),
        }),
      );

      expect(resp.status).toBe(401);
    });
  });
});
