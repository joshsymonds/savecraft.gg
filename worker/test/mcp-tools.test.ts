import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { ToolResult } from "../src/mcp/tools";
import {
  createNote,
  deleteNote,
  getNote,
  getSaveSections,
  getSaveSummary,
  getSection,
  getSectionDiff,
  listNotes,
  listSaves,
  search,
  updateNote,
} from "../src/mcp/tools";

import { cleanAll } from "./helpers";

const USER_A = "mcp-user-a";
const USER_B = "mcp-user-b";

const sampleGameState = {
  identity: {
    character_name: "Hammerdin",
    game_id: "d2r",
    extra: { class: "Paladin", level: 89 },
  },
  summary: "Hammerdin, Level 89 Paladin",
  sections: {
    character_overview: {
      description: "Level, class, difficulty, play time",
      data: { name: "Hammerdin", class: "Paladin", level: 89, difficulty: "Hell" },
    },
    equipped_gear: {
      description: "All equipped items with stats, sockets, runewords",
      data: {
        helmet: { name: "Harlequin Crest", base: "Shako" },
        body_armor: { name: "Enigma", base: "Mage Plate" },
      },
    },
    skills: {
      description: "Skill point allocation by tree",
      data: { combat: { "Blessed Hammer": 20, Concentration: 20 } },
    },
  },
};

async function seedSave(options: {
  saveUuid: string;
  userUuid: string;
  gameId: string;
  characterName: string;
  summary: string;
  lastUpdated?: string;
  gameState?: typeof sampleGameState;
}): Promise<void> {
  const lastUpdated = options.lastUpdated ?? "2026-02-25T21:30:00Z";

  await env.DB.prepare(
    "INSERT INTO saves (uuid, user_uuid, game_id, character_name, summary, last_updated) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      options.saveUuid,
      options.userUuid,
      options.gameId,
      options.characterName,
      options.summary,
      lastUpdated,
    )
    .run();

  const state = options.gameState ?? sampleGameState;
  const key = `users/${options.userUuid}/saves/${options.saveUuid}/latest.json`;
  await env.SAVES.put(key, JSON.stringify(state));
}

async function seedSnapshot(
  userUuid: string,
  saveUuid: string,
  timestamp: string,
  gameState: typeof sampleGameState,
): Promise<void> {
  const key = `users/${userUuid}/saves/${saveUuid}/snapshots/${timestamp}.json`;
  await env.SAVES.put(key, JSON.stringify(gameState));
}

function parseResult(result: ToolResult): unknown {
  const first = result.content[0];
  if (first?.type !== "text") throw new Error("Expected text content");
  return JSON.parse(first.text);
}

// ── MCP Tools ─────────────────────────────────────────────────

