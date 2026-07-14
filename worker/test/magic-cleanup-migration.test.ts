import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import migrationSql from "../migrations/0064_magic_save_cleanup.sql?raw";

import { cleanAll } from "./helpers";

// Vite (which vitest-pool-workers builds on for module bundling) resolves
// `?raw` suffixed imports to the file's text content — no ambient module
// ships for arbitrary extensions, so declare one here rather than adding a
// project-wide .d.ts.
declare module "*.sql?raw" {
  const content: string;
  export default content;
}

/**
 * Executes migrations/0064_magic_save_cleanup.sql — imported directly from
 * the real file, not copied — against a seeded D1 database. Asserts every
 * row that references a game_id='magic' save (sections, search_index,
 * notes, and the save row itself) is gone, while a same-shaped non-magic
 * save's rows are fully untouched.
 */
describe("0064_magic_save_cleanup migration", () => {
  beforeEach(cleanAll);

  /** Strip `--` line comments, then split on `;` into runnable statements. */
  function splitStatements(sql: string): string[] {
    return sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
  }

  async function runMigration(): Promise<void> {
    for (const statement of splitStatements(migrationSql)) {
      await env.DB.prepare(statement).run();
    }
  }

  const userUuid = "magic-cleanup-user";

  interface SaveSeed {
    uuid: string;
    gameId: string;
    saveName: string;
  }

  /** Seeds a save plus one dependent row in each of sections/search_index/notes. */
  async function seedSaveWithDependents(save: SaveSeed): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary)
       VALUES (?, ?, ?, ?, ?, 'test summary')`,
    )
      .bind(save.uuid, userUuid, save.gameId, save.gameId, save.saveName)
      .run();

    await env.DB.prepare(
      `INSERT INTO sections (save_uuid, name, description, data)
       VALUES (?, 'overview', '', '{}')`,
    )
      .bind(save.uuid)
      .run();

    await env.DB.prepare(
      `INSERT INTO search_index (save_id, save_name, type, ref_id, ref_title, content)
       VALUES (?, ?, 'section', 'overview', 'Overview', 'test content')`,
    )
      .bind(save.uuid, save.saveName)
      .run();

    await env.DB.prepare(
      `INSERT INTO notes (note_id, save_id, user_uuid, title, content)
       VALUES (?, ?, ?, 'test note', 'note body')`,
    )
      .bind(`note-${save.uuid}`, save.uuid, userUuid)
      .run();
  }

  async function dependentRowCounts(saveUuid: string): Promise<number[]> {
    const [sections, searchRows, notes] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM sections WHERE save_uuid = ?")
        .bind(saveUuid)
        .first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM search_index WHERE save_id = ?")
        .bind(saveUuid)
        .first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM notes WHERE save_id = ?")
        .bind(saveUuid)
        .first<{ n: number }>(),
    ]);
    return [sections?.n ?? -1, searchRows?.n ?? -1, notes?.n ?? -1];
  }

  it("deletes every magic save and its dependent rows, leaving other games intact", async () => {
    const unknownPlayerSave: SaveSeed = {
      uuid: "magic-save-unknown-player",
      gameId: "magic",
      saveName: "Unknown Player",
    };
    const namedSave: SaveSeed = {
      uuid: "magic-save-named",
      gameId: "magic",
      saveName: "JoshSymonds#12345",
    };
    const poeSave: SaveSeed = { uuid: "poe-save-untouched", gameId: "poe", saveName: "player" };

    await seedSaveWithDependents(unknownPlayerSave);
    await seedSaveWithDependents(namedSave);
    await seedSaveWithDependents(poeSave);

    await runMigration();

    const remainingSaves = await env.DB.prepare(
      "SELECT uuid, game_id AS gameId FROM saves ORDER BY uuid",
    ).all<{ uuid: string; gameId: string }>();
    expect(remainingSaves.results).toEqual([{ uuid: poeSave.uuid, gameId: "poe" }]);

    expect(await dependentRowCounts(unknownPlayerSave.uuid)).toEqual([0, 0, 0]);
    expect(await dependentRowCounts(namedSave.uuid)).toEqual([0, 0, 0]);
    expect(await dependentRowCounts(poeSave.uuid)).toEqual([1, 1, 1]);
  });

  it("is a no-op against a database with zero magic saves", async () => {
    const poeSave: SaveSeed = { uuid: "poe-save-idempotent", gameId: "poe", saveName: "player" };
    await seedSaveWithDependents(poeSave);

    await runMigration();
    await expect(runMigration()).resolves.toBeUndefined(); // second run: no errors, no-op

    const saves = await env.DB.prepare("SELECT uuid FROM saves").all<{ uuid: string }>();
    expect(saves.results).toEqual([{ uuid: poeSave.uuid }]);
    expect(await dependentRowCounts(poeSave.uuid)).toEqual([1, 1, 1]);
  });
});
