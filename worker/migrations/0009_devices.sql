-- Device-centric architecture: devices own saves, users link to devices.
CREATE TABLE IF NOT EXISTS devices (
  device_uuid TEXT PRIMARY KEY,
  user_uuid TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  link_code TEXT,
  link_code_expires_at TEXT,
  hostname TEXT,
  os TEXT,
  arch TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_push_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_uuid);
CREATE INDEX IF NOT EXISTS idx_devices_link_code ON devices(link_code) WHERE link_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(token_hash);
