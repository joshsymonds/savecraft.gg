import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, seedPush, seedSource } from "./helpers";

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

  // ── Save reconciliation on link ────────────────────────────

  describe("save reconciliation on link", () => {
    async function linkSource(sourceUuid: string, userUuid: string): Promise<Response> {
      const source = await env.DB.prepare("SELECT link_code FROM sources WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first<{ link_code: string }>();
      return SELF.fetch(
        new Request("https://test-host/api/v1/source/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userUuid}`,
          },
          body: JSON.stringify({ code: source!.link_code }),
        }),
      );
    }

    it("adopts orphan saves when source links to user", async () => {
      const { sourceUuid } = await seedSource(null); // unlinked

      // Seed an orphan save (user_uuid = NULL)
      await seedPush(
        null,
        sourceUuid,
        "d2r",
        "Atmus",
        "Level 89 Paladin",
        new Date().toISOString(),
        {
          stats: { description: "Character stats", data: { level: 89 } },
        },
      );

      // Link the source
      const resp = await linkSource(sourceUuid, TEST_USER);
      expect(resp.status).toBe(200);

      // Orphan save should now belong to the user
      const save = await env.DB.prepare(
        "SELECT user_uuid FROM saves WHERE save_name = 'Atmus' AND game_id = 'd2r'",
      ).first<{ user_uuid: string }>();
      expect(save!.user_uuid).toBe(TEST_USER);
    });

    it("deduplicates: newer orphan replaces older existing save", async () => {
      const { sourceUuid } = await seedSource(null);

      const oldTime = "2025-01-01T00:00:00.000Z";
      const newTime = "2025-06-01T00:00:00.000Z";

      // Existing save for the user (older)
      const existingSaveUuid = await seedPush(
        TEST_USER,
        sourceUuid,
        "d2r",
        "DedupChar",
        "Level 50",
        oldTime,
        { stats: { description: "Stats", data: { level: 50 } } },
      );

      // Orphan save from the source (newer)
      await seedPush(null, sourceUuid, "d2r", "DedupChar", "Level 89", newTime, {
        stats: { description: "Stats", data: { level: 89 } },
      });

      // Link
      const resp = await linkSource(sourceUuid, TEST_USER);
      expect(resp.status).toBe(200);

      // Should have exactly one save for this user+game+name
      const saves = await env.DB.prepare(
        "SELECT uuid, summary FROM saves WHERE user_uuid = ? AND game_id = 'd2r' AND save_name = 'DedupChar'",
      )
        .bind(TEST_USER)
        .all<{ uuid: string; summary: string }>();
      expect(saves.results.length).toBe(1);

      // The newer one (level 89) should win
      expect(saves.results[0]!.summary).toBe("Level 89");
      // Old save should be gone
      expect(saves.results[0]!.uuid).not.toBe(existingSaveUuid);
    });

    it("deduplicates: older orphan is discarded when existing save is newer", async () => {
      const { sourceUuid } = await seedSource(null);

      const oldTime = "2025-01-01T00:00:00.000Z";
      const newTime = "2025-06-01T00:00:00.000Z";

      // Existing save for the user (newer)
      const existingSaveUuid = await seedPush(
        TEST_USER,
        sourceUuid,
        "d2r",
        "DedupChar2",
        "Level 89",
        newTime,
        { stats: { description: "Stats", data: { level: 89 } } },
      );

      // Orphan save from the source (older)
      await seedPush(null, sourceUuid, "d2r", "DedupChar2", "Level 50", oldTime, {
        stats: { description: "Stats", data: { level: 50 } },
      });

      // Link
      const resp = await linkSource(sourceUuid, TEST_USER);
      expect(resp.status).toBe(200);

      // Should have exactly one save — the existing newer one
      const saves = await env.DB.prepare(
        "SELECT uuid, summary FROM saves WHERE user_uuid = ? AND game_id = 'd2r' AND save_name = 'DedupChar2'",
      )
        .bind(TEST_USER)
        .all<{ uuid: string; summary: string }>();
      expect(saves.results.length).toBe(1);
      expect(saves.results[0]!.uuid).toBe(existingSaveUuid);
      expect(saves.results[0]!.summary).toBe("Level 89");
    });
  });
});
