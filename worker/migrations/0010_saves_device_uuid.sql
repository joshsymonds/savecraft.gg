-- Pre-launch: replace user_uuid with device_uuid on saves table.
-- Devices own saves; users access saves through device→user join.
DROP TABLE IF EXISTS saves;
CREATE TABLE saves (
  uuid TEXT PRIMARY KEY,
  device_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  game_name TEXT NOT NULL DEFAULT '',
  save_name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (device_uuid, game_id, save_name)
);
CREATE INDEX idx_saves_device ON saves(device_uuid);

-- Pre-launch: remove user_uuid from search_index. Scoping is via save_id join.
DROP TABLE IF EXISTS search_index;
CREATE VIRTUAL TABLE search_index USING fts5(
  save_id UNINDEXED,
  save_name UNINDEXED,
  type UNINDEXED,
  ref_id UNINDEXED,
  ref_title UNINDEXED,
  content,
  tokenize='porter unicode61'
);
