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

/** Map user UUID to a deterministic device UUID for test consistency. */
function deviceUuidFor(userUuid: string): string {
  return `device-${userUuid}`;
}

async function ensureDevice(userUuid: string): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO devices (device_uuid, user_uuid, token_hash) VALUES (?, ?, ?)",
  )
    .bind(deviceUuidFor(userUuid), userUuid, `hash-${userUuid}`)
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
  const deviceUuid = deviceUuidFor(options.userUuid);

  await ensureDevice(options.userUuid);

  await env.DB.prepare(
    "INSERT INTO saves (uuid, device_uuid, game_id, game_name, save_name, summary, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      options.saveUuid,
      deviceUuid,
      options.gameId,
      gameName,
      options.saveName,
      options.summary,
      lastUpdated,
    )
    .run();

  const state = options.gameState ?? sampleGameState;
  const key = `devices/${deviceUuid}/saves/${options.saveUuid}/latest.json`;
  await env.SAVES.put(key, JSON.stringify(state));
}

async function seedSnapshot(
  userUuid: string,
  saveUuid: string,
  timestamp: string,
  gameState: typeof sampleGameState,
): Promise<void> {
  const deviceUuid = deviceUuidFor(userUuid);
  const key = `devices/${deviceUuid}/saves/${saveUuid}/snapshots/${timestamp}.json`;
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

    it("does not return saves from other users", async () => {
      await seedSave({
        saveUuid: "save-other",
        userUuid: USER_B,
        gameId: "d2r",
        saveName: "Sorceress",
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

    it("filters games by game_id (case-insensitive substring)", async () => {
      await seedSave({
        saveUuid: "save-filter-id",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89",
      });

      const result = await listGames(env.DB, env.PLUGINS, USER_A, "D2R");
      const data = parseResult(result) as { games: GameEntry[] };
      expect(data.games).toHaveLength(1);
      expect(data.games[0]!.game_id).toBe("d2r");
    });

    it("returns error when filter matches no games", async () => {
      await seedSave({
        saveUuid: "save-no-match",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Test",
      });

      const result = await listGames(env.DB, env.PLUGINS, USER_A, "nonexistent_game_xyz");
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("No games matching");
    });
  });

  // ── Shared note seeder ─────────────────────────────────────────

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

  // ── get_save ────────────────────────────────────────────────────

  describe("getSave", () => {
    it("returns summary, overview, section listing, and notes", async () => {
      await seedSave({
        saveUuid: "save-sections",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
      });

      const result = await getSave(env.DB, env.SAVES, USER_A, "save-sections");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        save_id: string;
        game_id: string;
        name: string;
        summary: string;
        overview: Record<string, unknown>;
        sections: { name: string; description: string }[];
        notes: { note_id: string; title: string; source: string; size_bytes: number }[];
      };
      expect(data.save_id).toBe("save-sections");
      expect(data.game_id).toBe("d2r");
      expect(data.name).toBe("Hammerdin");
      expect(data.summary).toBe("Hammerdin, Level 89 Paladin");
      expect(data.overview).toBeDefined();
      expect(data.overview.name).toBe("Hammerdin");
      expect(data.sections).toHaveLength(3);
      expect(data.notes).toEqual([]);

      const names = data.sections.map((s) => s.name).toSorted((a, b) => a.localeCompare(b));
      expect(names).toEqual(["character_overview", "equipped_gear", "skills"]);

      const overviewSection = data.sections.find((s) => s.name === "character_overview");
      expect(overviewSection!.description).toBe("Level, class, difficulty, play time");
    });

    it("includes note metadata when notes exist", async () => {
      await seedSave({
        saveUuid: "save-with-notes",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89",
      });
      await seedNote("save-with-notes", USER_A, "note-gs-1", "Build Guide", "## Gear section");
      await seedNote("save-with-notes", USER_A, "note-gs-2", "Farming Goals", "Need Ber rune");

      const result = await getSave(env.DB, env.SAVES, USER_A, "save-with-notes");
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        notes: { note_id: string; title: string; source: string; size_bytes: number }[];
      };
      expect(data.notes).toHaveLength(2);
      expect(data.notes[0]!.size_bytes).toBeGreaterThan(0);

      const titles = data.notes.map((n) => n.title).toSorted((a, b) => a.localeCompare(b));
      expect(titles).toEqual(["Build Guide", "Farming Goals"]);
    });

    it("R2 snapshots use daemon-format identity (camelCase gameId)", async () => {
      // seedSave stores sampleGameState in R2 — verify it uses daemon convention
      await seedSave({
        saveUuid: "save-fmt-check",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Format check",
      });

      const object = await env.SAVES.get(
        `devices/${deviceUuidFor(USER_A)}/saves/save-fmt-check/latest.json`,
      );
      const snapshot = await object!.json<{ identity: Record<string, unknown> }>();
      // Daemon sends camelCase — R2 should store exactly that
      expect(snapshot.identity.gameId).toBe("d2r");
      expect(snapshot.identity.saveName).toBe("Hammerdin");
      // snake_case game_id should NOT be in daemon JSON
      expect(snapshot.identity.game_id).toBeUndefined();
    });

    it("returns error for non-existent save", async () => {
      const result = await getSave(env.DB, env.SAVES, USER_A, "nonexistent");
      expect(result.isError).toBe(true);
    });

    it("returns error when save belongs to different user", async () => {
      await seedSave({
        saveUuid: "save-other-user",
        userUuid: USER_B,
        gameId: "d2r",
        saveName: "Sorceress",
        summary: "Sorceress, Level 80",
      });

      const result = await getSave(env.DB, env.SAVES, USER_A, "save-other-user");
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
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-section", ["equipped_gear"]);
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
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-section-missing", [
        "nonexistent_section",
      ]);
      expect(result.isError).toBe(true);
    });

    it("returns error for non-existent save", async () => {
      const result = await getSection(env.DB, env.SAVES, USER_A, "nonexistent", ["skills"]);
      expect(result.isError).toBe(true);
    });

    it("returns error when save belongs to different user", async () => {
      await seedSave({
        saveUuid: "save-section-other",
        userUuid: USER_B,
        gameId: "d2r",
        saveName: "Amazon",
        summary: "Amazon, Level 70",
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-section-other", ["skills"]);
      expect(result.isError).toBe(true);
    });

    it("returns section data at a specific timestamp", async () => {
      await seedSave({
        saveUuid: "save-section-ts",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "HistoricalChar",
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
        ["equipped_gear"],
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
        saveName: "MissingTsChar",
        summary: "Test",
      });

      const result = await getSection(
        env.DB,
        env.SAVES,
        USER_A,
        "save-section-ts-missing",
        ["equipped_gear"],
        "2099-01-01T00:00:00Z",
      );
      expect(result.isError).toBe(true);
    });

    it("returns error when single section exceeds size limit", async () => {
      // Create a section with data larger than the size limit
      const largeData: Record<string, string> = {};
      for (let index = 0; index < 2000; index++) {
        largeData[`item_${String(index)}`] = "x".repeat(50);
      }
      const largeState = {
        ...sampleGameState,
        sections: {
          ...sampleGameState.sections,
          huge_inventory: {
            description: "Massive inventory section",
            data: largeData,
          },
        },
      };

      await seedSave({
        saveUuid: "save-section-large",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "LargeChar",
        summary: "Test",
        gameState: largeState,
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-section-large", [
        "huge_inventory",
      ]);
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("too large");
    });

    it("omits oversized sections when fetching multiple, returns the rest", async () => {
      const largeData: Record<string, string> = {};
      for (let index = 0; index < 2000; index++) {
        largeData[`item_${String(index)}`] = "x".repeat(50);
      }
      const mixedState = {
        ...sampleGameState,
        sections: {
          ...sampleGameState.sections,
          huge_inventory: {
            description: "Massive inventory section",
            data: largeData,
          },
        },
      };

      await seedSave({
        saveUuid: "save-section-mixed",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "MixedChar",
        summary: "Test",
        gameState: mixedState,
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-section-mixed", [
        "equipped_gear",
        "huge_inventory",
      ]);
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        sections: Record<string, unknown>;
        oversized: string[];
      };
      expect(data.sections.equipped_gear).toBeDefined();
      expect(data.sections.huge_inventory).toBeUndefined();
      expect(data.oversized).toHaveLength(1);
      expect(data.oversized[0]).toContain("huge_inventory");
    });

    it("returns found sections alongside missing ones in multi-section fetch", async () => {
      await seedSave({
        saveUuid: "save-section-partial",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "PartialChar",
        summary: "Test",
      });

      const result = await getSection(env.DB, env.SAVES, USER_A, "save-section-partial", [
        "equipped_gear",
        "nonexistent_section",
      ]);
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        sections: Record<string, unknown>;
        missing: string[];
      };
      expect(data.sections.equipped_gear).toBeDefined();
      expect(data.missing).toEqual(["nonexistent_section"]);
    });

    it("allows sections under the size limit", async () => {
      await seedSave({
        saveUuid: "save-section-ok",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "NormalChar",
        summary: "Test",
      });

      // Normal sections from sampleGameState are well under 80KB
      const result = await getSection(env.DB, env.SAVES, USER_A, "save-section-ok", [
        "equipped_gear",
      ]);
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as { data: Record<string, unknown> };
      expect(data.data).toBeDefined();
    });
  });

  // ── get_section_diff ─────────────────────────────────────────

  describe("getSectionDiff", () => {
    // Use timestamps relative to now for period-based diff
    function hoursAgo(hours: number): string {
      return new Date(Date.now() - hours * 3_600_000).toISOString();
    }

    it("returns changed fields using period-based comparison", async () => {
      await seedSave({
        saveUuid: "save-diff",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "DiffChar",
        summary: "Test",
      });

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
      const newerState = {
        ...sampleGameState,
        sections: {
          ...sampleGameState.sections,
          equipped_gear: {
            description: "All equipped items with stats, sockets, runewords",
            data: {
              helmet: { name: "Harlequin Crest", base: "Shako" },
              body_armor: { name: "Enigma", base: "Mage Plate" },
            },
          },
        },
      };

      await seedSnapshot(USER_A, "save-diff", hoursAgo(12), olderState);
      await seedSnapshot(USER_A, "save-diff", hoursAgo(1), newerState);

      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "save-diff",
        "equipped_gear",
        "24 hours",
      );
      expect(result.isError).toBeUndefined();

      const data = parseResult(result) as {
        save_id: string;
        section: string;
        period: string;
        changes: { path: string; old: unknown; new: unknown }[];
      };
      expect(data.save_id).toBe("save-diff");
      expect(data.section).toBe("equipped_gear");
      expect(data.period).toBe("24 hours");
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
        saveName: "SameChar",
        summary: "Test",
      });

      await seedSnapshot(USER_A, "save-diff-same", hoursAgo(12), sampleGameState);
      await seedSnapshot(USER_A, "save-diff-same", hoursAgo(1), sampleGameState);

      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "save-diff-same",
        "equipped_gear",
        "24 hours",
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
        "24 hours",
      );
      expect(result.isError).toBe(true);
    });

    it("returns error for unrecognized period", async () => {
      await seedSave({
        saveUuid: "save-diff-bad-period",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "BadPeriodChar",
        summary: "Test",
      });

      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "save-diff-bad-period",
        "equipped_gear",
        "whenever",
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Unrecognized period");
    });

    it("returns error when only one snapshot exists", async () => {
      await seedSave({
        saveUuid: "save-diff-one-snap",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "OneSnapChar",
        summary: "Test",
      });

      await seedSnapshot(USER_A, "save-diff-one-snap", hoursAgo(1), sampleGameState);

      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "save-diff-one-snap",
        "equipped_gear",
        "24 hours",
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Not enough snapshots");
    });

    it("returns error for zero-value period", async () => {
      await seedSave({
        saveUuid: "save-diff-zero",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "ZeroPeriodChar",
        summary: "Test",
      });

      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "save-diff-zero",
        "equipped_gear",
        "0 hours",
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Unrecognized period");
    });

    it("accepts 'yesterday', 'this week', and 'last week' shortcuts", async () => {
      await seedSave({
        saveUuid: "save-diff-shortcuts",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "ShortcutsChar",
        summary: "Test",
      });

      // Snapshots far enough apart to cover any shortcut range
      await seedSnapshot(USER_A, "save-diff-shortcuts", hoursAgo(400), sampleGameState);
      await seedSnapshot(USER_A, "save-diff-shortcuts", hoursAgo(1), sampleGameState);

      for (const period of ["yesterday", "this week", "last week"]) {
        const result = await getSectionDiff(
          env.DB,
          env.SAVES,
          USER_A,
          "save-diff-shortcuts",
          "equipped_gear",
          period,
        );
        expect(result.isError, `period "${period}" should not error`).toBeUndefined();
      }
    });

    it("accepts natural language periods like 'last session' and '3 days'", async () => {
      await seedSave({
        saveUuid: "save-diff-periods",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "PeriodsChar",
        summary: "Test",
      });

      await seedSnapshot(USER_A, "save-diff-periods", hoursAgo(48), sampleGameState);
      await seedSnapshot(USER_A, "save-diff-periods", hoursAgo(1), sampleGameState);

      // "3 days" should work and find both snapshots
      const result = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "save-diff-periods",
        "equipped_gear",
        "3 days",
      );
      expect(result.isError).toBeUndefined();

      // "last session" should also work
      const result2 = await getSectionDiff(
        env.DB,
        env.SAVES,
        USER_A,
        "save-diff-periods",
        "equipped_gear",
        "last session",
      );
      expect(result2.isError).toBeUndefined();
    });
  });

  // ── Note MCP tools ───────────────────────────────────────────

  describe("getNote", () => {
    it("returns full note content", async () => {
      await seedSave({
        saveUuid: "save-get-note",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "GetNoteChar",
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
        saveName: "MissingNoteChar",
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
        saveName: "CreateNoteChar",
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
        saveName: "UpdateNoteChar",
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
        saveName: "UpdateMissingChar",
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
        saveName: "DeleteNoteChar",
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
        saveName: "DeleteMissingChar",
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
        saveName: "SearchChar",
        summary: "SearchChar, Level 89",
      });

      // Manually index a section
      await env.DB.prepare(
        "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(
          "save-search-1",
          "SearchChar",
          "section",
          "equipped_gear",
          "All equipped items",
          JSON.stringify({ helmet: { name: "Harlequin Crest", base: "Shako" } }),
        )
        .run();

      const result = await searchSaves(env.DB, USER_A, "Harlequin");
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
        saveName: "SearchNoteChar",
        summary: "Test",
      });

      await env.DB.prepare(
        "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(
          "save-search-2",
          "SearchNoteChar",
          "note",
          "note-search-1",
          "Enigma Farming Guide",
          "Farm for Enigma runeword. Need Jah and Ber runes.",
        )
        .run();

      const result = await searchSaves(env.DB, USER_A, "Enigma");
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
        saveName: "ScopeCharA",
        summary: "Test",
      });
      await seedSave({
        saveUuid: "save-search-scope-b",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "ScopeCharB",
        summary: "Test",
      });

      await env.DB.prepare(
        "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind("save-search-scope-a", "ScopeCharA", "section", "gear", "Gear", "Shako helmet")
        .run();
      await env.DB.prepare(
        "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind("save-search-scope-b", "ScopeCharB", "section", "gear", "Gear", "Shako helmet")
        .run();

      // Search scoped to save A
      const result = await searchSaves(env.DB, USER_A, "Shako", "save-search-scope-a");
      const data = parseResult(result) as { results: { save_id: string }[] };
      expect(data.results).toHaveLength(1);
      expect(data.results[0]!.save_id).toBe("save-search-scope-a");
    });

    it("returns empty results for no matches", async () => {
      const result = await searchSaves(env.DB, USER_A, "nonexistenttermxyz123");
      const data = parseResult(result) as { results: unknown[] };
      expect(data.results).toEqual([]);
    });

    it("does not return results from other users", async () => {
      await seedSave({
        saveUuid: "save-search-other",
        userUuid: USER_B,
        gameId: "d2r",
        saveName: "OtherUserChar",
        summary: "Test",
      });

      await env.DB.prepare(
        "INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind("save-search-other", "OtherUserChar", "section", "gear", "Gear", "Unique secret item")
        .run();

      const result = await searchSaves(env.DB, USER_A, "secret");
      const data = parseResult(result) as { results: unknown[] };
      expect(data.results).toEqual([]);
    });

    it("finds notes created via MCP createNote tool", async () => {
      await seedSave({
        saveUuid: "save-search-mcp-note",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "McpNoteChar",
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
      const result = await searchSaves(env.DB, USER_A, "Infinity");
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
        saveName: "McpUpdateChar",
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
      const oldResult = await searchSaves(env.DB, USER_A, "Zod");
      const oldData = parseResult(oldResult) as { results: { ref_id: string }[] };
      const oldMatch = oldData.results.find((r) => r.ref_id === note_id);
      expect(oldMatch).toBeUndefined();

      // New content should match
      const newResult = await searchSaves(env.DB, USER_A, "Cham");
      const newData = parseResult(newResult) as { results: { ref_id: string }[] };
      const newMatch = newData.results.find((r) => r.ref_id === note_id);
      expect(newMatch).toBeDefined();
    });

    it("removes search index when note deleted via MCP tool", async () => {
      await seedSave({
        saveUuid: "save-search-mcp-delete",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "McpDeleteChar",
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
      const result = await searchSaves(env.DB, USER_A, "Windforce");
      const data = parseResult(result) as { results: { ref_id: string }[] };
      const match = data.results.find((r) => r.ref_id === note_id);
      expect(match).toBeUndefined();
    });
  });
  // ── refresh_save ──────────────────────────────────────────
  describe("refreshSave", () => {
    beforeEach(cleanAll);

    it("returns error for nonexistent save", async () => {
      const result = await refreshSave(env.DB, env.DAEMON_HUB, USER_A, "no-such-save");
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Save not found");
    });

    it("returns daemon offline error when no daemon is connected", async () => {
      await seedSave({
        saveUuid: "save-refresh-offline",
        userUuid: USER_A,
        gameId: "d2r",
        saveName: "Hammerdin",
        summary: "Hammerdin, Level 89 Paladin",
      });

      const result = await refreshSave(env.DB, env.DAEMON_HUB, USER_A, "save-refresh-offline");
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("daemon is offline");
    });
  });

  // ── get_setup_help ──────────────────────────────────────────

  describe("getSetupHelp", () => {
    /** Seed a device with full control over fields for setup help tests. */
    async function seedTestDevice(options: {
      deviceUuid: string;
      userUuid?: string | null;
      hostname?: string;
      os?: string;
      arch?: string;
      linkCode?: string | null;
      linkCodeExpiresAt?: string | null;
      lastPushAt?: string | null;
    }): Promise<void> {
      await env.DB.prepare(
        `INSERT INTO devices (device_uuid, user_uuid, token_hash, hostname, os, arch, link_code, link_code_expires_at, last_push_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          options.deviceUuid,
          options.userUuid ?? null,
          `hash-${options.deviceUuid}`,
          options.hostname ?? null,
          options.os ?? null,
          options.arch ?? null,
          options.linkCode ?? null,
          options.linkCodeExpiresAt ?? null,
          options.lastPushAt ?? null,
        )
        .run();
    }

    // ── Device listing ──────────────────────────────────────────

    it("returns empty devices list for user with no devices", async () => {
      const result = await getSetupHelp(env.DB, USER_A);
      const data = parseResult(result) as { devices: unknown[] };
      expect(result.isError).toBeUndefined();
      expect(data.devices).toEqual([]);
    });

    it("returns linked devices with status info", async () => {
      const recentPush = new Date(Date.now() - 2 * 60_000).toISOString(); // 2 min ago
      await seedTestDevice({
        deviceUuid: "dev-1",
        userUuid: USER_A,
        hostname: "gaming-pc",
        os: "linux",
        arch: "amd64",
        lastPushAt: recentPush,
      });

      const result = await getSetupHelp(env.DB, USER_A);
      const data = parseResult(result) as {
        devices: {
          device_uuid: string;
          hostname: string;
          os: string;
          arch: string;
          linked: boolean;
          last_active: string;
          activity: string;
        }[];
      };
      expect(data.devices).toHaveLength(1);
      expect(data.devices[0]!.device_uuid).toBe("dev-1");
      expect(data.devices[0]!.hostname).toBe("gaming-pc");
      expect(data.devices[0]!.os).toBe("linux");
      expect(data.devices[0]!.linked).toBe(true);
      expect(data.devices[0]!.activity).toBe("active");
    });

    it("derives activity status from last_push_at thresholds", async () => {
      // active: within 5 min
      await seedTestDevice({
        deviceUuid: "dev-active",
        userUuid: USER_A,
        lastPushAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      });
      // recently_active: within 1 hour
      await seedTestDevice({
        deviceUuid: "dev-recent",
        userUuid: USER_A,
        lastPushAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      });
      // inactive: older than 1 hour
      await seedTestDevice({
        deviceUuid: "dev-inactive",
        userUuid: USER_A,
        lastPushAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      });
      // never_pushed: null
      await seedTestDevice({
        deviceUuid: "dev-never",
        userUuid: USER_A,
        lastPushAt: null,
      });

      const result = await getSetupHelp(env.DB, USER_A);
      const data = parseResult(result) as {
        devices: { device_uuid: string; activity: string }[];
      };

      const byId = new Map(data.devices.map((d) => [d.device_uuid, d.activity]));
      expect(byId.get("dev-active")).toBe("active");
      expect(byId.get("dev-recent")).toBe("recently_active");
      expect(byId.get("dev-inactive")).toBe("inactive");
      expect(byId.get("dev-never")).toBe("never_pushed");
    });

    it("does not return other users' devices", async () => {
      await seedTestDevice({ deviceUuid: "dev-a", userUuid: USER_A });
      await seedTestDevice({ deviceUuid: "dev-b", userUuid: USER_B });

      const result = await getSetupHelp(env.DB, USER_A);
      const data = parseResult(result) as {
        devices: { device_uuid: string }[];
      };
      const ids = data.devices.map((d) => d.device_uuid);
      expect(ids).toContain("dev-a");
      expect(ids).not.toContain("dev-b");
    });

    // ── Link code lookup ────────────────────────────────────────

    it("looks up a valid unexpired link code", async () => {
      const expires = new Date(Date.now() + 10 * 60_000).toISOString();
      await seedTestDevice({
        deviceUuid: "dev-code",
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
          device_uuid: string;
          hostname: string;
          os: string;
          linked: boolean;
          link_code_valid: boolean;
          activity: string;
        };
      };
      expect(data.lookup.found).toBe(true);
      expect(data.lookup.device_uuid).toBe("dev-code");
      expect(data.lookup.hostname).toBe("new-laptop");
      expect(data.lookup.os).toBe("windows");
      expect(data.lookup.linked).toBe(false);
      expect(data.lookup.link_code_valid).toBe(true);
      expect(data.lookup.activity).toBe("active");
    });

    it("reports expired link code", async () => {
      const expired = new Date(Date.now() - 5 * 60_000).toISOString();
      await seedTestDevice({
        deviceUuid: "dev-expired",
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

    it("does not leak user info for already-linked device via code", async () => {
      const expires = new Date(Date.now() + 10 * 60_000).toISOString();
      await env.DB.prepare(
        `INSERT INTO devices (device_uuid, user_uuid, user_email, user_display_name, token_hash, link_code, link_code_expires_at)
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

    // ── Device UUID lookup ──────────────────────────────────────

    it("looks up device by UUID", async () => {
      await seedTestDevice({
        deviceUuid: "dev-lookup",
        userUuid: null,
        hostname: "my-pc",
        os: "linux",
        arch: "arm64",
      });

      const result = await getSetupHelp(env.DB, USER_A, undefined, undefined, "dev-lookup");
      const data = parseResult(result) as {
        lookup: { found: boolean; device_uuid: string; hostname: string };
      };
      expect(data.lookup.found).toBe(true);
      expect(data.lookup.device_uuid).toBe("dev-lookup");
      expect(data.lookup.hostname).toBe("my-pc");
    });

    it("reports nonexistent device UUID", async () => {
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

    it("omits lookup field when neither link_code nor device_uuid provided", async () => {
      const result = await getSetupHelp(env.DB, USER_A);
      const data = parseResult(result) as Record<string, unknown>;
      expect(data).not.toHaveProperty("lookup");
    });

    it("prefers device_uuid over link_code when both provided", async () => {
      const expires = new Date(Date.now() + 10 * 60_000).toISOString();
      await seedTestDevice({
        deviceUuid: "dev-by-uuid",
        hostname: "uuid-host",
        linkCode: "333333",
        linkCodeExpiresAt: expires,
      });
      await seedTestDevice({
        deviceUuid: "dev-by-code",
        hostname: "code-host",
        linkCode: "444444",
        linkCodeExpiresAt: expires,
      });

      // Pass both — device_uuid should win
      const result = await getSetupHelp(env.DB, USER_A, undefined, "444444", "dev-by-uuid");
      const data = parseResult(result) as {
        lookup: { device_uuid: string; hostname: string };
      };
      expect(data.lookup.device_uuid).toBe("dev-by-uuid");
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
      await seedTestDevice({
        deviceUuid: "dev-secret",
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
