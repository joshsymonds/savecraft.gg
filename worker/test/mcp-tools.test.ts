import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { ToolResult } from "../src/mcp/tools";
import {
  createNote,
  deleteNote,
  getInfo,
  getNote,
  getSave,
  getSection,
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
    "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      options.saveUuid,
      options.userUuid,
      options.gameId,
      gameName,
      options.saveName,
      options.summary,
      lastUpdated,
      sourceUuid,
    )
    .run();

  const state = options.gameState ?? sampleGameState;
  const sectionBatch: D1PreparedStatement[] = [];
  for (const [name, section] of Object.entries(state.sections)) {
    sectionBatch.push(
      env.DB.prepare(
        "INSERT OR REPLACE INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
      ).bind(options.saveUuid, name, section.description, JSON.stringify(section.data)),
    );
  }
  if (sectionBatch.length > 0) {
    await env.DB.batch(sectionBatch);
  }
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
    removed_saves?: string[];
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
    it("returns requested section data from D1", async () => {
      await seedSave({
        saveUuid: "save-section",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Paladin, Level 89",
      });

      const result = await getSection(env.DB, USER_A, "save-section", ["equipped_gear"]);
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

      const result = await getSection(env.DB, USER_A, "save-multi", ["equipped_gear", "skills"]);
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

      const result = await getSection(env.DB, USER_A, "save-nosec", ["nonexistent"]);
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

      const result = await getSection(env.DB, USER_A, "save-other-sec", ["equipped_gear"]);
      expect(result.isError).toBe(true);
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

      const result = await getSave(env.DB, USER_A, "save-overview");
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

      const result = await getSave(env.DB, USER_A, "save-other-get");
      expect(result.isError).toBe(true);
    });

    it("returns error for non-existent save", async () => {
      const result = await getSave(env.DB, USER_A, "nonexistent");
      expect(result.isError).toBe(true);
    });

    it("includes refresh_status and refresh_error for adapter saves", async () => {
      await seedSave({
        saveUuid: "save-refresh-status",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "RefreshTest",
        summary: "Refresh status test",
      });
      // Set refresh status directly in D1
      await env.DB.prepare(
        "UPDATE saves SET refresh_status = 'error', refresh_error = 'token_expired: Token expired' WHERE uuid = ?",
      )
        .bind("save-refresh-status")
        .run();

      const result = await getSave(env.DB, USER_A, "save-refresh-status");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        refresh_status?: string;
        refresh_error?: string;
      };
      expect(data.refresh_status).toBe("error");
      expect(data.refresh_error).toBe("token_expired: Token expired");
    });

    it("omits refresh fields when refresh_status is null", async () => {
      await seedSave({
        saveUuid: "save-no-refresh",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "NoRefreshTest",
        summary: "No refresh status",
      });

      const result = await getSave(env.DB, USER_A, "save-no-refresh");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        refresh_status?: string;
        refresh_error?: string;
      };
      expect(data.refresh_status).toBeUndefined();
      expect(data.refresh_error).toBeUndefined();
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
      const result = await refreshSave(env, USER_A, "nonexistent");
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

      const result = await refreshSave(env, USER_A, "save-refresh-offline");
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("daemon is offline");
    });

    it("rate limits adapter-backed saves", async () => {
      // Create adapter source
      const sourceUuid = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind, can_rescan, can_receive_config) VALUES (?, ?, ?, 'adapter', 0, 0)",
      )
        .bind(sourceUuid, USER_A, `hash-adapter-${USER_A}`)
        .run();

      // Create save with recent last_updated (within 5 min cooldown)
      const recentTimestamp = new Date(Date.now() - 60_000).toISOString();
      await env.DB.prepare(
        "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          "save-adapter-rate",
          USER_A,
          "wow",
          "World of Warcraft",
          "Dratnos-tichondrius-US",
          "Level 80 Rogue",
          recentTimestamp,
          sourceUuid,
        )
        .run();

      const result = await refreshSave(env, USER_A, "save-adapter-rate");
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("refreshed recently");
    });

    it("returns error when adapter save has no realm info", async () => {
      // Create adapter source
      const sourceUuid = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind, can_rescan, can_receive_config) VALUES (?, ?, ?, 'adapter', 0, 0)",
      )
        .bind(sourceUuid, USER_A, `hash-adapter2-${USER_A}`)
        .run();

      // Create save with old timestamp (outside cooldown) and unparseable name
      await env.DB.prepare(
        "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          "save-adapter-norealm",
          USER_A,
          "wow",
          "World of Warcraft",
          "BadName",
          "",
          "2020-01-01T00:00:00Z",
          sourceUuid,
        )
        .run();

      const result = await refreshSave(env, USER_A, "save-adapter-norealm");
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("realm");
    });
  });

  // ── get_savecraft_info ──────────────────────────────────────

  describe("getInfo", () => {
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
      const result = await getInfo(env, USER_A);
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

      const result = await getInfo(env, USER_A);
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

      const result = await getInfo(env, USER_A);
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

      const result = await getInfo(env, USER_A);
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

      const result = await getInfo(env, USER_A, undefined, undefined, "482913");
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

      const result = await getInfo(env, USER_A, undefined, undefined, "111111");
      const data = parseResult(result) as {
        lookup: { found: boolean; link_code_valid: boolean };
      };
      expect(data.lookup.found).toBe(true);
      expect(data.lookup.link_code_valid).toBe(false);
    });

    it("reports nonexistent link code", async () => {
      const result = await getInfo(env, USER_A, undefined, undefined, "999999");
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
        .bind(
          "dev-linked",
          USER_B,
          "secret@example.com",
          "Secret User",
          "hash-linked",
          "222222",
          expires,
        )
        .run();

      const result = await getInfo(env, USER_A, undefined, undefined, "222222");
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

      const result = await getInfo(env, USER_A, undefined, undefined, undefined, "dev-lookup");
      const data = parseResult(result) as {
        lookup: { found: boolean; source_uuid: string; hostname: string };
      };
      expect(data.lookup.found).toBe(true);
      expect(data.lookup.source_uuid).toBe("dev-lookup");
      expect(data.lookup.hostname).toBe("my-pc");
    });

    it("reports nonexistent source UUID", async () => {
      const result = await getInfo(env, USER_A, undefined, undefined, undefined, "nonexistent");
      const data = parseResult(result) as { lookup: { found: boolean } };
      expect(data.lookup.found).toBe(false);
    });

    // ── Installation guide ──────────────────────────────────────

    it("returns full guide for all platforms when no platform specified", async () => {
      const result = await getInfo(env, USER_A, "setup");
      const data = parseResult(result) as {
        setup: {
          linux: { install: string; details: string };
          windows: { install: string; details: string };
          macos: { install: null; details: string };
          pairing: string;
        };
      };
      expect(data.setup.linux.install).toContain("curl");
      expect(data.setup.linux.install).toContain("install.savecraft.gg");
      expect(data.setup.windows.install).toContain("install.savecraft.gg");
      expect(data.setup.macos.install).toBeNull();
      expect(data.setup.macos.details).toContain("not yet available");
      expect(data.setup.pairing).toContain("6-digit");
      expect(data.setup.pairing).toContain("savecraft.gg");
    });

    it("filters guide to requested platform", async () => {
      const result = await getInfo(env, USER_A, "setup", "linux");
      const data = parseResult(result) as {
        setup: Record<string, unknown>;
      };
      expect(data.setup).toHaveProperty("linux");
      expect(data.setup).toHaveProperty("pairing");
      expect(data.setup).not.toHaveProperty("windows");
      expect(data.setup).not.toHaveProperty("macos");
    });

    it("always includes pairing instructions regardless of platform", async () => {
      const result = await getInfo(env, USER_A, "setup", "windows");
      const data = parseResult(result) as {
        setup: { pairing: string };
      };
      expect(data.setup.pairing).toBeTruthy();
    });

    // ── Edge cases ────────────────────────────────────────────

    it("omits lookup field when neither link_code nor source_uuid provided", async () => {
      const result = await getInfo(env, USER_A);
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
      const result = await getInfo(env, USER_A, undefined, undefined, "444444", "dev-by-uuid");
      const data = parseResult(result) as {
        lookup: { source_uuid: string; hostname: string };
      };
      expect(data.lookup.source_uuid).toBe("dev-by-uuid");
      expect(data.lookup.hostname).toBe("uuid-host");
    });

    it("returns all platforms for invalid platform value", async () => {
      const result = await getInfo(env, USER_A, "setup", "android");
      const data = parseResult(result) as {
        setup: Record<string, unknown>;
      };
      expect(data.setup).toHaveProperty("linux");
      expect(data.setup).toHaveProperty("windows");
      expect(data.setup).toHaveProperty("macos");
      expect(data.setup).toHaveProperty("pairing");
    });

    it("never includes token_hash in lookup response", async () => {
      await seedTestSource({
        sourceUuid: "dev-secret",
        linkCode: "555555",
        linkCodeExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });

      const result = await getInfo(env, USER_A, undefined, undefined, "555555");
      const json = JSON.stringify(parseResult(result));
      expect(json).not.toContain("token_hash");
      expect(json).not.toContain(`hash-dev-secret`);
    });

    // ── Adapter helpers ─────────────────────────────────────

    /** Seed an adapter source (source_kind='adapter'). */
    async function seedAdapterSource(options: {
      sourceUuid: string;
      userUuid: string;
      lastPushAt?: string | null;
    }): Promise<void> {
      await env.DB.prepare(
        `INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind, can_rescan, can_receive_config, last_push_at)
         VALUES (?, ?, ?, 'adapter', 0, 0, ?)`,
      )
        .bind(
          options.sourceUuid,
          options.userUuid,
          `hash-${options.sourceUuid}`,
          options.lastPushAt ?? null,
        )
        .run();
    }

    /** Seed game credentials for a user. */
    async function seedGameCredentials(options: {
      userUuid: string;
      gameId: string;
      expiresAt: string;
    }): Promise<void> {
      await env.DB.prepare(
        `INSERT INTO game_credentials (user_uuid, game_id, access_token, refresh_token, expires_at)
         VALUES (?, ?, 'tok', 'ref', ?)`,
      )
        .bind(options.userUuid, options.gameId, options.expiresAt)
        .run();
    }

    // ── Context-aware guide ─────────────────────────────────

    it("includes adapter guide when user has only adapter sources", async () => {
      await seedAdapterSource({ sourceUuid: "adapter-guide", userUuid: USER_A });
      await env.PLUGINS.put(
        "plugins/wow/manifest.json",
        JSON.stringify({ game_id: "wow", name: "World of Warcraft", source: "api" }),
      );

      const result = await getInfo(env, USER_A, "setup");
      const data = parseResult(result) as { setup: Record<string, unknown> };
      expect(data.setup).toHaveProperty("api_games");
      expect(data.setup).not.toHaveProperty("linux");
      expect(data.setup).not.toHaveProperty("windows");
      expect(data.setup).not.toHaveProperty("pairing");
    });

    it("includes only daemon guide when user has only daemon sources", async () => {
      await seedTestSource({
        sourceUuid: "daemon-guide",
        userUuid: USER_A,
        hostname: "gaming-pc",
      });

      const result = await getInfo(env, USER_A, "setup");
      const data = parseResult(result) as { setup: Record<string, unknown> };
      expect(data.setup).toHaveProperty("linux");
      expect(data.setup).toHaveProperty("pairing");
      expect(data.setup).not.toHaveProperty("api_games");
    });

    it("includes both guides when user has both source types", async () => {
      await seedTestSource({
        sourceUuid: "daemon-both",
        userUuid: USER_A,
        hostname: "gaming-pc",
      });
      await seedAdapterSource({ sourceUuid: "adapter-both", userUuid: USER_A });
      await env.PLUGINS.put(
        "plugins/wow/manifest.json",
        JSON.stringify({ game_id: "wow", name: "World of Warcraft", source: "api" }),
      );

      const result = await getInfo(env, USER_A, "setup");
      const data = parseResult(result) as { setup: Record<string, unknown> };
      expect(data.setup).toHaveProperty("linux");
      expect(data.setup).toHaveProperty("pairing");
      expect(data.setup).toHaveProperty("api_games");
    });

    it("includes both guides when user has no sources", async () => {
      await env.PLUGINS.put(
        "plugins/wow/manifest.json",
        JSON.stringify({ game_id: "wow", name: "World of Warcraft", source: "api" }),
      );

      const result = await getInfo(env, USER_A, "setup");
      const data = parseResult(result) as { setup: Record<string, unknown> };
      expect(data.setup).toHaveProperty("linux");
      expect(data.setup).toHaveProperty("pairing");
      expect(data.setup).toHaveProperty("api_games");
    });

    it("adapter guide lists available API games from R2 manifests", async () => {
      await seedAdapterSource({ sourceUuid: "adapter-list", userUuid: USER_A });
      await env.PLUGINS.put(
        "plugins/wow/manifest.json",
        JSON.stringify({ game_id: "wow", name: "World of Warcraft", source: "api" }),
      );

      const result = await getInfo(env, USER_A, "setup");
      const data = parseResult(result) as {
        setup: {
          api_games: { setup: string; available_games: { game_id: string; name: string }[] };
        };
      };
      expect(data.setup.api_games.available_games).toContainEqual({
        game_id: "wow",
        name: "World of Warcraft",
      });
      expect(data.setup.api_games.setup).toContain("OAuth");
    });

    it("adapter guide does not list non-API games", async () => {
      await seedAdapterSource({ sourceUuid: "adapter-nolist", userUuid: USER_A });
      await env.PLUGINS.put(
        "plugins/d2r/manifest.json",
        JSON.stringify({ game_id: "d2r", name: "Diablo II: Resurrected" }),
      );

      const result = await getInfo(env, USER_A, "setup");
      const data = parseResult(result) as { setup: Record<string, unknown> };
      // No api games found in manifests, so no api_games section even for adapter source
      expect(data.setup).not.toHaveProperty("api_games");
    });

    // ── Adapter source support ────────────────────────────────

    it("returns source_kind for daemon sources", async () => {
      await seedTestSource({
        sourceUuid: "dev-daemon",
        userUuid: USER_A,
        hostname: "gaming-pc",
        os: "linux",
        arch: "amd64",
      });

      const result = await getInfo(env, USER_A);
      const data = parseResult(result) as {
        sources: { source_uuid: string; source_kind: string }[];
      };
      expect(data.sources[0]!.source_kind).toBe("daemon");
    });

    it("returns source_kind='adapter' for adapter sources", async () => {
      await seedAdapterSource({ sourceUuid: "adapter-1", userUuid: USER_A });

      const result = await getInfo(env, USER_A);
      const data = parseResult(result) as {
        sources: { source_uuid: string; source_kind: string }[];
      };
      expect(data.sources[0]!.source_kind).toBe("adapter");
    });

    it("returns adapter_credentials with connected status for valid token", async () => {
      await seedAdapterSource({ sourceUuid: "adapter-cred", userUuid: USER_A });
      const futureExpiry = new Date(Date.now() + 3_600_000).toISOString();
      await seedGameCredentials({
        userUuid: USER_A,
        gameId: "wow",
        expiresAt: futureExpiry,
      });

      const result = await getInfo(env, USER_A);
      const data = parseResult(result) as {
        sources: {
          source_uuid: string;
          adapter_credentials: { game_id: string; status: string }[];
        }[];
      };
      const source = data.sources.find((s) => s.source_uuid === "adapter-cred")!;
      expect(source.adapter_credentials).toHaveLength(1);
      expect(source.adapter_credentials[0]!.game_id).toBe("wow");
      expect(source.adapter_credentials[0]!.status).toBe("connected");
    });

    it("returns adapter_credentials with expired status for expired token", async () => {
      await seedAdapterSource({ sourceUuid: "adapter-exp", userUuid: USER_A });
      const pastExpiry = new Date(Date.now() - 3_600_000).toISOString();
      await seedGameCredentials({
        userUuid: USER_A,
        gameId: "wow",
        expiresAt: pastExpiry,
      });

      const result = await getInfo(env, USER_A);
      const data = parseResult(result) as {
        sources: {
          source_uuid: string;
          adapter_credentials: { game_id: string; status: string }[];
        }[];
      };
      const source = data.sources.find((s) => s.source_uuid === "adapter-exp")!;
      expect(source.adapter_credentials[0]!.status).toBe("expired");
    });

    it("returns adapter_credentials with missing status when game linked but no credentials", async () => {
      await seedAdapterSource({ sourceUuid: "adapter-miss", userUuid: USER_A });
      // Linked character exists but no game_credentials row
      await env.DB.prepare(
        `INSERT INTO linked_characters (user_uuid, game_id, character_id, character_name, source_uuid)
         VALUES (?, 'wow', 'char-1', 'Thrall', ?)`,
      )
        .bind(USER_A, "adapter-miss")
        .run();

      const result = await getInfo(env, USER_A);
      const data = parseResult(result) as {
        sources: {
          source_uuid: string;
          adapter_credentials: { game_id: string; status: string }[];
        }[];
      };
      const source = data.sources.find((s) => s.source_uuid === "adapter-miss")!;
      expect(source.adapter_credentials).toHaveLength(1);
      expect(source.adapter_credentials[0]!.game_id).toBe("wow");
      expect(source.adapter_credentials[0]!.status).toBe("missing");
    });

    it("returns multiple adapter_credentials for multiple games", async () => {
      await seedAdapterSource({ sourceUuid: "adapter-multi", userUuid: USER_A });
      const futureExpiry = new Date(Date.now() + 3_600_000).toISOString();
      const pastExpiry = new Date(Date.now() - 3_600_000).toISOString();
      await seedGameCredentials({
        userUuid: USER_A,
        gameId: "wow",
        expiresAt: futureExpiry,
      });
      await seedGameCredentials({
        userUuid: USER_A,
        gameId: "ffxiv",
        expiresAt: pastExpiry,
      });

      const result = await getInfo(env, USER_A);
      const data = parseResult(result) as {
        sources: {
          source_uuid: string;
          adapter_credentials: { game_id: string; status: string }[];
        }[];
      };
      const source = data.sources.find((s) => s.source_uuid === "adapter-multi")!;
      expect(source.adapter_credentials).toHaveLength(2);
      const byGame = new Map(source.adapter_credentials.map((c) => [c.game_id, c.status]));
      expect(byGame.get("wow")).toBe("connected");
      expect(byGame.get("ffxiv")).toBe("expired");
    });

    it("does not include adapter_credentials for daemon sources", async () => {
      await seedTestSource({
        sourceUuid: "dev-no-creds",
        userUuid: USER_A,
        hostname: "gaming-pc",
      });

      const result = await getInfo(env, USER_A);
      const data = parseResult(result) as {
        sources: { source_uuid: string; adapter_credentials?: unknown }[];
      };
      const source = data.sources.find((s) => s.source_uuid === "dev-no-creds")!;
      expect(source.adapter_credentials).toBeUndefined();
    });

    it("returns source_kind in lookup result", async () => {
      await seedAdapterSource({ sourceUuid: "adapter-lookup", userUuid: USER_A });

      const result = await getInfo(env, USER_A, undefined, undefined, undefined, "adapter-lookup");
      const data = parseResult(result) as {
        lookup: { found: boolean; source_kind: string };
      };
      expect(data.lookup.found).toBe(true);
      expect(data.lookup.source_kind).toBe("adapter");
    });

    // ── Category-based progressive disclosure ────────────────

    it("returns categories menu when no category specified", async () => {
      const result = await getInfo(env, USER_A);
      const data = parseResult(result) as {
        sources: unknown[];
        categories: Record<string, { description: string }>;
      };
      expect(data.categories).toHaveProperty("games");
      expect(data.categories).toHaveProperty("setup");
      expect(data.categories).toHaveProperty("privacy");
      expect(data.categories).toHaveProperty("about");
      expect(data.categories.games!.description).toBeTruthy();
      expect(data.categories.setup!.description).toBeTruthy();
      // Default should NOT include guide/setup/privacy/about/games content
      expect(data).not.toHaveProperty("games");
      expect(data).not.toHaveProperty("setup");
      expect(data).not.toHaveProperty("privacy");
      expect(data).not.toHaveProperty("about");
    });

    it("returns all supported games for category='games'", async () => {
      await env.PLUGINS.put(
        "plugins/d2r/manifest.json",
        JSON.stringify({
          game_id: "d2r",
          name: "Diablo II: Resurrected",
          source: "wasm",
          description: "Parses D2R save files",
          channel: "beta",
          coverage: "partial",
          limitations: ["No shared stash"],
        }),
      );
      await env.PLUGINS.put(
        "plugins/wow/manifest.json",
        JSON.stringify({
          game_id: "wow",
          name: "World of Warcraft",
          source: "api",
          description: "Battle.net API integration",
          channel: "beta",
          coverage: "partial",
        }),
      );
      await env.PLUGINS.put(
        "plugins/rimworld/manifest.json",
        JSON.stringify({
          game_id: "rimworld",
          name: "RimWorld",
          source: "mod",
          description: "In-game Harmony mod",
          channel: "alpha",
          coverage: "full",
        }),
      );

      const result = await getInfo(env, USER_A, "games");
      const data = parseResult(result) as {
        sources: unknown[];
        games: {
          game_id: string;
          name: string;
          description: string;
          source: string;
          channel: string;
          coverage: string;
          limitations: string[];
          setup: string;
        }[];
      };
      expect(data.games).toHaveLength(3);
      // Sorted alphabetically by name
      expect(data.games[0]!.name).toBe("Diablo II: Resurrected");
      expect(data.games[1]!.name).toBe("RimWorld");
      expect(data.games[2]!.name).toBe("World of Warcraft");
      // Should NOT include other category content
      expect(data).not.toHaveProperty("categories");
      expect(data).not.toHaveProperty("setup");
      expect(data).not.toHaveProperty("privacy");
    });

    it("games category includes per-source-type setup instructions", async () => {
      await env.PLUGINS.put(
        "plugins/d2r/manifest.json",
        JSON.stringify({ game_id: "d2r", name: "D2R", source: "wasm" }),
      );
      await env.PLUGINS.put(
        "plugins/wow/manifest.json",
        JSON.stringify({ game_id: "wow", name: "WoW", source: "api" }),
      );
      await env.PLUGINS.put(
        "plugins/rimworld/manifest.json",
        JSON.stringify({ game_id: "rimworld", name: "RimWorld", source: "mod" }),
      );

      const result = await getInfo(env, USER_A, "games");
      const data = parseResult(result) as {
        games: { game_id: string; source: string; setup: string }[];
      };
      const d2r = data.games.find((g) => g.game_id === "d2r")!;
      const wow = data.games.find((g) => g.game_id === "wow")!;
      const rimworld = data.games.find((g) => g.game_id === "rimworld")!;

      expect(d2r.setup).toContain("daemon");
      expect(wow.setup).toContain("OAuth");
      expect(rimworld.setup).toContain("Steam Workshop");
    });

    it("games category returns empty array when no manifests exist", async () => {
      const result = await getInfo(env, USER_A, "games");
      const data = parseResult(result) as { games: unknown[] };
      expect(data.games).toEqual([]);
    });

    it("games category includes full metadata from manifests", async () => {
      await env.PLUGINS.put(
        "plugins/d2r/manifest.json",
        JSON.stringify({
          game_id: "d2r",
          name: "Diablo II: Resurrected",
          source: "wasm",
          description: "Parses D2R save files",
          channel: "beta",
          coverage: "partial",
          limitations: ["No shared stash", "No ladder data"],
        }),
      );

      const result = await getInfo(env, USER_A, "games");
      const data = parseResult(result) as {
        games: {
          game_id: string;
          description: string;
          channel: string;
          coverage: string;
          limitations: string[];
        }[];
      };
      const d2r = data.games.find((g) => g.game_id === "d2r")!;
      expect(d2r.description).toBe("Parses D2R save files");
      expect(d2r.channel).toBe("beta");
      expect(d2r.coverage).toBe("partial");
      expect(d2r.limitations).toEqual(["No shared stash", "No ladder data"]);
    });

    it("returns privacy info for category='privacy'", async () => {
      const result = await getInfo(env, USER_A, "privacy");
      const data = parseResult(result) as {
        sources: unknown[];
        privacy: string;
      };
      expect(data.privacy).toContain("open source");
      expect(data.privacy).toContain("savecraft.gg/privacy");
      expect(data.privacy).toContain("do not sell");
      // Should NOT include categories menu or other sections
      expect(data).not.toHaveProperty("categories");
      expect(data).not.toHaveProperty("setup");
      expect(data).not.toHaveProperty("about");
    });

    it("returns about info for category='about'", async () => {
      const result = await getInfo(env, USER_A, "about");
      const data = parseResult(result) as {
        sources: unknown[];
        about: string;
      };
      expect(data.about).toContain("github.com/joshsymonds/savecraft.gg");
      expect(data.about).toContain("Josh Symonds");
      expect(data.about).toContain("open source");
      expect(data).not.toHaveProperty("categories");
      expect(data).not.toHaveProperty("setup");
      expect(data).not.toHaveProperty("privacy");
    });

    it("returns setup guide for category='setup'", async () => {
      const result = await getInfo(env, USER_A, "setup");
      const data = parseResult(result) as {
        sources: unknown[];
        setup: Record<string, unknown>;
      };
      expect(data.setup).toHaveProperty("linux");
      expect(data.setup).toHaveProperty("pairing");
      expect(data).not.toHaveProperty("categories");
      expect(data).not.toHaveProperty("privacy");
      expect(data).not.toHaveProperty("about");
    });

    it("always returns sources regardless of category", async () => {
      await seedTestSource({
        sourceUuid: "dev-cat",
        userUuid: USER_A,
        hostname: "gaming-pc",
      });

      for (const category of [undefined, "setup", "privacy", "about"]) {
        const result = await getInfo(env, USER_A, category);
        const data = parseResult(result) as { sources: { source_uuid: string }[] };
        expect(data.sources).toHaveLength(1);
        expect(data.sources[0]!.source_uuid).toBe("dev-cat");
      }
    });

    it("returns only sources for unknown category", async () => {
      const result = await getInfo(env, USER_A, "nonexistent");
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.sources).toBeDefined();
      expect(data).not.toHaveProperty("categories");
      expect(data).not.toHaveProperty("setup");
      expect(data).not.toHaveProperty("privacy");
      expect(data).not.toHaveProperty("about");
    });

    it("lookup works with any category", async () => {
      await seedTestSource({
        sourceUuid: "dev-cat-lookup",
        hostname: "my-pc",
        linkCode: "777777",
        linkCodeExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });

      const result = await getInfo(env, USER_A, "privacy", undefined, "777777");
      const data = parseResult(result) as {
        privacy: string;
        lookup: { found: boolean; source_uuid: string };
      };
      expect(data.privacy).toBeTruthy();
      expect(data.lookup.found).toBe(true);
      expect(data.lookup.source_uuid).toBe("dev-cat-lookup");
    });
  });
  describe("removed saves", () => {
    it("list_games excludes removed saves", async () => {
      await seedSave({
        saveUuid: "active-save",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Active",
        summary: "Active char",
      });
      await seedSave({
        saveUuid: "removed-save",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Removed",
        summary: "Removed char",
      });
      // Mark one as removed
      await env.DB.prepare("UPDATE saves SET removed_at = datetime('now') WHERE uuid = ?")
        .bind("removed-save")
        .run();

      const result = await listGames(env.DB, env.PLUGINS, USER_A);
      const data = parseResult(result) as { games: GameEntry[] };
      const d2r = data.games.find((g) => g.game_id === "d2r");
      expect(d2r!.saves).toHaveLength(1);
      expect(d2r!.saves[0]!.name).toBe("Active");
      // Removed save name should appear in removed_saves
      expect(d2r!.removed_saves).toEqual(["Removed"]);
    });

    it("get_save returns removal message for removed saves", async () => {
      await seedSave({
        saveUuid: "removed-get",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "RemovedGet",
        summary: "Will be removed",
      });
      await env.DB.prepare("UPDATE saves SET removed_at = datetime('now') WHERE uuid = ?")
        .bind("removed-get")
        .run();

      const result = await getSave(env.DB, USER_A, "removed-get");
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("RemovedGet");
      expect(text).toContain("removed");
      expect(text).toContain("restore");
    });

    it("search_saves excludes removed saves", async () => {
      await seedSave({
        saveUuid: "search-removed",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "SearchRemoved",
        summary: "Searchable removed",
      });
      // Index it
      await indexSaveSections(env.DB, "search-removed", "SearchRemoved", sampleGameState.sections);
      // Mark as removed
      await env.DB.prepare("UPDATE saves SET removed_at = datetime('now') WHERE uuid = ?")
        .bind("search-removed")
        .run();

      const result = await searchSaves(env.DB, USER_A, "SearchRemoved");
      const data = parseResult(result) as { results: unknown[] };
      expect(data.results).toHaveLength(0);
    });
  });
}); // MCP Tools
