import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  cleanAll,
  closeWs,
  connectDaemonWs,
  connectWs,
  seedSource,
  waitForMessage,
} from "./helpers";

const TEST_USER = "removal-test-user";
const OTHER_USER = "other-user";

describe("Source Removal", () => {
  beforeEach(cleanAll);

  describe("DELETE /api/v1/sources/:sourceUuid", () => {
    it("deletes source and all associated D1 data", async () => {
      const { sourceUuid } = await seedSource(TEST_USER);

      // Seed source_configs and source_events
      await env.DB.prepare(
        `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
         VALUES (?, ?, ?, 1, '[]')`,
      )
        .bind(sourceUuid, "d2r", "/saves/d2r")
        .run();

      await env.DB.prepare(
        `INSERT INTO source_events (source_uuid, event_type, event_data)
         VALUES (?, ?, ?)`,
      )
        .bind(sourceUuid, "watching", '{"watching":{"gameId":"d2r"}}')
        .run();

      const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);
      const body = await resp.json<{ ok: boolean }>();
      expect(body.ok).toBe(true);

      // Source row gone
      const source = await env.DB.prepare("SELECT 1 FROM sources WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first();
      expect(source).toBeNull();

      // source_configs gone
      const configs = await env.DB.prepare("SELECT 1 FROM source_configs WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first();
      expect(configs).toBeNull();

      // source_events gone
      const events = await env.DB.prepare("SELECT 1 FROM source_events WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first();
      expect(events).toBeNull();
    });

    it("returns 404 for nonexistent source", async () => {
      const resp = await SELF.fetch("https://test-host/api/v1/sources/nonexistent-uuid", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(404);
    });

    it("returns 403 when source belongs to another user", async () => {
      const { sourceUuid } = await seedSource(OTHER_USER);

      const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(403);
    });

    it("preserves user saves when source is removed", async () => {
      const { sourceUuid } = await seedSource(TEST_USER);

      // Create a save owned by this user
      const saveUuid = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_source_uuid)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          saveUuid,
          TEST_USER,
          "d2r",
          "Diablo II: Resurrected",
          "Atmus",
          "Level 89 Paladin",
          sourceUuid,
        )
        .run();

      const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);

      // Save still exists
      const save = await env.DB.prepare("SELECT 1 FROM saves WHERE uuid = ?")
        .bind(saveUuid)
        .first();
      expect(save).not.toBeNull();
    });

    it("requires session auth", async () => {
      const resp = await SELF.fetch("https://test-host/api/v1/sources/any-uuid", {
        method: "DELETE",
      });

      expect(resp.status).toBe(401);
    });

    it("notifies UserHub and UI clients receive updated state", async () => {
      const { sourceUuid, sourceToken } = await seedSource(TEST_USER);

      // Connect daemon and send sourceOnline so SourceHub has state
      const daemonWs = await connectDaemonWs(sourceToken);
      daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: sourceUuid, version: "0.1.0" } }));
      // Consume configUpdate
      await waitForMessage(daemonWs);

      // Connect UI
      const uiWs = await connectWs("/ws/ui", TEST_USER);
      // Consume initial state (should include the source)
      const initialState = await waitForMessage<{
        sourceState: { sources: { sourceId: string }[] };
      }>(uiWs);
      expect(initialState.sourceState.sources.length).toBeGreaterThan(0);
      // Consume events
      // There may be multiple messages (events); drain them with a short timeout
      const drainMessages = async (): Promise<void> => {
        // Drain up to 50 queued messages (generous upper bound)
        for (let attempt = 0; attempt < 50; attempt++) {
          try {
            await waitForMessage(uiWs, 200);
          } catch {
            // Timeout means no more messages — done draining
            break;
          }
        }
      };
      await drainMessages();

      // Set up listener for next state update BEFORE deletion
      const statePromise = waitForMessage<{
        sourceState: { sources: { sourceId: string }[] };
      }>(uiWs);

      // Delete the source
      const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });
      expect(resp.status).toBe(200);

      // UI should receive updated state without the removed source
      const updatedState = await statePromise;
      expect(updatedState.sourceState).toBeDefined();
      const removedSource = updatedState.sourceState.sources.find((s) => s.sourceId === sourceUuid);
      expect(removedSource).toBeUndefined();

      await closeWs(uiWs);
      await closeWs(daemonWs);
    });
  });

  describe("POST /api/v1/source/deregister (source-token auth)", () => {
    it("deletes source and all associated D1 data", async () => {
      const { sourceUuid, sourceToken } = await seedSource(TEST_USER);

      // Seed source_configs and source_events
      await env.DB.prepare(
        `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
         VALUES (?, ?, ?, 1, '[]')`,
      )
        .bind(sourceUuid, "d2r", "/saves/d2r")
        .run();

      await env.DB.prepare(
        `INSERT INTO source_events (source_uuid, event_type, event_data)
         VALUES (?, ?, ?)`,
      )
        .bind(sourceUuid, "watching", '{"watching":{"gameId":"d2r"}}')
        .run();

      const resp = await SELF.fetch("https://test-host/api/v1/source/deregister", {
        method: "POST",
        headers: { Authorization: `Bearer ${sourceToken}` },
      });

      expect(resp.status).toBe(200);
      const body = await resp.json<{ ok: boolean }>();
      expect(body.ok).toBe(true);

      // Source row gone
      const source = await env.DB.prepare("SELECT 1 FROM sources WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first();
      expect(source).toBeNull();

      // source_configs gone
      const configs = await env.DB.prepare("SELECT 1 FROM source_configs WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first();
      expect(configs).toBeNull();

      // source_events gone
      const events = await env.DB.prepare("SELECT 1 FROM source_events WHERE source_uuid = ?")
        .bind(sourceUuid)
        .first();
      expect(events).toBeNull();
    });

    it("works for unlinked sources (no user)", async () => {
      const { sourceToken } = await seedSource(null);

      const resp = await SELF.fetch("https://test-host/api/v1/source/deregister", {
        method: "POST",
        headers: { Authorization: `Bearer ${sourceToken}` },
      });

      expect(resp.status).toBe(200);
    });

    it("returns 401 without auth", async () => {
      const resp = await SELF.fetch("https://test-host/api/v1/source/deregister", {
        method: "POST",
      });

      expect(resp.status).toBe(401);
    });

    it("notifies UserHub when source is linked", async () => {
      const { sourceUuid, sourceToken } = await seedSource(TEST_USER);

      // Connect daemon and send sourceOnline so SourceHub has state
      const daemonWs = await connectDaemonWs(sourceToken);
      daemonWs.send(JSON.stringify({ sourceOnline: { sourceId: sourceUuid, version: "0.1.0" } }));
      await waitForMessage(daemonWs);

      // Connect UI
      const uiWs = await connectWs("/ws/ui", TEST_USER);
      // Drain initial state + events
      for (let index = 0; index < 50; index++) {
        try {
          await waitForMessage(uiWs, 200);
        } catch {
          break;
        }
      }

      const statePromise = waitForMessage<{
        sourceState: { sources: { sourceId: string }[] };
      }>(uiWs);

      // Deregister via source token
      const resp = await SELF.fetch("https://test-host/api/v1/source/deregister", {
        method: "POST",
        headers: { Authorization: `Bearer ${sourceToken}` },
      });
      expect(resp.status).toBe(200);

      // UI should receive updated state without the removed source
      const updatedState = await statePromise;
      const removedSource = updatedState.sourceState.sources.find((s) => s.sourceId === sourceUuid);
      expect(removedSource).toBeUndefined();

      await closeWs(uiWs);
      await closeWs(daemonWs);
    });
  });
});

