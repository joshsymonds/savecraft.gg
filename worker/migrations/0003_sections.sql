-- Save section data: per-section storage for MCP tool queries.
-- Replaces R2 blob storage with precise per-section D1 access.
CREATE TABLE sections (
  save_uuid TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (save_uuid, name),
  FOREIGN KEY (save_uuid) REFERENCES saves(uuid) ON DELETE CASCADE
);
