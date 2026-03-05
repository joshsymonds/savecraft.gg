-- Consolidated schema: sources, saves, events, configs, notes, search, auth.

-- Sources: any validated entity that posts game state (daemon, API adapter, game mod).
CREATE TABLE sources (
  source_uuid TEXT PRIMARY KEY,
  user_uuid TEXT,
  user_email TEXT,
  user_display_name TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  link_code TEXT,
  link_code_expires_at TEXT,
  hostname TEXT,
  os TEXT,
  arch TEXT,
  source_kind TEXT NOT NULL DEFAULT 'daemon',
  can_rescan INTEGER NOT NULL DEFAULT 1,
  can_receive_config INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_push_at TEXT
);
CREATE INDEX idx_sources_user ON sources(user_uuid);
CREATE INDEX idx_sources_link_code ON sources(link_code) WHERE link_code IS NOT NULL;
CREATE INDEX idx_sources_token ON sources(token_hash);

-- Saves: keyed by (source_uuid, game_id, save_name) → UUID.
CREATE TABLE saves (
  uuid TEXT PRIMARY KEY,
  source_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  game_name TEXT NOT NULL DEFAULT '',
  save_name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_uuid, game_id, save_name)
);
CREATE INDEX idx_saves_source ON saves(source_uuid);

-- Source events: persisted for UI cold-start and diagnostics.
-- Events belong to sources; user association resolved via JOIN on sources.
CREATE TABLE source_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_uuid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_source_events_source
  ON source_events(source_uuid, created_at DESC);

-- Per-source game configuration pushed from the web UI to sources.
-- Configs belong to a source+game pair; user ownership derived via sources.user_uuid.
CREATE TABLE source_configs (
  source_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  save_path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  file_extensions TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source_uuid, game_id)
);

-- Notes: user-supplied reference material attached to saves.
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

-- FTS5 full-text search across save sections and notes.
CREATE VIRTUAL TABLE search_index USING fts5(
  save_id UNINDEXED,
  save_name UNINDEXED,
  type UNINDEXED,
  ref_id UNINDEXED,
  ref_title UNINDEXED,
  content,
  tokenize='porter unicode61'
);

-- API keys for MCP authentication.
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  user_uuid TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_api_keys_user ON api_keys(user_uuid);

-- MCP activity tracking.
CREATE TABLE mcp_activity (user_uuid TEXT PRIMARY KEY);
