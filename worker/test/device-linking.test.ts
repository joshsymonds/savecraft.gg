import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, seedDevice } from "./helpers";

const TEST_USER = "link-test-user";

describe("Device Linking", () => {
  beforeEach(cleanAll);

  // ── POST /api/v1/device/link (session auth) ───────────────

  describe("POST /api/v1/device/link", () => {
    it("links device to user with valid code", async () => {
      const { deviceUuid } = await seedDevice();

      // Get the device's link code
      const device = await env.DB.prepare(
        "SELECT link_code FROM devices WHERE device_uuid = ?",
      )
        .bind(deviceUuid)
        .first<{ link_code: string }>();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_USER}`,
          },
          body: JSON.stringify({
            code: device!.link_code,
            email: "josh@example.com",
            display_name: "Josh",
          }),
        }),
      );

      expect(resp.status).toBe(200);
      const body = await resp.json<{ device_uuid: string }>();
      expect(body.device_uuid).toBe(deviceUuid);

      // Verify D1 state
      const updated = await env.DB.prepare(
        "SELECT user_uuid, user_email, user_display_name, link_code FROM devices WHERE device_uuid = ?",
      )
        .bind(deviceUuid)
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
      const { deviceUuid } = await seedDevice();

      // Set link code to expired
      await env.DB.prepare(
        "UPDATE devices SET link_code_expires_at = datetime('now', '-1 hour') WHERE device_uuid = ?",
      )
        .bind(deviceUuid)
        .run();

      const device = await env.DB.prepare(
        "SELECT link_code FROM devices WHERE device_uuid = ?",
      )
        .bind(deviceUuid)
        .first<{ link_code: string }>();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_USER}`,
          },
          body: JSON.stringify({ code: device!.link_code }),
        }),
      );

      expect(resp.status).toBe(404);
    });

    it("rejects wrong code", async () => {
      await seedDevice();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/link", {
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

    it("re-links device to different user (overwrites)", async () => {
      const { deviceUuid } = await seedDevice(TEST_USER);

      // Device is already linked to TEST_USER. Generate a fresh code for re-linking.
      const code = "654321";
      await env.DB.prepare(
        "UPDATE devices SET link_code = ?, link_code_expires_at = datetime('now', '+20 minutes') WHERE device_uuid = ?",
      )
        .bind(code, deviceUuid)
        .run();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/link", {
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
        "SELECT user_uuid, user_email FROM devices WHERE device_uuid = ?",
      )
        .bind(deviceUuid)
        .first<{ user_uuid: string; user_email: string }>();
      expect(updated!.user_uuid).toBe("other-user");
      expect(updated!.user_email).toBe("other@example.com");
    });

    it("clears link code after successful link", async () => {
      const { deviceUuid } = await seedDevice();

      const device = await env.DB.prepare(
        "SELECT link_code FROM devices WHERE device_uuid = ?",
      )
        .bind(deviceUuid)
        .first<{ link_code: string }>();

      await SELF.fetch(
        new Request("https://test-host/api/v1/device/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_USER}`,
          },
          body: JSON.stringify({ code: device!.link_code }),
        }),
      );

      // Trying same code again should fail
      const resp2 = await SELF.fetch(
        new Request("https://test-host/api/v1/device/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_USER}`,
          },
          body: JSON.stringify({ code: device!.link_code }),
        }),
      );

      expect(resp2.status).toBe(404);
    });

    it("requires session auth", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "123456" }),
        }),
      );

      expect(resp.status).toBe(401);
    });
  });

  // ── POST /api/v1/device/link-code (device auth) ───────────

  describe("POST /api/v1/device/link-code", () => {
    it("generates new link code with 20-minute TTL", async () => {
      const { deviceUuid, deviceToken } = await seedDevice();

      // Clear initial link code
      await env.DB.prepare(
        "UPDATE devices SET link_code = NULL, link_code_expires_at = NULL WHERE device_uuid = ?",
      )
        .bind(deviceUuid)
        .run();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/link-code", {
          method: "POST",
          headers: { Authorization: `Bearer ${deviceToken}` },
        }),
      );

      expect(resp.status).toBe(200);
      const body = await resp.json<{ link_code: string; expires_at: string }>();
      expect(body.link_code).toMatch(/^\d{6}$/);
      expect(body.expires_at).toBeTruthy();

      // Verify TTL is ~20 minutes
      const expiresAt = new Date(body.expires_at).getTime();
      const now = Date.now();
      const diffMinutes = (expiresAt - now) / 60_000;
      expect(diffMinutes).toBeGreaterThan(19);
      expect(diffMinutes).toBeLessThanOrEqual(20);

      // Verify persisted in D1
      const device = await env.DB.prepare(
        "SELECT link_code, link_code_expires_at FROM devices WHERE device_uuid = ?",
      )
        .bind(deviceUuid)
        .first<{ link_code: string; link_code_expires_at: string }>();
      expect(device!.link_code).toBe(body.link_code);
    });

    it("overwrites existing link code", async () => {
      const { deviceUuid, deviceToken } = await seedDevice();

      // Verify device already has a link code from seeding before we overwrite it.
      const before = await env.DB.prepare(
        "SELECT link_code FROM devices WHERE device_uuid = ?",
      )
        .bind(deviceUuid)
        .first<{ link_code: string }>();
      expect(before!.link_code).toBeTruthy();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/link-code", {
          method: "POST",
          headers: { Authorization: `Bearer ${deviceToken}` },
        }),
      );

      expect(resp.status).toBe(200);
      const body = await resp.json<{ link_code: string }>();
      // New code may or may not differ (random), but D1 should have the new one
      const newDevice = await env.DB.prepare(
        "SELECT link_code FROM devices WHERE device_uuid = ?",
      )
        .bind(deviceUuid)
        .first<{ link_code: string }>();
      expect(newDevice!.link_code).toBe(body.link_code);
    });

    it("requires device auth", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/link-code", {
          method: "POST",
        }),
      );

      expect(resp.status).toBe(401);
    });
  });

  // ── GET /api/v1/device/status (device auth) ────────────────

  describe("GET /api/v1/device/status", () => {
    it("returns linked=false for unlinked device", async () => {
      const { deviceToken } = await seedDevice();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/status", {
          headers: { Authorization: `Bearer ${deviceToken}` },
        }),
      );

      expect(resp.status).toBe(200);
      const body = await resp.json<{
        linked: boolean;
        link_code?: string;
        link_code_expires_at?: string;
      }>();
      expect(body.linked).toBe(false);
      expect(body.link_code).toBeTruthy();
    });

    it("returns linked=true with user info after linking", async () => {
      const { deviceUuid, deviceToken } = await seedDevice();

      // Simulate linking
      await env.DB.prepare(
        "UPDATE devices SET user_uuid = ?, user_email = ?, user_display_name = ?, link_code = NULL WHERE device_uuid = ?",
      )
        .bind(TEST_USER, "josh@example.com", "Josh", deviceUuid)
        .run();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/status", {
          headers: { Authorization: `Bearer ${deviceToken}` },
        }),
      );

      expect(resp.status).toBe(200);
      const body = await resp.json<{
        linked: boolean;
        user: { email: string; display_name: string };
      }>();
      expect(body.linked).toBe(true);
      expect(body.user.email).toBe("josh@example.com");
      expect(body.user.display_name).toBe("Josh");
    });

    it("returns link_code when one exists", async () => {
      const { deviceToken } = await seedDevice();

      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/status", {
          headers: { Authorization: `Bearer ${deviceToken}` },
        }),
      );

      expect(resp.status).toBe(200);
      const body = await resp.json<{ link_code: string; link_code_expires_at: string }>();
      expect(body.link_code).toMatch(/^\d{6}$/);
      expect(body.link_code_expires_at).toBeTruthy();
    });

    it("requires device auth", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/device/status"),
      );

      expect(resp.status).toBe(401);
    });
  });
});
