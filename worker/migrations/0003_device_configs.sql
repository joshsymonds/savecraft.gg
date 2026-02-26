-- Per-device game configuration pushed from the web UI to daemons
CREATE TABLE device_configs (
  user_uuid TEXT NOT NULL,
  device_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  save_path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  file_extensions TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_uuid, device_id, game_id)
);

CREATE INDEX idx_device_configs_user_device
  ON device_configs(user_uuid, device_id);