describe("MCP Tools", () => {
  beforeEach(cleanAll);

  // ── list_saves ──────────────────────────────────────────────

  describe("listSaves", () => {
    it("returns empty array when user has no saves", async () => {
      const result = await listSaves(env.DB, "no-saves-user");
      const data = parseResult(result) as { saves: unknown[] };
      expect(data.saves).toEqual([]);
    });

    it("returns all saves for the authenticated user", async () => {
      await seedSave({
        saveUuid: "save-1",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
      });
      await seedSave({
        saveUuid: "save-2",
        userUuid: USER_A,
        gameId: "stardew",
        characterName: "Berry Farm",
        summary: "Berry Farm, Year 3 Fall",
      });

      const result = await listSaves(env.DB, USER_A);
      const data = parseResult(result) as { saves: { save_id: string; game_id: string }[] };
      expect(data.saves).toHaveLength(2);

      const gameIds = data.saves.map((s) => s.game_id).toSorted((a, b) => a.localeCompare(b));
      expect(gameIds).toEqual(["d2r", "stardew"]);
    });

    it("does not return saves from other users", async () => {
      await seedSave({
        saveUuid: "save-other",
        userUuid: USER_B,
        gameId: "d2r",
        characterName: "Sorceress",
        summary: "Sorceress, Level 80",
      });

      const result = await listSaves(env.DB, USER_A);
      const data = parseResult(result) as { saves: { save_id: string }[] };
      // Should only see USER_A saves (if any seeded in this test), not USER_B
      const allIds = data.saves.map((s) => s.save_id);
      expect(allIds).not.toContain("save-other");
    });

    it("includes save metadata in response", async () => {
      await seedSave({
        saveUuid: "save-meta",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
        lastUpdated: "2026-02-25T21:30:00Z",
      });

      const result = await listSaves(env.DB, USER_A);
      const data = parseResult(result) as { saves: Record<string, unknown>[] };
      const save = data.saves.find((s) => s.save_id === "save-meta");
      expect(save).toBeDefined();
      expect(save!.game_id).toBe("d2r");
      expect(save!.name).toBe("Hammerdin");
      expect(save!.summary).toBe("Hammerdin, Level 89 Paladin");
      expect(save!.last_updated).toBe("2026-02-25T21:30:00Z");
    });
  });

  // ── get_save_sections ─────────────────────────────────────────

  describe("getSaveSections", () => {
    it("returns section names and descriptions", async () => {
      await seedSave({
        saveUuid: "save-sections",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
      });

      const result = await getSaveSections(env.DB, env.SAVES, USER_A, "save-sections");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        save_id: string;
        game_id: string;
        sections: { name: string; description: string }[];
      };
      expect(data.save_id).toBe("save-sections");
      expect(data.game_id).toBe("d2r");
      expect(data.sections).toHaveLength(3);

      const names = data.sections.map((s) => s.name).toSorted((a, b) => a.localeCompare(b));
      expect(names).toEqual(["character_overview", "equipped_gear", "skills"]);

      const overview = data.sections.find((s) => s.name === "character_overview");
      expect(overview!.description).toBe("Level, class, difficulty, play time");
    });

    it("returns error for non-existent save", async () => {
      const result = await getSaveSections(env.DB, env.SAVES, USER_A, "nonexistent");
      expect(result.isError).toBe(true);
    });

    it("returns error when save belongs to different user", async () => {
      await seedSave({
        saveUuid: "save-other-user",
        userUuid: USER_B,
        gameId: "d2r",
        characterName: "Sorceress",
        summary: "Sorceress, Level 80",
      });

      const result = await getSaveSections(env.DB, env.SAVES, USER_A, "save-other-user");
      expect(result.isError).toBe(true);
    });
  });

  // ── get_section ───────────────────────────────────────────────

  describe("getSection", () => {
    it("returns section data for a valid section", async () => {
      await seedSave({
        saveUuid: "save-section",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-section", "equipped_gear");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        save_id: string;
        section: string;
        data: Record<string, unknown>;
      };
      expect(data.save_id).toBe("save-section");
      expect(data.section).toBe("equipped_gear");
      expect(data.data).toEqual({
        helmet: { name: "Harlequin Crest", base: "Shako" },
        body_armor: { name: "Enigma", base: "Mage Plate" },
      });
    });

    it("returns error for non-existent section", async () => {
      await seedSave({
        saveUuid: "save-section-missing",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
      });

      const result = await getSection(
        env.DB,
        env.SAVES,
        USER_A,
        "save-section-missing",
        "nonexistent_section",
      );
      expect(result.isError).toBe(true);
    });

    it("returns error for non-existent save", async () => {
      const result = await getSection(env.DB, env.SAVES, USER_A, "nonexistent", "skills");
      expect(result.isError).toBe(true);
    });

    it("returns error when save belongs to different user", async () => {
      await seedSave({
        saveUuid: "save-section-other",
        userUuid: USER_B,
        gameId: "d2r",
        characterName: "Amazon",
        summary: "Amazon, Level 70",
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-section-other", "skills");
      expect(result.isError).toBe(true);
    });

    it("returns section data at a specific timestamp", async () => {
      await seedSave({
        saveUuid: "save-section-ts",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "HistoricalChar",
        summary: "Test",
      });

      // Seed an older snapshot with different gear
      const olderState = {
        ...sampleGameState,
        sections: {
          ...sampleGameState.sections,
          equipped_gear: {
            description: "All equipped items with stats, sockets, runewords",
            data: {
              helmet: { name: "Tal Rasha Crest", base: "Death Mask" },
              body_armor: { name: "Smoke", base: "Linked Mail" },
            },
          },
        },
      };
      await seedSnapshot(USER_A, "save-section-ts", "2026-02-24T12:00:00Z", olderState);

      const result = await getSection(
        env.DB,
        env.SAVES,
        USER_A,
        "save-section-ts",
        "equipped_gear",
        "2026-02-24T12:00:00Z",
      );
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        data: { helmet: { name: string } };
        timestamp: string;
      };
      expect(data.data.helmet.name).toBe("Tal Rasha Crest");
      expect(data.timestamp).toBe("2026-02-24T12:00:00Z");
    });

    it("returns error for non-existent timestamp", async () => {
      await seedSave({
        saveUuid: "save-section-ts-missing",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "MissingTsChar",
        summary: "Test",
      });

      const result = await getSection(
        env.DB,
        env.SAVES,
        USER_A,
        "save-section-ts-missing",
        "equipped_gear",
        "2099-01-01T00:00:00Z",
      );
      expect(result.isError).toBe(true);
    });
  });

  // ── get_section_diff ─────────────────────────────────────────

  describe("getSectionDiff", () => {
    it("returns changed fields between two snapshots", async () => {
      await seedSave({
        saveUuid: "save-diff",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "DiffChar",
        summary: "Test",
      });

      const olderState = {
        ...sampleGameState,
        sections: {
          ...sampleGameState.sections,
          character_overview: {
            description: "Level, class, difficulty, play time",
            data: { name: "DiffChar", class: "Paladin", level: 85, difficulty: "Hell" },
          },
          equipped_gear: {
            description: "All equipped items with stats, sockets, runewords",
            data: {
              helmet: { name: "Tal Rasha Crest", base: "Death Mask" },
              body_armor: { name: "Smoke", base: "Linked Mail" },
            },
          },
        },
      };
      const newerState = {
        ...sampleGameState,
        sections: {
          ...sampleGameState.sections,
          character_overview: {
            description: "Level, class, difficulty, play time",
            data: { name: "DiffChar", class: "Paladin", level: 89, difficulty: "Hell" },
          },
          equipped_gear: {
            description: "All equipped items with stats, sockets, runewords",
            data: {
              helmet: { name: "Harlequin Crest", base: "Shako" },
              body_armor: { name: "Enigma", base: "Mage Plate" },
            },
          },
        },
      };

      await seedSnapshot(USER_A, "save-diff", "2026-02-24T12:00:00Z", olderState);
      await seedSnapshot(USER_A, "save-diff", "2026-02-25T21:30:00Z", newerState);

      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "save-diff",
        "equipped_gear",
        "2026-02-24T12:00:00Z",
        "2026-02-25T21:30:00Z",
      );
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        save_id: string;
        section: string;
        from: string;
        to: string;
        changes: { path: string; old: unknown; new: unknown }[];
      };
      expect(data.save_id).toBe("save-diff");
      expect(data.section).toBe("equipped_gear");
      expect(data.changes.length).toBeGreaterThanOrEqual(1);

      const helmetChange = data.changes.find((c) => c.path === "helmet.name");
      expect(helmetChange).toBeDefined();
      expect(helmetChange!.old).toBe("Tal Rasha Crest");
      expect(helmetChange!.new).toBe("Harlequin Crest");
    });

    it("returns empty changes when snapshots are identical", async () => {
      await seedSave({
        saveUuid: "save-diff-same",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "SameChar",
        summary: "Test",
      });

      await seedSnapshot(USER_A, "save-diff-same", "2026-02-24T12:00:00Z", sampleGameState);
      await seedSnapshot(USER_A, "save-diff-same", "2026-02-25T21:30:00Z", sampleGameState);

      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "save-diff-same",
        "equipped_gear",
        "2026-02-24T12:00:00Z",
        "2026-02-25T21:30:00Z",
      );
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as { changes: unknown[] };
      expect(data.changes).toEqual([]);
    });

    it("returns error for non-existent save", async () => {
      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "nonexistent",
        "skills",
        "2026-02-24T12:00:00Z",
        "2026-02-25T21:30:00Z",
      );
      expect(result.isError).toBe(true);
    });

    it("returns error for non-existent snapshot timestamp", async () => {
      await seedSave({
        saveUuid: "save-diff-missing-ts",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "MissingDiffChar",
        summary: "Test",
      });

      await seedSnapshot(USER_A, "save-diff-missing-ts", "2026-02-24T12:00:00Z", sampleGameState);

      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "save-diff-missing-ts",
        "equipped_gear",
        "2026-02-24T12:00:00Z",
        "2099-01-01T00:00:00Z",
      );
      expect(result.isError).toBe(true);
    });
  });

  // ── get_save_summary ──────────────────────────────────────────

  describe("getSaveSummary", () => {
    it("returns save summary and overview section", async () => {
      await seedSave({
        saveUuid: "save-summary",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
      });

      const result = await getSaveSummary(env.DB, env.SAVES, USER_A, "save-summary");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        save_id: string;
        game_id: string;
        summary: string;
        overview: Record<string, unknown>;
      };
      expect(data.save_id).toBe("save-summary");
      expect(data.summary).toBe("Hammerdin, Level 89 Paladin");
      expect(data.overview).toBeDefined();
      expect(data.overview.name).toBe("Hammerdin");
    });

    it("returns error for non-existent save", async () => {
      const result = await getSaveSummary(env.DB, env.SAVES, USER_A, "nonexistent");
      expect(result.isError).toBe(true);
    });
  });

  // ── Note MCP tools ───────────────────────────────────────────

  async function seedNote(
    saveUuid: string,
    userUuid: string,
    noteId: string,
    title: string,
    content: string,
  ): Promise<void> {
    await env.DB.prepare(
      "INSERT INTO notes (note_id, save_id, user_uuid, title, content, source) VALUES (?, ?, ?, ?, ?, 'user')",
    )
      .bind(noteId, saveUuid, userUuid, title, content)
      .run();
  }

  describe("listNotes", () => {
    it("returns notes for a save", async () => {
      await seedSave({
        saveUuid: "save-notes-list",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "Hammerdin",
        summary: "Hammerdin, Level 89",
      });
      await seedNote("save-notes-list", USER_A, "note-1", "Build Guide", "## Gear section");
      await seedNote("save-notes-list", USER_A, "note-2", "Farming Goals", "Need Ber rune");

      const result = await listNotes(env.DB, USER_A, "save-notes-list");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        save_id: string;
        notes: { note_id: string; title: string; source: string; size_bytes: number }[];
      };
      expect(data.notes).toHaveLength(2);
      expect(data.notes[0]!.size_bytes).toBeGreaterThan(0);
    });

    it("returns empty array for save with no notes", async () => {
      await seedSave({
        saveUuid: "save-no-notes",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "NoNotesChar",
        summary: "No notes",
      });

      const result = await listNotes(env.DB, USER_A, "save-no-notes");
      const data = parseResult(result) as { notes: unknown[] };
      expect(data.notes).toEqual([]);
    });

    it("returns error for non-existent save", async () => {
      const result = await listNotes(env.DB, USER_A, "nonexistent");
      expect(result.isError).toBe(true);
    });
  });

  describe("getNote", () => {
    it("returns full note content", async () => {
      await seedSave({
        saveUuid: "save-get-note",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "GetNoteChar",
        summary: "Test",
      });
      await seedNote("save-get-note", USER_A, "note-get-1", "My Guide", "Full content here");

      const result = await getNote(env.DB, USER_A, "save-get-note", "note-get-1");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as { note_id: string; title: string; content: string };
      expect(data.note_id).toBe("note-get-1");
      expect(data.title).toBe("My Guide");
      expect(data.content).toBe("Full content here");
    });

    it("returns error for non-existent note", async () => {
      await seedSave({
        saveUuid: "save-get-note-missing",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "MissingNoteChar",
        summary: "Test",
      });

      const result = await getNote(env.DB, USER_A, "save-get-note-missing", "nonexistent");
      expect(result.isError).toBe(true);
    });
  });

  describe("createNote", () => {
    it("creates a note and returns note_id", async () => {
      await seedSave({
        saveUuid: "save-create-note",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "CreateNoteChar",
        summary: "Test",
      });

      const result = await createNote(
        env.DB,
        USER_A,
        "save-create-note",
        "New Guide",
        "Guide content",
      );
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as { note_id: string };
      expect(data.note_id).toBeTruthy();

      // Verify it persisted
      const check = await getNote(env.DB, USER_A, "save-create-note", data.note_id);
      const checkData = parseResult(check) as { title: string };
      expect(checkData.title).toBe("New Guide");
    });

    it("returns error for non-existent save", async () => {
      const result = await createNote(env.DB, USER_A, "nonexistent", "Test", "Test");
      expect(result.isError).toBe(true);
    });
  });

  describe("updateNote", () => {
    it("updates note content and title", async () => {
      await seedSave({
        saveUuid: "save-update-note",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "UpdateNoteChar",
        summary: "Test",
      });
      await seedNote("save-update-note", USER_A, "note-update-1", "Old Title", "Old content");

      const result = await updateNote(
        env.DB,
        USER_A,
        "save-update-note",
        "note-update-1",
        "New content",
        "New Title",
      );
      expect(result.isError).toBeUndefined();

      const check = await getNote(env.DB, USER_A, "save-update-note", "note-update-1");
      const data = parseResult(check) as { title: string; content: string };
      expect(data.title).toBe("New Title");
      expect(data.content).toBe("New content");
    });

    it("returns error for non-existent note", async () => {
      await seedSave({
        saveUuid: "save-update-missing",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "UpdateMissingChar",
        summary: "Test",
      });

      const result = await updateNote(
        env.DB,
        USER_A,
        "save-update-missing",
        "nonexistent",
        "Content",
      );
      expect(result.isError).toBe(true);
    });
  });

  describe("deleteNote", () => {
    it("deletes a note", async () => {
      await seedSave({
        saveUuid: "save-delete-note",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "DeleteNoteChar",
        summary: "Test",
      });
      await seedNote("save-delete-note", USER_A, "note-delete-1", "Temp", "Delete me");

      const result = await deleteNote(env.DB, USER_A, "save-delete-note", "note-delete-1");
      expect(result.isError).toBeUndefined();

      // Verify it's gone
      const check = await getNote(env.DB, USER_A, "save-delete-note", "note-delete-1");
      expect(check.isError).toBe(true);
    });

    it("returns error for non-existent note", async () => {
      await seedSave({
        saveUuid: "save-delete-missing",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "DeleteMissingChar",
        summary: "Test",
      });

      const result = await deleteNote(env.DB, USER_A, "save-delete-missing", "nonexistent");
      expect(result.isError).toBe(true);
    });
  });

  // ── search ───────────────────────────────────────────────────

  describe("search", () => {
    it("finds section content by keyword", async () => {
      await seedSave({
        saveUuid: "save-search-1",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "SearchChar",
        summary: "SearchChar, Level 89",
      });

      // Manually index a section
      await env.DB.prepare(
        "INSERT INTO search_index (user_uuid, save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          USER_A,
          "save-search-1",
          "SearchChar",
          "section",
          "equipped_gear",
          "All equipped items",
          JSON.stringify({ helmet: { name: "Harlequin Crest", base: "Shako" } }),
        )
        .run();

      const result = await search(env.DB, USER_A, "Harlequin");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        results: { type: string; save_id: string; ref_id: string }[];
      };
      expect(data.results.length).toBeGreaterThanOrEqual(1);
      expect(data.results[0]!.type).toBe("section");
      expect(data.results[0]!.save_id).toBe("save-search-1");
    });

    it("finds note content by keyword", async () => {
      await seedSave({
        saveUuid: "save-search-2",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "SearchNoteChar",
        summary: "Test",
      });

      await env.DB.prepare(
        "INSERT INTO search_index (user_uuid, save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          USER_A,
          "save-search-2",
          "SearchNoteChar",
          "note",
          "note-search-1",
          "Enigma Farming Guide",
          "Farm for Enigma runeword. Need Jah and Ber runes.",
        )
        .run();

      const result = await search(env.DB, USER_A, "Enigma");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        results: { type: string; ref_title: string }[];
      };
      const noteResult = data.results.find((r) => r.type === "note");
      expect(noteResult).toBeDefined();
      expect(noteResult!.ref_title).toBe("Enigma Farming Guide");
    });

    it("scopes search to save_id when provided", async () => {
      await seedSave({
        saveUuid: "save-search-scope-a",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "ScopeCharA",
        summary: "Test",
      });
      await seedSave({
        saveUuid: "save-search-scope-b",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "ScopeCharB",
        summary: "Test",
      });

      await env.DB.prepare(
        "INSERT INTO search_index (user_uuid, save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          USER_A,
          "save-search-scope-a",
          "ScopeCharA",
          "section",
          "gear",
          "Gear",
          "Shako helmet",
        )
        .run();
      await env.DB.prepare(
        "INSERT INTO search_index (user_uuid, save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          USER_A,
          "save-search-scope-b",
          "ScopeCharB",
          "section",
          "gear",
          "Gear",
          "Shako helmet",
        )
        .run();

      // Search scoped to save A
      const result = await search(env.DB, USER_A, "Shako", "save-search-scope-a");
      const data = parseResult(result) as { results: { save_id: string }[] };
      expect(data.results).toHaveLength(1);
      expect(data.results[0]!.save_id).toBe("save-search-scope-a");
    });

    it("returns empty results for no matches", async () => {
      const result = await search(env.DB, USER_A, "nonexistenttermxyz123");
      const data = parseResult(result) as { results: unknown[] };
      expect(data.results).toEqual([]);
    });

    it("does not return results from other users", async () => {
      await seedSave({
        saveUuid: "save-search-other",
        userUuid: USER_B,
        gameId: "d2r",
        characterName: "OtherUserChar",
        summary: "Test",
      });

      await env.DB.prepare(
        "INSERT INTO search_index (user_uuid, save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          USER_B,
          "save-search-other",
          "OtherUserChar",
          "section",
          "gear",
          "Gear",
          "Unique secret item",
        )
        .run();

      const result = await search(env.DB, USER_A, "secret");
      const data = parseResult(result) as { results: unknown[] };
      expect(data.results).toEqual([]);
    });

    it("finds notes created via MCP createNote tool", async () => {
      await seedSave({
        saveUuid: "save-search-mcp-note",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "McpNoteChar",
        summary: "Test",
      });

      // Create note via MCP tool (not REST)
      const createResult = await createNote(
        env.DB,
        USER_A,
        "save-search-mcp-note",
        "Runeword Priorities",
        "Craft Enigma first, then Infinity for the mercenary",
      );
      expect(createResult.isError).toBeUndefined();

      // Search should find it
      const result = await search(env.DB, USER_A, "Infinity");
      const data = parseResult(result) as { results: { type: string; ref_title: string }[] };
      expect(data.results.length).toBeGreaterThanOrEqual(1);
      const noteResult = data.results.find((r) => r.ref_title === "Runeword Priorities");
      expect(noteResult).toBeDefined();
    });

    it("updates search index when note updated via MCP tool", async () => {
      await seedSave({
        saveUuid: "save-search-mcp-update",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "McpUpdateChar",
        summary: "Test",
      });

      const createResult = await createNote(
        env.DB,
        USER_A,
        "save-search-mcp-update",
        "Farming List",
        "Need Zod rune",
      );
      const { note_id } = parseResult(createResult) as { note_id: string };

      // Update the note content
      await updateNote(env.DB, USER_A, "save-search-mcp-update", note_id, "Need Cham rune instead");

      // Old content should not match
      const oldResult = await search(env.DB, USER_A, "Zod");
      const oldData = parseResult(oldResult) as { results: { ref_id: string }[] };
      const oldMatch = oldData.results.find((r) => r.ref_id === note_id);
      expect(oldMatch).toBeUndefined();

      // New content should match
      const newResult = await search(env.DB, USER_A, "Cham");
      const newData = parseResult(newResult) as { results: { ref_id: string }[] };
      const newMatch = newData.results.find((r) => r.ref_id === note_id);
      expect(newMatch).toBeDefined();
    });

    it("removes search index when note deleted via MCP tool", async () => {
      await seedSave({
        saveUuid: "save-search-mcp-delete",
        userUuid: USER_A,
        gameId: "d2r",
        characterName: "McpDeleteChar",
        summary: "Test",
      });

      const createResult = await createNote(
        env.DB,
        USER_A,
        "save-search-mcp-delete",
        "Temp Guide",
        "Windforce bow unique",
      );
      const { note_id } = parseResult(createResult) as { note_id: string };

      // Delete via MCP tool
      await deleteNote(env.DB, USER_A, "save-search-mcp-delete", note_id);

      // Should no longer be searchable
      const result = await search(env.DB, USER_A, "Windforce");
      const data = parseResult(result) as { results: { ref_id: string }[] };
      const match = data.results.find((r) => r.ref_id === note_id);
      expect(match).toBeUndefined();
    });
  });
}); // MCP Tools
