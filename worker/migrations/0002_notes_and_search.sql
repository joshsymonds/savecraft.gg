-- Notes: user-supplied reference material attached to saves
CREATE TABLE notes (
  note_id TEXT PRIMARY KEY,
  save_id TEXT NOT NULL REFERENCES saves(uuid),
  user_uuid TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notes_save ON notes(save_id, user_uuid);

-- FTS5 full-text search across save sections and notes
CREATE VIRTUAL TABLE search_index USING fts5(
  user_uuid UNINDEXED,
  save_id UNINDEXED,
  save_name UNINDEXED,
  type UNINDEXED,
  ref_id UNINDEXED,
  ref_title UNINDEXED,
  content,
  tokenize='porter unicode61'
);
