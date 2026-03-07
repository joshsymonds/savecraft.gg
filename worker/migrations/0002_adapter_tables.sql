-- Adapter tables: character registration and OAuth credential storage for API-backed games.

-- Stores discovered characters from OAuth-based game APIs.
-- Used by the web UI character picker and by adapters to know which characters to refresh.
-- Game-specific fields (class, level, realm, region) live in metadata JSON.
CREATE TABLE linked_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  metadata TEXT,
  source_uuid TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_uuid, game_id, character_id)
);

-- Stores OAuth tokens for API-backed games.
-- D1 provides encryption at rest at the infrastructure level.
CREATE TABLE game_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_uuid, game_id)
);
