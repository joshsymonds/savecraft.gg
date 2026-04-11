import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  cleanAll,
  closeWs,
  connectDaemonWs,
  connectWs,
  drainRelayedMessages,
  requireInnerPayload,
  seedSaveWithData,
  seedSource,
  sendSourceOnlineAndDrainLinkState,
  waitForPayload,
  waitForRelayedMessage,
  waitForRelayedMessageMatching,
} from "./helpers";

const TEST_USER = "removal-test-user";
const OTHER_USER = "other-user";

/** Wait for a sourceState message where the given source is absent. */
function waitForSourceRemoved(ws: WebSocket, sourceUuid: string) {
  return waitForRelayedMessageMatching(ws, (msg) => {
    if (msg.message?.payload?.$case !== "sourceState") return false;
    const state = msg.message.payload.sourceState;
    return !state.sources.some((s) => s.sourceId === sourceUuid);
  });
}

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

    it("cleans up orphaned UserHub state when D1 record is missing", async () => {
      // Simulate orphaned DO state: seed a source, push state to UserHub,
      // then delete the D1 record directly — leaving UserHub state behind.
      const { sourceUuid, sourceToken } = await seedSource(TEST_USER);

      // Connect daemon so SourceHub creates state, then push it to UserHub
      const daemonWs = await connectDaemonWs(sourceToken);
      await sendSourceOnlineAndDrainLinkState(daemonWs);
      await waitForPayload(daemonWs, "configUpdate"); // drain configUpdate

      // Connect UI to verify source appears in state
      const uiWs = await connectWs("/ws/ui", TEST_USER);
      const initialState = await waitForRelayedMessage(uiWs);
      const state = requireInnerPayload(initialState, "sourceState");
      expect(state.sources.some((s) => s.sourceId === sourceUuid)).toBe(true);

      // Drain remaining messages
      await drainRelayedMessages(uiWs);

      // Delete D1 record directly — simulates the D1/DO desync
      await env.DB.prepare("DELETE FROM sources WHERE source_uuid = ?").bind(sourceUuid).run();

      // Set up listener BEFORE deletion so we don't miss the message
      const statePromise = waitForSourceRemoved(uiWs, sourceUuid);

      // DELETE should succeed even though D1 record is gone — cleans up
      // the requesting user's UserHub state only (no SourceHub wipe).
      const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });
      expect(resp.status).toBe(200);

      // UI should receive updated state without the source
      await statePromise;

      await closeWs(uiWs);
      await closeWs(daemonWs);
    });

    it("does not affect other users when cleaning up orphaned state", async () => {
      // Source owned by OTHER_USER, D1 record deleted — TEST_USER should
      // only clean their own UserHub, not touch OTHER_USER's SourceHub DO.
      const { sourceUuid } = await seedSource(OTHER_USER);

      // Delete D1 record to simulate orphan
      await env.DB.prepare("DELETE FROM sources WHERE source_uuid = ?").bind(sourceUuid).run();

      const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      // Succeeds (cleans requesting user's UserHub only)
      expect(resp.status).toBe(200);
    });

    it("returns 403 when source belongs to another user", async () => {
      const { sourceUuid } = await seedSource(OTHER_USER);

      const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(403);
    });

    it("deletes sole-source saves and dependent data when source is removed", async () => {
      const { sourceUuid } = await seedSource(TEST_USER);
      const saveUuid = await seedSaveWithData(TEST_USER, "d2r", "Atmus", { sourceUuid });

      // Add a note on the save
      await env.DB.prepare(
        "INSERT INTO notes (note_id, save_id, user_uuid, title, content) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(crypto.randomUUID(), saveUuid, TEST_USER, "My Note", "Note content")
        .run();

      const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);

      // Save deleted
      const save = await env.DB.prepare("SELECT 1 FROM saves WHERE uuid = ?")
        .bind(saveUuid)
        .first();
      expect(save).toBeNull();

      // Sections deleted
      const section = await env.DB.prepare("SELECT 1 FROM sections WHERE save_uuid = ?")
        .bind(saveUuid)
        .first();
      expect(section).toBeNull();

      // Search index deleted
      const search = await env.DB.prepare("SELECT 1 FROM search_index WHERE save_id = ?")
        .bind(saveUuid)
        .first();
      expect(search).toBeNull();

      // Notes deleted
      const note = await env.DB.prepare("SELECT 1 FROM notes WHERE save_id = ?")
        .bind(saveUuid)
        .first();
      expect(note).toBeNull();
    });

    it("preserves saves when another active source also pushed them", async () => {
      const { sourceUuid: sourceA } = await seedSource(TEST_USER);
      const { sourceUuid: sourceB } = await seedSource(TEST_USER);

      // Save was last pushed by source B
      const saveUuid = await seedSaveWithData(TEST_USER, "d2r", "Atmus", {
        sourceUuid: sourceB,
      });

      // Delete source A — save should survive (source B still active)
      const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceA}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);

      const save = await env.DB.prepare("SELECT 1 FROM saves WHERE uuid = ?")
        .bind(saveUuid)
        .first();
      expect(save).not.toBeNull();
    });

    it("deletes orphan saves (null user_uuid) for the deleted source", async () => {
      const { sourceUuid } = await seedSource(TEST_USER);

      // Orphan save: pushed before linking, user_uuid is still NULL
      const saveUuid = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_source_uuid)
         VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      )
        .bind(saveUuid, "d2r", "Diablo II: Resurrected", "Atmus", "Level 1", sourceUuid)
        .run();

      const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);

      const save = await env.DB.prepare("SELECT 1 FROM saves WHERE uuid = ?")
        .bind(saveUuid)
        .first();
      expect(save).toBeNull();
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
      await sendSourceOnlineAndDrainLinkState(daemonWs);
      // Consume configUpdate
      await waitForPayload(daemonWs, "configUpdate");

      // Connect UI
      const uiWs = await connectWs("/ws/ui", TEST_USER);
      // Consume initial state (should include the source)
      const initialState = await waitForRelayedMessage(uiWs);
      const state = requireInnerPayload(initialState, "sourceState");
      expect(state.sources.length).toBeGreaterThan(0);
      // Consume events
      await drainRelayedMessages(uiWs);

      // Set up listener BEFORE deletion so we don't miss the message
      const statePromise = waitForSourceRemoved(uiWs, sourceUuid);

      // Delete the source
      const resp = await SELF.fetch(`https://test-host/api/v1/sources/${sourceUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });
      expect(resp.status).toBe(200);

      // UI should receive updated state without the removed source
      await statePromise;

      await closeWs(uiWs);
      await closeWs(daemonWs);
    });
  });
});

describe("Game Removal", () => {
  beforeEach(cleanAll);

  describe("DELETE /api/v1/games/:gameId", () => {
    it("deletes all saves, notes, sections, and search index for a game", async () => {
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

      // Sections gone (FK cascade)
      const sectionRows = await env.DB.prepare("SELECT 1 FROM sections WHERE save_uuid = ?")
        .bind(saveUuid)
        .first();
      expect(sectionRows).toBeNull();

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

    it("returns 200 with zero deletes when user has no saves for the game", async () => {
      const resp = await SELF.fetch("https://test-host/api/v1/games/nonexistent-game", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER}` },
      });

      expect(resp.status).toBe(200);
      const body = await resp.json<{ ok: boolean; deleted: { saves: number; notes: number } }>();
      expect(body.deleted.saves).toBe(0);
      expect(body.deleted.notes).toBe(0);
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

      // Other user's section data still exists
      const otherSections = await env.DB.prepare("SELECT 1 FROM sections WHERE save_uuid = ?")
        .bind(otherSaveUuid)
        .first();
      expect(otherSections).not.toBeNull();
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