// -- Helper to seed a save with R2 data and search index -----------------

async function seedSaveWithData(
  userUuid: string,
  gameId: string,
  saveName: string,
  options?: { sourceUuid?: string },
): Promise<string> {
  const saveUuid = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_source_uuid)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      saveUuid,
      userUuid,
      gameId,
      gameId,
      saveName,
      `${saveName} summary`,
      options?.sourceUuid ?? null,
    )
    .run();

  // R2: latest + one snapshot
  const snapshot = JSON.stringify({ identity: { saveName }, sections: {} });
  await env.SAVES.put(`saves/${saveUuid}/latest.json`, snapshot);
  await env.SAVES.put(`saves/${saveUuid}/snapshots/2026-01-01T00:00:00Z.json`, snapshot);

  // Search index
  await env.DB.prepare(
    `INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content)
     VALUES (?, ?, 'section', ?, ?, ?)`,
  )
    .bind(saveUuid, saveName, "overview", "Overview", "test content")
    .run();

  return saveUuid;
}

describe("Game Removal", () => {
  beforeEach(cleanAll);

  describe("DELETE /api/v1/games/:gameId", () => {
    it("deletes all saves, notes, R2 objects, and search index for a game", async () => {
      const { sourceUuid } = await seedSource(TEST_USER);
      const saveUuid = await seedSaveWithData(TEST_USER, "d2r", "Hammerdin", { sourceUuid });

      // Add a note on the save
      await env.DB.prepare(
        `INSERT INTO notes (note_id, save_id, user_uuid, title, content)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), saveUuid, TEST_USER, "My Note", "Note content")
        .run();

      // Add source_config for this game
      await env.DB.prepare(
        `INSERT INTO source_configs (source_uuid, game_id, save_path, enabled, file_extensions)
         VALUES (?, ?, ?, 1, '[]')`,
      )
        .bind(sourceUuid, "d2r", "/saves/d2r")
        .run();

      const resp = await SELF.fetch("https://test-host/api/v1/games/d2r", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);
      const body = await resp.json<{ ok: boolean; deleted: { saves: number; notes: number } }>();
      expect(body.ok).toBe(true);
      expect(body.deleted.saves).toBe(1);
      expect(body.deleted.notes).toBe(1);

      // Save gone
      const save = await env.DB.prepare("SELECT 1 FROM saves WHERE uuid = ?")
        .bind(saveUuid)
        .first();
      expect(save).toBeNull();

      // Notes gone
      const notes = await env.DB.prepare("SELECT 1 FROM notes WHERE save_id = ?")
        .bind(saveUuid)
        .first();
      expect(notes).toBeNull();

      // R2 objects gone
      const latest = await env.SAVES.get(`saves/${saveUuid}/latest.json`);
      expect(latest).toBeNull();
      const snapshots = await env.SAVES.list({ prefix: `saves/${saveUuid}/snapshots/` });
      expect(snapshots.objects).toHaveLength(0);

      // Search index gone
      const searchRows = await env.DB.prepare("SELECT 1 FROM search_index WHERE save_id = ?")
        .bind(saveUuid)
        .first();
      expect(searchRows).toBeNull();

      // source_config disabled
      const config = await env.DB.prepare(
        "SELECT enabled FROM source_configs WHERE source_uuid = ? AND game_id = ?",
      )
        .bind(sourceUuid, "d2r")
        .first<{ enabled: number }>();
      expect(config!.enabled).toBe(0);
    });

    it("returns 404 when user has no saves for the game", async () => {
      const resp = await SELF.fetch("https://test-host/api/v1/games/nonexistent-game", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(404);
    });

    it("requires session auth", async () => {
      const resp = await SELF.fetch("https://test-host/api/v1/games/d2r", {
        method: "DELETE",
      });

      expect(resp.status).toBe(401);
    });

    it("only deletes saves belonging to the requesting user", async () => {
      // Create saves for two different users for the same game
      await seedSaveWithData(TEST_USER, "d2r", "MyChar");
      const otherSaveUuid = await seedSaveWithData(OTHER_USER, "d2r", "OtherChar");

      const resp = await SELF.fetch("https://test-host/api/v1/games/d2r", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);

      // Other user's save still exists
      const otherSave = await env.DB.prepare("SELECT 1 FROM saves WHERE uuid = ?")
        .bind(otherSaveUuid)
        .first();
      expect(otherSave).not.toBeNull();

      // Other user's R2 data still exists
      const otherLatest = await env.SAVES.get(`saves/${otherSaveUuid}/latest.json`);
      expect(otherLatest).not.toBeNull();
    });

    it("handles multiple saves for the same game", async () => {
      const save1 = await seedSaveWithData(TEST_USER, "d2r", "Hammerdin");
      const save2 = await seedSaveWithData(TEST_USER, "d2r", "Sorceress");

      const resp = await SELF.fetch("https://test-host/api/v1/games/d2r", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);
      const body = await resp.json<{ deleted: { saves: number } }>();
      expect(body.deleted.saves).toBe(2);

      // Both saves gone
      for (const uuid of [save1, save2]) {
        const save = await env.DB.prepare("SELECT 1 FROM saves WHERE uuid = ?").bind(uuid).first();
        expect(save).toBeNull();
      }
    });
  });
});
