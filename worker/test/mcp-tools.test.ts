import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { ToolResult } from "../src/mcp/tools";
import {
  createNote,
  deleteNote,
  getNote,
  getSave,
  getSection,
  getSectionDiff,
  getSetupHelp,
  indexSaveSections,
  listGames,
  refreshSave,
  searchSaves,
  updateNote,
} from "../src/mcp/tools";

import { cleanAll } from "./helpers";

const USER_A = "mcp-user-a";
const USER_B = "mcp-user-b";

const sampleGameState = {
  identity: {
    saveName: "Hammerdin",
    gameId: "d2r",
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

/** Map user UUID to a deterministic source UUID for test consistency. */
function sourceUuidFor(userUuid: string): string {
  return `source-${userUuid}`;
}

async function ensureSource(userUuid: string): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO sources (source_uuid, user_uuid, token_hash) VALUES (?, ?, ?)",
  )
    .bind(sourceUuidFor(userUuid), userUuid, `hash-${userUuid}`)
    .run();
}

async function seedSave(options: {
  saveUuid: string;
  userUuid: string;
  gameId: string;
  gameName?: string;
  saveName: string;
  summary: string;
  lastUpdated?: string;
  gameState?: typeof sampleGameState;
}): Promise<void> {
  const lastUpdated = options.lastUpdated ?? "2026-02-25T21:30:00Z";
  const gameName = options.gameName ?? options.gameId;
  const sourceUuid = sourceUuidFor(options.userUuid);

  await ensureSource(options.userUuid);

  await env.DB.prepare(
    "INSERT INTO saves (uuid, source_uuid, game_id, game_name, save_name, summary, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      options.saveUuid,
      sourceUuid,
      options.gameId,
      gameName,
      options.saveName,
      options.summary,
      lastUpdated,
    )
    .run();

  const state = options.gameState ?? sampleGameState;
  const key = `sources/${sourceUuid}/saves/${options.saveUuid}/latest.json`;
  await env.SAVES.put(key, JSON.stringify(state));
}

