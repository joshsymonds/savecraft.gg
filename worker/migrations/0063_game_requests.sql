-- Player-driven requests for unsupported games, logged by the request_game MCP
-- tool. Deduplicated per (user_uuid, game_slug) so tallies count distinct
-- players. game_request_blocks lets an admin exclude a slug from the public
-- tally endpoint (added in a later task) without deleting the underlying rows.
CREATE TABLE game_requests (
  user_uuid TEXT NOT NULL,
  game_slug TEXT NOT NULL,
  game_name TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_uuid, game_slug)
);
CREATE INDEX idx_game_requests_slug ON game_requests(game_slug);

CREATE TABLE game_request_blocks (
  game_slug TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
