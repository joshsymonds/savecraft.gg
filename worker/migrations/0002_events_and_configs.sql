-- Source event persistence for UI cold-start and diagnostics.
CREATE TABLE source_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  source_uuid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_source_events_user_source
  ON source_events(user_uuid, source_uuid, created_at DESC);

-- Per-source game configuration pushed from the web UI to sources.
CREATE TABLE source_configs (
  user_uuid TEXT NOT NULL,
  source_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  save_path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  file_extensions TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_uuid, source_uuid, game_id)
);
CREATE INDEX idx_source_configs_user_source
  ON source_configs(user_uuid, source_uuid);
