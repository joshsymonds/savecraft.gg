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