async function seedSnapshot(
  userUuid: string,
  saveUuid: string,
  timestamp: string,
  gameState: typeof sampleGameState,
): Promise<void> {
  const sourceUuid = sourceUuidFor(userUuid);
  const key = `sources/${sourceUuid}/saves/${saveUuid}/snapshots/${timestamp}.json`;
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

  // ── list_games ──────────────────────────────────────────────

  interface GameEntry {
    game_id: string;
    game_name: string;
    saves: {
      save_id: string;
      name: string;
      summary: string;
      last_updated: string;
      notes: { note_id: string; title: string }[];
    }[];
    references?: { id: string; name: string; description: string; parameters?: unknown }[];
  }

  describe("listGames", () => {
    it("returns empty array when user has no saves", async () => {
      const result = await listGames(env.DB, env.PLUGINS, "no-saves-user");
      const data = parseResult(result) as { games: GameEntry[] };
      expect(data.games).toEqual([]);
    });

    it("groups saves by game_id", async () => {
      await seedSave({
        saveUuid: "save-1",
        userUuid: USER_A,
        gameId: "d2r",
        gameName: "Diablo II: Resurrected",
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
      });
      await seedSave({
        saveUuid: "save-2",
        userUuid: USER_A,
        gameId: "stardew",
        gameName: "Stardew Valley",
        saveName: "Berry Farm",
        summary: "Berry Farm, Year 3 Fall",
      });

      const result = await listGames(env.DB, env.PLUGINS, USER_A);
      const data = parseResult(result) as { games: GameEntry[] };
      expect(data.games).toHaveLength(2);

      const gameIds = data.games.map((g) => g.game_id).toSorted((a, b) => a.localeCompare(b));
      expect(gameIds).toEqual(["d2r", "stardew"]);

      const d2r = data.games.find((g) => g.game_id === "d2r")!;
      expect(d2r.game_name).toBe("Diablo II: Resurrected");
      expect(d2r.saves).toHaveLength(1);
      expect(d2r.saves[0]!.name).toBe("Hammerdin");
    });

    it("includes note titles per save", async () => {
      await seedSave({
        saveUuid: "save-notes",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89",
      });
      await seedNote("save-notes", USER_A, "note-1", "Build Guide", "## Gear section");
      await seedNote("save-notes", USER_A, "note-2", "Farming Goals", "Need Ber rune");

      const result = await listGames(env.DB, env.PLUGINS, USER_A);
      const data = parseResult(result) as { games: GameEntry[] };
      const game = data.games.find((g) => g.game_id === "d2r")!;
      const save = game.saves.find((s) => s.save_id === "save-notes")!;
      expect(save.notes).toHaveLength(2);

      const titles = save.notes.map((n) => n.title).toSorted((a, b) => a.localeCompare(b));
      expect(titles).toEqual(["Build Guide", "Farming Goals"]);
    });

    it("isolates saves by user", async () => {
      await seedSave({
        saveUuid: "save-mine",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Paladin, Level 89",
      });
      await seedSave({
        saveUuid: "save-other",
        userUuid: USER_B,
        gameId: "d2r",
        saveName: "Blizzard Sorc",
        summary: "Sorceress, Level 80",
      });

      const result = await listGames(env.DB, env.PLUGINS, USER_A);
      const data = parseResult(result) as { games: GameEntry[] };
      const allSaveIds = data.games.flatMap((g) => g.saves.map((s) => s.save_id));
      expect(allSaveIds).not.toContain("save-other");
    });

    it("includes save metadata in response", async () => {
      await seedSave({
        saveUuid: "save-meta",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
        lastUpdated: "2026-02-25T21:30:00Z",
      });

      const result = await listGames(env.DB, env.PLUGINS, USER_A);
      const data = parseResult(result) as { games: GameEntry[] };
      const game = data.games.find((g) => g.game_id === "d2r")!;
      const save = game.saves.find((s) => s.save_id === "save-meta")!;
      expect(save.name).toBe("Hammerdin");
      expect(save.summary).toBe("Hammerdin, Level 89 Paladin");
      expect(save.last_updated).toBe("2026-02-25T21:30:00Z");
    });

    it("filters games by name (case-insensitive substring)", async () => {
      await seedSave({
        saveUuid: "save-filter-1",
        userUuid: USER_A,
        gameId: "d2r",
        gameName: "Diablo II: Resurrected",
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89",
      });
      await seedSave({
        saveUuid: "save-filter-2",
        userUuid: USER_A,
        gameId: "stardew",
        gameName: "Stardew Valley",
        saveName: "Berry Farm",
        summary: "Berry Farm, Year 3",
      });

      const result = await listGames(env.DB, env.PLUGINS, USER_A, "diablo");
      const data = parseResult(result) as { games: GameEntry[] };
      expect(data.games).toHaveLength(1);
      expect(data.games[0]!.game_id).toBe("d2r");
    });

    it("includes reference modules from plugin manifests", async () => {
      // Seed save so the game shows up
      await seedSave({
        saveUuid: "save-ref",
        userUuid: USER_A,
        gameId: "d2r",
        gameName: "Diablo II: Resurrected",
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89",
      });

      // Seed a manifest with reference modules
      const manifest = {
        game_id: "d2r",
        name: "Diablo II: Resurrected",
        reference: {
          modules: {
            drop_calc: {
              name: "Drop Calculator",
              description: "Compute drop probabilities for any monster, area, or boss",
              parameters: { type: "object", properties: { area: { type: "string" } } },
            },
          },
        },
      };
      await env.PLUGINS.put("plugins/d2r/manifest.json", JSON.stringify(manifest));

      const result = await listGames(env.DB, env.PLUGINS, USER_A);
      const data = parseResult(result) as { games: GameEntry[] };
      const d2r = data.games.find((g) => g.game_id === "d2r")!;
      expect(d2r.references).toBeDefined();
      expect(d2r.references).toHaveLength(1);
      expect(d2r.references![0]!.id).toBe("drop_calc");
      expect(d2r.references![0]!.name).toBe("Drop Calculator");
      expect(d2r.references![0]!.description).toContain("drop probabilities");
      expect(d2r.references![0]!.parameters).toBeDefined();
    });

    it("omits references field when no manifest exists", async () => {
      await seedSave({
        saveUuid: "save-no-manifest",
        userUuid: USER_A,
        gameId: "stardew",
        saveName: "Farm",
        summary: "Year 1",
      });

      const result = await listGames(env.DB, env.PLUGINS, USER_A);
      const data = parseResult(result) as { games: GameEntry[] };
      const stardew = data.games.find((g) => g.game_id === "stardew")!;
      expect(stardew.references).toBeUndefined();
    });
  });

  // ── get_section ─────────────────────────────────────────────

  describe("getSection", () => {
    it("returns requested section data from R2", async () => {
      await seedSave({
        saveUuid: "save-section",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Paladin, Level 89",
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-section", [
        "equipped_gear",
      ]);
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        save_id: string;
        section: string;
        data: Record<string, unknown>;
      };
      expect(data.save_id).toBe("save-section");
      expect(data.section).toBe("equipped_gear");
      expect(data.data).toBeDefined();
    });

    it("returns multiple sections when requested", async () => {
      await seedSave({
        saveUuid: "save-multi",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Paladin, Level 89",
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-multi", [
        "equipped_gear",
        "skills",
      ]);
      const data = parseResult(result) as {
        save_id: string;
        sections: Record<string, unknown>;
      };
      expect(data.save_id).toBe("save-multi");
      expect(Object.keys(data.sections)).toHaveLength(2);
      expect(data.sections).toHaveProperty("equipped_gear");
      expect(data.sections).toHaveProperty("skills");
    });

    it("returns error for non-existent section", async () => {
      await seedSave({
        saveUuid: "save-nosec",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Paladin, Level 89",
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-nosec", ["nonexistent"]);
      expect(result.isError).toBe(true);
    });

    it("rejects access to other user's save", async () => {
      await seedSave({
        saveUuid: "save-other-sec",
        userUuid: USER_B,
        gameId: "d2r",
        saveName: "BlizzSorc",
        summary: "Sorceress, Level 80",
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-other-sec", [
        "equipped_gear",
      ]);
      expect(result.isError).toBe(true);
    });

    it("stores camelCase identity from push and reads it back", async () => {
      await seedSave({
        saveUuid: "save-fmt-check",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "FormatTest",
        summary: "Format test",
      });

      const obj = await env.SAVES.get(
        `sources/${sourceUuidFor(USER_A)}/saves/save-fmt-check/latest.json`,
      );
      expect(obj).not.toBeNull();
      const data = await obj!.json<{ identity: Record<string, unknown> }>();
      expect(data.identity.gameId).toBe("d2r");
    });
  });

  // ── get_save ────────────────────────────────────────────────

  describe("getSave", () => {
    it("returns save overview with section list", async () => {
      await seedSave({
        saveUuid: "save-overview",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
      });

      const result = await getSave(env.DB, env.SAVES, USER_A, "save-overview");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        save_id: string;
        game_id: string;
        name: string;
        summary: string;
        sections: { name: string; description: string }[];
      };
      expect(data.save_id).toBe("save-overview");
      expect(data.name).toBe("Hammerdin");
      expect(data.sections.length).toBeGreaterThanOrEqual(1);
    });

    it("rejects access to other user's save", async () => {
      await seedSave({
        saveUuid: "save-other-get",
        userUuid: USER_B,
        gameId: "d2r",
        saveName: "BlizzSorc",
        summary: "Sorceress, Level 80",
      });

      const result = await getSave(env.DB, env.SAVES, USER_A, "save-other-get");
      expect(result.isError).toBe(true);
    });

    it("returns error for non-existent save", async () => {
      const result = await getSave(env.DB, env.SAVES, USER_A, "nonexistent");
      expect(result.isError).toBe(true);
    });
  });

  // ── search_saves ────────────────────────────────────────────

  describe("searchSaves", () => {
    it("finds saves by name via FTS", async () => {
      await seedSave({
        saveUuid: "save-fts-1",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Blessed Hammer Paladin, Level 89",
      });
      await indexSaveSections(env.DB, "save-fts-1", "Hammerdin", sampleGameState.sections);
      await seedSave({
        saveUuid: "save-fts-2",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "FrostSorc",
        summary: "Blizzard Sorceress, Level 80",
      });
      await indexSaveSections(env.DB, "save-fts-2", "FrostSorc", {
        character_overview: {
          description: "Level, class, difficulty, play time",
          data: { name: "FrostSorc", class: "Sorceress", level: 80, difficulty: "Hell" },
        },
      });

      const result = await searchSaves(env.DB, USER_A, "Hammerdin");
      const data = parseResult(result) as { results: { save_id: string }[] };
      expect(data.results).toHaveLength(1);
      expect(data.results[0]!.save_id).toBe("save-fts-1");
    });

    it("returns empty results for no match", async () => {
      await seedSave({
        saveUuid: "save-fts-empty",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Paladin, Level 89",
      });
      await indexSaveSections(env.DB, "save-fts-empty", "Hammerdin", sampleGameState.sections);

      const result = await searchSaves(env.DB, USER_A, "zzzznotfound");
      const data = parseResult(result) as { results: unknown[] };
      expect(data.results).toHaveLength(0);
    });

    it("isolates search results by user", async () => {
      await seedSave({
        saveUuid: "save-fts-mine",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "My paladin",
      });
      await indexSaveSections(env.DB, "save-fts-mine", "Hammerdin", sampleGameState.sections);
      await seedSave({
        saveUuid: "save-fts-theirs",
        userUuid: USER_B,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Their paladin",
      });
      await indexSaveSections(env.DB, "save-fts-theirs", "Hammerdin", sampleGameState.sections);

      const result = await searchSaves(env.DB, USER_A, "Hammerdin");
      const data = parseResult(result) as { results: { save_id: string }[] };
      const ids = data.results.map((r) => r.save_id);
      expect(ids).toContain("save-fts-mine");
      expect(ids).not.toContain("save-fts-theirs");
    });
  });

  // ── get_section_diff ────────────────────────────────────────

  describe("getSectionDiff", () => {
    it("returns diff between two snapshots", async () => {
      await seedSave({
        saveUuid: "save-diff",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "DiffChar",
        summary: "Level 89",
      });

      const olderState = {
        ...sampleGameState,
        sections: {
          ...sampleGameState.sections,
          character_overview: {
            ...sampleGameState.sections.character_overview,
            data: { name: "DiffChar", class: "Paladin", level: 88, difficulty: "Hell" },
          },
        },
      };
      const newerState = {
        ...sampleGameState,
        sections: {
          ...sampleGameState.sections,
          character_overview: {
            ...sampleGameState.sections.character_overview,
            data: { name: "DiffChar", class: "Paladin", level: 89, difficulty: "Hell" },
          },
        },
      };

      // Seed older snapshot well in the past so "1 hour" period finds it
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const justNow = new Date(now.getTime() - 1000).toISOString();
      await seedSnapshot(USER_A, "save-diff", oneHourAgo, olderState);
      await seedSnapshot(USER_A, "save-diff", justNow, newerState);

      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "save-diff",
        "character_overview",
        "2 hours",
      );
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        section: string;
        from_timestamp: string;
        to_timestamp: string;
        changes: unknown;
      };
      expect(data.section).toBe("character_overview");
      expect(data.changes).toBeTruthy();
    });

    it("returns error for non-existent save", async () => {
      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "nonexistent",
        "skills",
        "1 hour",
      );
      expect(result.isError).toBe(true);
    });
  });

  // ── Notes (MCP tool layer) ─────────────────────────────────

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

  describe("createNote", () => {
    it("creates a note for a valid save", async () => {
      await seedSave({
        saveUuid: "save-note-create",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "NoteChar",
        summary: "Level 89",
      });

      const result = await createNote(
        env.DB,
        USER_A,
        "save-note-create",
        "Build Guide",
        "# Hammerdin Build\n\n...",
      );
      expect(result.isError).toBeUndefined();
      const data = parseResult(result) as { note_id: string };
      expect(data.note_id).toBeTruthy();
    });

    it("rejects note for another user's save", async () => {
      await seedSave({
        saveUuid: "save-note-other",
        userUuid: USER_B,
        gameId: "d2r",
        saveName: "OtherChar",
        summary: "Level 80",
      });

      const result = await createNote(
        env.DB,
        USER_A,
        "save-note-other",
        "Sneaky",
        "Should not work",
      );
      expect(result.isError).toBe(true);
    });
  });

  describe("getNote", () => {
    it("returns a note by ID", async () => {
      await seedSave({
        saveUuid: "save-note-get",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "NoteGetChar",
        summary: "Level 89",
      });
      await seedNote("save-note-get", USER_A, "note-get-1", "My Note", "Some content here");

      const result = await getNote(env.DB, USER_A, "save-note-get", "note-get-1");
      expect(result.isError).toBeUndefined();
      const data = parseResult(result) as { title: string; content: string };
      expect(data.title).toBe("My Note");
      expect(data.content).toBe("Some content here");
    });
  });

  describe("updateNote", () => {
    it("updates note content", async () => {
      await seedSave({
        saveUuid: "save-note-update",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "UpdateChar",
        summary: "Level 89",
      });
      await seedNote("save-note-update", USER_A, "note-upd-1", "Original", "Original content");

      const result = await updateNote(
        env.DB,
        USER_A,
        "save-note-update",
        "note-upd-1",
        "New content",
        "Updated",
      );
      expect(result.isError).toBeUndefined();

      // Verify via getNote
      const getResult = await getNote(env.DB, USER_A, "save-note-update", "note-upd-1");
      const data = parseResult(getResult) as { title: string; content: string };
      expect(data.title).toBe("Updated");
      expect(data.content).toBe("New content");
    });
  });

  describe("deleteNote", () => {
    it("deletes a note", async () => {
      await seedSave({
        saveUuid: "save-note-del",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "DelChar",
        summary: "Level 89",
      });
      await seedNote("save-note-del", USER_A, "note-del-1", "Delete Me", "Going away");

      const result = await deleteNote(env.DB, USER_A, "save-note-del", "note-del-1");
      expect(result.isError).toBeUndefined();

      // Verify deletion
      const getResult = await getNote(env.DB, USER_A, "save-note-del", "note-del-1");
      expect(getResult.isError).toBe(true);
    });
  });

  // ── refresh_save ────────────────────────────────────────────

  describe("refreshSave", () => {
    it("returns error when save not found", async () => {
      const result = await refreshSave(env.DB, env.DAEMON_HUB, USER_A, "nonexistent");
      expect(result.isError).toBe(true);
    });

    it("returns error when no daemon is connected", async () => {
      await seedSave({
        saveUuid: "save-refresh-offline",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "OfflineChar",
        summary: "Level 89",
      });

      const result = await refreshSave(env.DB, env.DAEMON_HUB, USER_A, "save-refresh-offline");
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("daemon is offline");
    });
  });

  // ── get_setup_help ──────────────────────────────────────────

  describe("getSetupHelp", () => {
    /** Seed a source with full control over fields for setup help tests. */
    async function seedTestSource(options: {
      sourceUuid: string;
      userUuid?: string | null;
      hostname?: string;
      os?: string;
      arch?: string;
      linkCode?: string | null;
      linkCodeExpiresAt?: string | null;
      lastPushAt?: string | null;
    }): Promise<void> {
      await env.DB.prepare(
        `INSERT INTO sources (source_uuid, user_uuid, token_hash, hostname, os, arch, link_code, link_code_expires_at, last_push_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          options.sourceUuid,
          options.userUuid ?? null,
          `hash-${options.sourceUuid}`,
          options.hostname ?? null,
          options.os ?? null,
          options.arch ?? null,
          options.linkCode ?? null,
          options.linkCodeExpiresAt ?? null,
          options.lastPushAt ?? null,
        )
        .run();
    }

    // ── Source listing ──────────────────────────────────────────

    it("returns empty sources list for user with no sources", async () => {
      const result = await getSetupHelp(env.DB, USER_A);
      const data = parseResult(result) as { sources: unknown[] };
      expect(result.isError).toBeUndefined();
      expect(data.sources).toEqual([]);
    });

    it("returns linked sources with status info", async () => {
      const recentPush = new Date(Date.now() - 2 * 60_000).toISOString(); // 2 min ago
      await seedTestSource({
        sourceUuid: "dev-1",
        userUuid: USER_A,
        hostname: "gaming-pc",
        os: "linux",
        arch: "amd64",
        lastPushAt: recentPush,
      });

      const result = await getSetupHelp(env.DB, USER_A);
      const data = parseResult(result) as {
        sources: {
          source_uuid: string;
          hostname: string;
          os: string;
          arch: string;
          linked: boolean;
          last_active: string;
          activity: string;
        }[];
      };
      expect(data.sources).toHaveLength(1);
      expect(data.sources[0]!.source_uuid).toBe("dev-1");
      expect(data.sources[0]!.hostname).toBe("gaming-pc");
      expect(data.sources[0]!.os).toBe("linux");
      expect(data.sources[0]!.linked).toBe(true);
      expect(data.sources[0]!.activity).toBe("active");
    });

    it("derives activity status from last_push_at thresholds", async () => {
      // active: within 5 min
      await seedTestSource({
        sourceUuid: "dev-active",
        userUuid: USER_A,
        lastPushAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      });
      // recently_active: within 1 hour
      await seedTestSource({
        sourceUuid: "dev-recent",
        userUuid: USER_A,
        lastPushAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      });
      // inactive: older than 1 hour
      await seedTestSource({
        sourceUuid: "dev-inactive",
        userUuid: USER_A,
        lastPushAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      });
      // never_pushed: null
      await seedTestSource({
        sourceUuid: "dev-never",
        userUuid: USER_A,
        lastPushAt: null,
      });

      const result = await getSetupHelp(env.DB, USER_A);
      const data = parseResult(result) as {
        sources: { source_uuid: string; activity: string }[];
      };

      const byId = new Map(data.sources.map((d) => [d.source_uuid, d.activity]));
      expect(byId.get("dev-active")).toBe("active");
      expect(byId.get("dev-recent")).toBe("recently_active");
      expect(byId.get("dev-inactive")).toBe("inactive");
      expect(byId.get("dev-never")).toBe("never_pushed");
    });

    it("does not return other users' sources", async () => {
      await seedTestSource({ sourceUuid: "dev-a", userUuid: USER_A });
      await seedTestSource({ sourceUuid: "dev-b", userUuid: USER_B });

      const result = await getSetupHelp(env.DB, USER_A);
      const data = parseResult(result) as {
        sources: { source_uuid: string }[];
      };
      const ids = data.sources.map((d) => d.source_uuid);
      expect(ids).toContain("dev-a");
      expect(ids).not.toContain("dev-b");
    });

    // ── Link code lookup ────────────────────────────────────────

    it("looks up a valid unexpired link code", async () => {
      const expires = new Date(Date.now() + 10 * 60_000).toISOString();
      await seedTestSource({
        sourceUuid: "dev-code",
        userUuid: null,
        hostname: "new-laptop",
        os: "windows",
        arch: "amd64",
        linkCode: "482913",
        linkCodeExpiresAt: expires,
        lastPushAt: new Date(Date.now() - 60_000).toISOString(),
      });

      const result = await getSetupHelp(env.DB, USER_A, undefined, "482913");
      const data = parseResult(result) as {
        lookup: {
          found: boolean;
          source_uuid: string;
          hostname: string;
          os: string;
          linked: boolean;
          link_code_valid: boolean;
          activity: string;
        };
      };
      expect(data.lookup.found).toBe(true);
      expect(data.lookup.source_uuid).toBe("dev-code");
      expect(data.lookup.hostname).toBe("new-laptop");
      expect(data.lookup.os).toBe("windows");
      expect(data.lookup.linked).toBe(false);
      expect(data.lookup.link_code_valid).toBe(true);
      expect(data.lookup.activity).toBe("active");
    });

    it("reports expired link code", async () => {
      const expired = new Date(Date.now() - 5 * 60_000).toISOString();
      await seedTestSource({
        sourceUuid: "dev-expired",
        linkCode: "111111",
        linkCodeExpiresAt: expired,
      });

      const result = await getSetupHelp(env.DB, USER_A, undefined, "111111");
      const data = parseResult(result) as {
        lookup: { found: boolean; link_code_valid: boolean };
      };
      expect(data.lookup.found).toBe(true);
      expect(data.lookup.link_code_valid).toBe(false);
    });

    it("reports nonexistent link code", async () => {
      const result = await getSetupHelp(env.DB, USER_A, undefined, "999999");
      const data = parseResult(result) as {
        lookup: { found: boolean };
      };
      expect(data.lookup.found).toBe(false);
    });

    it("does not leak user info for already-linked source via code", async () => {
      const expires = new Date(Date.now() + 10 * 60_000).toISOString();
      await env.DB.prepare(
        `INSERT INTO sources (source_uuid, user_uuid, user_email, user_display_name, token_hash, link_code, link_code_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind("dev-linked", USER_B, "secret@example.com", "Secret User", "hash-linked", "222222", expires)
        .run();

      const result = await getSetupHelp(env.DB, USER_A, undefined, "222222");
      const data = parseResult(result) as { lookup: Record<string, unknown> };
      expect(data.lookup.found).toBe(true);
      expect(data.lookup.linked).toBe(true);
      // Must NOT contain user PII
      expect(data.lookup).not.toHaveProperty("user_uuid");
      expect(data.lookup).not.toHaveProperty("user_email");
      expect(data.lookup).not.toHaveProperty("user_display_name");
      const json = JSON.stringify(data.lookup);
      expect(json).not.toContain("secret@example.com");
      expect(json).not.toContain("Secret User");
    });

    // ── Source UUID lookup ──────────────────────────────────────

    it("looks up source by UUID", async () => {
      await seedTestSource({
        sourceUuid: "dev-lookup",
        userUuid: null,
        hostname: "my-pc",
        os: "linux",
        arch: "arm64",
      });

      const result = await getSetupHelp(env.DB, USER_A, undefined, undefined, "dev-lookup");
      const data = parseResult(result) as {
        lookup: { found: boolean; source_uuid: string; hostname: string };
      };
      expect(data.lookup.found).toBe(true);
      expect(data.lookup.source_uuid).toBe("dev-lookup");
      expect(data.lookup.hostname).toBe("my-pc");
    });

    it("reports nonexistent source UUID", async () => {
      const result = await getSetupHelp(env.DB, USER_A, undefined, undefined, "nonexistent");
      const data = parseResult(result) as { lookup: { found: boolean } };
      expect(data.lookup.found).toBe(false);
    });

    // ── Installation guide ──────────────────────────────────────

    it("returns full guide for all platforms when no platform specified", async () => {
      const result = await getSetupHelp(env.DB, USER_A);
      const data = parseResult(result) as {
        guide: {
          linux: { install: string; details: string };
          windows: { install: string; details: string };
          macos: { install: null; details: string };
          pairing: string;
        };
      };
      expect(data.guide.linux.install).toContain("curl");
      expect(data.guide.linux.install).toContain("install.savecraft.gg");
      expect(data.guide.windows.install).toContain("install.savecraft.gg");
      expect(data.guide.macos.install).toBeNull();
      expect(data.guide.macos.details).toContain("not yet available");
      expect(data.guide.pairing).toContain("6-digit");
      expect(data.guide.pairing).toContain("savecraft.gg/setup");
    });

    it("filters guide to requested platform", async () => {
      const result = await getSetupHelp(env.DB, USER_A, "linux");
      const data = parseResult(result) as {
        guide: Record<string, unknown>;
      };
      expect(data.guide).toHaveProperty("linux");
      expect(data.guide).toHaveProperty("pairing");
      expect(data.guide).not.toHaveProperty("windows");
      expect(data.guide).not.toHaveProperty("macos");
    });

    it("always includes pairing instructions regardless of platform", async () => {
      const result = await getSetupHelp(env.DB, USER_A, "windows");
      const data = parseResult(result) as {
        guide: { pairing: string };
      };
      expect(data.guide.pairing).toBeTruthy();
    });

    // ── Edge cases ────────────────────────────────────────────

    it("omits lookup field when neither link_code nor source_uuid provided", async () => {
      const result = await getSetupHelp(env.DB, USER_A);
      const data = parseResult(result) as Record<string, unknown>;
      expect(data).not.toHaveProperty("lookup");
    });

    it("prefers source_uuid over link_code when both provided", async () => {
      const expires = new Date(Date.now() + 10 * 60_000).toISOString();
      await seedTestSource({
        sourceUuid: "dev-by-uuid",
        hostname: "uuid-host",
        linkCode: "333333",
        linkCodeExpiresAt: expires,
      });
      await seedTestSource({
        sourceUuid: "dev-by-code",
        hostname: "code-host",
        linkCode: "444444",
        linkCodeExpiresAt: expires,
      });

      // Pass both — source_uuid should win
      const result = await getSetupHelp(env.DB, USER_A, undefined, "444444", "dev-by-uuid");
      const data = parseResult(result) as {
        lookup: { source_uuid: string; hostname: string };
      };
      expect(data.lookup.source_uuid).toBe("dev-by-uuid");
      expect(data.lookup.hostname).toBe("uuid-host");
    });

    it("returns all platforms for invalid platform value", async () => {
      const result = await getSetupHelp(env.DB, USER_A, "android");
      const data = parseResult(result) as {
        guide: Record<string, unknown>;
      };
      expect(data.guide).toHaveProperty("linux");
      expect(data.guide).toHaveProperty("windows");
      expect(data.guide).toHaveProperty("macos");
      expect(data.guide).toHaveProperty("pairing");
    });

    it("never includes token_hash in lookup response", async () => {
      await seedTestSource({
        sourceUuid: "dev-secret",
        linkCode: "555555",
        linkCodeExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });

      const result = await getSetupHelp(env.DB, USER_A, undefined, "555555");
      const json = JSON.stringify(parseResult(result));
      expect(json).not.toContain("token_hash");
      expect(json).not.toContain(`hash-dev-secret`);
    });
  });
}); // MCP Tools
