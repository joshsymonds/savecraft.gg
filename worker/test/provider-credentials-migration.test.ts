import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

/**
 * Exercises the data-copy logic of migrations/0060_provider_credentials.sql
 * in isolation. That migration drops game_credentials, and test/setup.ts's
 * schema mirror (like every other migration) no longer creates it — so
 * there's no way to seed pre-migration state through the normal test flow.
 * Instead, each test stands up a scratch game_credentials table itself,
 * seeds old-shape rows, then runs the migration's own INSERT/DROP
 * statements (copied verbatim from the .sql file; provider_credentials
 * itself already exists via setup.ts, so its CREATE TABLE statement is
 * not repeated here) and asserts on the resulting provider_credentials
 * rows.
 *
 * If worker/migrations/0060_provider_credentials.sql ever changes, keep
 * MIGRATION_STATEMENTS below in sync.
 */
describe("0060_provider_credentials migration", () => {
  beforeEach(cleanAll);

  const OLD_TABLE_SQL = `CREATE TABLE game_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_uuid TEXT NOT NULL,
    game_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_uuid, game_id)
  )`;

  // Verbatim copy of the INSERT...SELECT + DROP from 0060_provider_credentials.sql.
  const MIGRATION_STATEMENTS = [
    `INSERT INTO provider_credentials (user_uuid, provider, access_token, refresh_token, expires_at, created_at, updated_at)
     SELECT
       g.user_uuid,
       CASE g.game_id WHEN 'wow' THEN 'battlenet' WHEN 'poe' THEN 'ggg' ELSE g.game_id END,
       g.access_token,
       g.refresh_token,
       g.expires_at,
       g.created_at,
       g.updated_at
     FROM game_credentials g
     WHERE g.id = (
       SELECT g2.id FROM game_credentials g2
       WHERE g2.user_uuid = g.user_uuid
         AND (CASE g2.game_id WHEN 'wow' THEN 'battlenet' WHEN 'poe' THEN 'ggg' ELSE g2.game_id END)
           = (CASE g.game_id WHEN 'wow' THEN 'battlenet' WHEN 'poe' THEN 'ggg' ELSE g.game_id END)
       ORDER BY g2.updated_at DESC, g2.id DESC
       LIMIT 1
     )`,
    `DROP TABLE game_credentials`,
  ];

  async function runMigration(): Promise<void> {
    for (const sql of MIGRATION_STATEMENTS) {
      await env.DB.prepare(sql).run();
    }
  }

  interface CredRow {
    provider: string;
    access_token: string;
    refresh_token: string | null;
    expires_at: string | null;
  }

  it("copies rows to provider_credentials, mapping game_id to its OAuth provider", async () => {
    await env.DB.prepare(OLD_TABLE_SQL).run();
    await env.DB.prepare(
      `INSERT INTO game_credentials (user_uuid, game_id, access_token, refresh_token, expires_at)
       VALUES (?, 'poe', 'poe-access', 'poe-refresh', '2099-01-01T00:00:00Z')`,
    )
      .bind("migration-user")
      .run();
    await env.DB.prepare(
      `INSERT INTO game_credentials (user_uuid, game_id, access_token, refresh_token, expires_at)
       VALUES (?, 'wow', 'wow-access', 'wow-refresh', '2099-01-01T00:00:00Z')`,
    )
      .bind("migration-user")
      .run();

    await runMigration();

    const rows = await env.DB.prepare(
      "SELECT provider, access_token, refresh_token, expires_at FROM provider_credentials WHERE user_uuid = ? ORDER BY provider",
    )
      .bind("migration-user")
      .all<CredRow>();

    expect(rows.results).toEqual([
      {
        provider: "battlenet",
        access_token: "wow-access",
        refresh_token: "wow-refresh",
        expires_at: "2099-01-01T00:00:00Z",
      },
      {
        provider: "ggg",
        access_token: "poe-access",
        refresh_token: "poe-refresh",
        expires_at: "2099-01-01T00:00:00Z",
      },
    ]);

    // The migration's own DROP TABLE ran — old table is gone.
    await expect(env.DB.prepare("SELECT 1 FROM game_credentials").run()).rejects.toThrow();
  });

  it("an unmapped game_id falls back to itself as the provider", async () => {
    await env.DB.prepare(OLD_TABLE_SQL).run();
    await env.DB.prepare(
      `INSERT INTO game_credentials (user_uuid, game_id, access_token, refresh_token, expires_at)
       VALUES (?, 'ffxiv', 'ffxiv-access', NULL, NULL)`,
    )
      .bind("migration-user-2")
      .run();

    await runMigration();

    const row = await env.DB.prepare(
      "SELECT provider, access_token FROM provider_credentials WHERE user_uuid = ?",
    )
      .bind("migration-user-2")
      .first<{ provider: string; access_token: string }>();

    expect(row).toEqual({ provider: "ffxiv", access_token: "ffxiv-access" });
  });

  it("keeps the most recently updated row when duplicate rows collide on the same provider", async () => {
    // Real game_credentials enforced UNIQUE(user_uuid, game_id), and
    // today's mapping is 1:1, so this collision can't occur through the
    // normal write paths. Omitting the UNIQUE constraint here simulates
    // a pre-existing data anomaly to exercise the migration's defensive
    // "most recently updated wins" dedup.
    await env.DB.prepare(
      `CREATE TABLE game_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_uuid TEXT NOT NULL,
        game_id TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO game_credentials (user_uuid, game_id, access_token, refresh_token, expires_at, updated_at)
       VALUES (?, 'poe', 'stale-access', 'stale-refresh', '2000-01-01T00:00:00Z', '2020-01-01T00:00:00Z')`,
    )
      .bind("collision-user")
      .run();
    await env.DB.prepare(
      `INSERT INTO game_credentials (user_uuid, game_id, access_token, refresh_token, expires_at, updated_at)
       VALUES (?, 'poe', 'fresh-access', 'fresh-refresh', '2099-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`,
    )
      .bind("collision-user")
      .run();

    await runMigration();

    const rows = await env.DB.prepare(
      "SELECT provider, access_token, refresh_token FROM provider_credentials WHERE user_uuid = ?",
    )
      .bind("collision-user")
      .all<{ provider: string; access_token: string; refresh_token: string }>();

    expect(rows.results).toEqual([
      { provider: "ggg", access_token: "fresh-access", refresh_token: "fresh-refresh" },
    ]);
  });
});
