import { env } from "cloudflare:test";

import { CLEANUP_TABLES } from "./helpers";

// Apply D1 migrations before tests run.
// Using individual prepare().run() calls because D1.exec() has metadata
// aggregation bugs in certain workerd versions.
const statements = [
  `CREATE TABLE IF NOT EXISTS saves (
    uuid TEXT PRIMARY KEY,
    user_uuid TEXT NOT NULL,
    game_id TEXT NOT NULL,
    character_name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    last_updated TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_uuid, game_id, character_name)
  )`,
  `CREATE TABLE IF NOT EXISTS device_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_uuid TEXT NOT NULL,
    device_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_device_events_user_device
    ON device_events(user_uuid, device_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS notes (
    note_id TEXT PRIMARY KEY,
    save_id TEXT NOT NULL REFERENCES saves(uuid),
    user_uuid TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notes_save
    ON notes(save_id, user_uuid)`,
  `CREATE TABLE IF NOT EXISTS device_configs (
    user_uuid TEXT NOT NULL,
    device_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    save_path TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    file_extensions TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_uuid, device_id, game_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_device_configs_user_device
    ON device_configs(user_uuid, device_id)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    user_uuid UNINDEXED,
    save_id UNINDEXED,
    save_name UNINDEXED,
    type UNINDEXED,
    ref_id UNINDEXED,
    ref_title UNINDEXED,
    content,
    tokenize='porter unicode61'
  )`,
];

for (const sql of statements) {
  await env.DB.prepare(sql).run();
}

// Clean all data at startup. Each test's describe block uses beforeEach(cleanAll)
// for per-test cleanup; this module-level pass provides a clean baseline when
// the suite begins.
for (const table of CLEANUP_TABLES) {
  await env.DB.prepare(`DELETE FROM ${table}`).run();
}

// Clean R2 between test files
const listed = await env.SNAPSHOTS.list();
for (const object of listed.objects) {
  await env.SNAPSHOTS.delete(object.key);
}
