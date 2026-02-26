-- Save UUID resolution: (user_uuid, game_id, character_name) → save UUID
CREATE TABLE saves (
  uuid TEXT PRIMARY KEY,
  user_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_uuid, game_id, character_name)
);

-- Device event persistence for UI cold-start and diagnostics
CREATE TABLE device_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_device_events_user_device
  ON device_events(user_uuid, device_id, created_at DESC);
