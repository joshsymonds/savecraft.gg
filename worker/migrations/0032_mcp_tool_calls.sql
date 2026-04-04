-- Replace mcp_activity (bare user UUID set) with mcp_tool_calls (full request logging).
CREATE TABLE mcp_tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  params TEXT,
  response_size INTEGER,
  is_error INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  mcp_client TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_mcp_tool_calls_user ON mcp_tool_calls(user_uuid);
CREATE INDEX idx_mcp_tool_calls_created ON mcp_tool_calls(created_at);

DROP TABLE mcp_activity;
