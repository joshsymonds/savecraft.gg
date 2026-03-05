-- Remove denormalized user_uuid from source_configs.
-- Configs belong to a source+game pair; user ownership is derived via sources.user_uuid.
-- SQLite cannot DROP COLUMN from a primary key, so we recreate the table.

CREATE TABLE source_configs_new (
  source_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  save_path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  file_extensions TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source_uuid, game_id)
);

INSERT INTO source_configs_new (source_uuid, game_id, save_path, enabled, file_extensions, updated_at)
  SELECT source_uuid, game_id, save_path, enabled, file_extensions, updated_at FROM source_configs;

DROP TABLE source_configs;
ALTER TABLE source_configs_new RENAME TO source_configs;
