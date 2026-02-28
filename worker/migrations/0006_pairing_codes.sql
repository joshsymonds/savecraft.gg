CREATE TABLE pairing_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  user_uuid TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL
);
