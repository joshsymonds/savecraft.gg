import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, seedSaveWithData, seedSource } from "./helpers";

const TEST_USER = "save-removal-user";

describe("Save Removal", () => {
  beforeEach(cleanAll);

  describe("DELETE /api/v1/saves/:saveUuid", () => {
    it("soft-deletes save, hard-deletes sections+search_index, updates exclude_saves", async () => {
      const { sourceUuid } = await seedSource(TEST_USER);
      const saveUuid = await seedSaveWithData(TEST_USER, "d2r", "Atmus.d2s", { sourceUuid });

      // Add a note on the save
      await env.DB.prepare(
        `INSERT INTO notes (note_id, save_id, user_uuid, title, content)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), saveUuid, TEST_USER, "Build Guide", "Hammerdin build notes")
        .run();

      // Add source_config for this game
      await env.DB.prepare(
        `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
         VALUES (?, ?, ?, 1, '[]')`,
      )
        .bind(sourceUuid, "d2r", "/saves/d2r")
        .run();

      const resp = await SELF.fetch(`https://test-host/api/v1/saves/${saveUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);
      const body = await resp.json<{ ok: boolean }>();
      expect(body.ok).toBe(true);

      // Save row still exists but has removed_at set
      const save = await env.DB.prepare("SELECT removed_at FROM saves WHERE uuid = ?")
        .bind(saveUuid)
        .first<{ removed_at: string | null }>();
      expect(save).not.toBeNull();
      expect(save!.removed_at).not.toBeNull();

      // Notes preserved
      const note = await env.DB.prepare("SELECT 1 FROM notes WHERE save_id = ?")
        .bind(saveUuid)
        .first();
      expect(note).not.toBeNull();

      // Sections hard-deleted
      const section = await env.DB.prepare("SELECT 1 FROM sections WHERE save_uuid = ?")
        .bind(saveUuid)
        .first();
      expect(section).toBeNull();

      // Search index hard-deleted
      const search = await env.DB.prepare("SELECT 1 FROM search_index WHERE save_id = ?")
        .bind(saveUuid)
        .first();
      expect(search).toBeNull();

      // exclude_saves updated in source_config
      const config = await env.DB.prepare(
        "SELECT exclude_saves FROM source_configs WHERE source_uuid = ? AND game_id = ?",
      )
        .bind(sourceUuid, "d2r")
        .first<{ exclude_saves: string }>();
      const excludeSaves = JSON.parse(config!.exclude_saves) as string[];
      expect(excludeSaves).toContain("Atmus.d2s");
    });

    it("returns 404 for non-existent save", async () => {
      const resp = await SELF.fetch("https://test-host/api/v1/saves/nonexistent-uuid", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });
      expect(resp.status).toBe(404);
    });

    it("returns 404 for already-removed save", async () => {
      const saveUuid = await seedSaveWithData(TEST_USER, "d2r", "AlreadyGone.d2s");
      await env.DB.prepare("UPDATE saves SET removed_at = datetime('now') WHERE uuid = ?")
        .bind(saveUuid)
        .run();

      const resp = await SELF.fetch(`https://test-host/api/v1/saves/${saveUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });
      expect(resp.status).toBe(404);
    });
  });

  describe("POST /api/v1/saves/:saveUuid/restore", () => {
    it("restores a removed save and removes from exclude_saves", async () => {
      const { sourceUuid } = await seedSource(TEST_USER);
      const saveUuid = await seedSaveWithData(TEST_USER, "d2r", "Atmus.d2s", { sourceUuid });

      // Simulate removal: set removed_at and add to exclude_saves
      await env.DB.prepare("UPDATE saves SET removed_at = datetime('now') WHERE uuid = ?")
        .bind(saveUuid)
        .run();
      await env.DB.prepare(
        `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions, exclude_saves)
         VALUES (?, ?, ?, 1, '[]', ?)`,
      )
        .bind(sourceUuid, "d2r", "/saves/d2r", JSON.stringify(["Atmus.d2s"]))
        .run();

      const resp = await SELF.fetch(`https://test-host/api/v1/saves/${saveUuid}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);
      const body = await resp.json<{ ok: boolean }>();
      expect(body.ok).toBe(true);

      // Save row has removed_at cleared
      const save = await env.DB.prepare("SELECT removed_at FROM saves WHERE uuid = ?")
        .bind(saveUuid)
        .first<{ removed_at: string | null }>();
      expect(save!.removed_at).toBeNull();

      // exclude_saves no longer contains the save name
      const config = await env.DB.prepare(
        "SELECT exclude_saves FROM source_configs WHERE source_uuid = ? AND game_id = ?",
      )
        .bind(sourceUuid, "d2r")
        .first<{ exclude_saves: string }>();
      const excludeSaves = JSON.parse(config!.exclude_saves) as string[];
      expect(excludeSaves).not.toContain("Atmus.d2s");
    });

    it("returns 404 for non-removed save", async () => {
      const saveUuid = await seedSaveWithData(TEST_USER, "d2r", "Active.d2s");

      const resp = await SELF.fetch(`https://test-host/api/v1/saves/${saveUuid}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });
      expect(resp.status).toBe(404);
    });
  });

  describe("GET /api/v1/games/:gameId/removed-saves", () => {
    it("returns removed saves with note counts", async () => {
      const saveUuid = await seedSaveWithData(TEST_USER, "d2r", "Removed.d2s");

      // Add notes
      await env.DB.prepare(
        `INSERT INTO notes (note_id, save_id, user_uuid, title, content) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), saveUuid, TEST_USER, "Note 1", "Content 1")
        .run();
      await env.DB.prepare(
        `INSERT INTO notes (note_id, save_id, user_uuid, title, content) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), saveUuid, TEST_USER, "Note 2", "Content 2")
        .run();

      // Mark as removed
      await env.DB.prepare("UPDATE saves SET removed_at = datetime('now') WHERE uuid = ?")
        .bind(saveUuid)
        .run();

      const resp = await SELF.fetch("https://test-host/api/v1/games/d2r/removed-saves", {
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);
      const body = await resp.json<{
        saves: {
          saveUuid: string;
          saveName: string;
          summary: string;
          removedAt: string;
          noteCount: number;
        }[];
      }>();
      expect(body.saves).toHaveLength(1);
      expect(body.saves[0]!.saveName).toBe("Removed.d2s");
      expect(body.saves[0]!.noteCount).toBe(2);
      expect(body.saves[0]!.removedAt).toBeTruthy();
    });

    it("returns empty array when no removed saves exist", async () => {
      // Seed an active save (not removed)
      await seedSaveWithData(TEST_USER, "d2r", "Active.d2s");

      const resp = await SELF.fetch("https://test-host/api/v1/games/d2r/removed-saves", {
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);
      const body = await resp.json<{ saves: unknown[] }>();
      expect(body.saves).toHaveLength(0);
    });
  });
});
