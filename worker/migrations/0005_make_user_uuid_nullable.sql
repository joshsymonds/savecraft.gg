-- Fix saves.user_uuid to be nullable.
-- The original 0001_schema.sql was edited in-place to make user_uuid nullable,
-- but Wrangler doesn't reapply already-executed migrations. Databases created
-- before the edit still have NOT NULL on user_uuid, which blocks unlinked
-- sources from pushing saves (the "joyful first connection" pattern).
--
-- SQLite doesn't support ALTER COLUMN, so we recreate the table.

PRAGMA foreign_keys=OFF;

ALTER TABLE saves RENAME TO _saves_old;

CREATE TABLE saves (
  uuid TEXT PRIMARY KEY,
  user_uuid TEXT,
  game_id TEXT NOT NULL,
  game_name TEXT NOT NULL DEFAULT '',
  save_name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  last_source_uuid TEXT,
  UNIQUE (user_uuid, game_id, save_name)
);
CREATE INDEX IF NOT EXISTS idx_saves_user ON saves(user_uuid);

INSERT INTO saves SELECT * FROM _saves_old;

DROP TABLE _saves_old;

PRAGMA foreign_keys=ON;
