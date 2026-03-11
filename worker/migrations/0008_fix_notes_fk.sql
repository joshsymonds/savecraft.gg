-- Fix notes FK referencing stale _saves_old table (migration artifact).
-- Only runs if the FK still points to _saves_old; harmless if already fixed.
CREATE TABLE IF NOT EXISTS notes_new (
  note_id TEXT PRIMARY KEY,
  save_id TEXT NOT NULL REFERENCES saves(uuid),
  user_uuid TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO notes_new SELECT * FROM notes;
DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;
