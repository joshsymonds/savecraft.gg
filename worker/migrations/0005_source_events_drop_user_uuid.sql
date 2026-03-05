-- Remove user_uuid from source_events. Events belong to sources, not users.
-- User association is resolved via JOIN on the sources table.

-- SQLite doesn't support DROP COLUMN on indexed columns cleanly,
-- so recreate the table without user_uuid.
CREATE TABLE source_events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_uuid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO source_events_new (id, source_uuid, event_type, event_data, created_at)
  SELECT id, source_uuid, event_type, event_data, created_at FROM source_events;

DROP TABLE source_events;
ALTER TABLE source_events_new RENAME TO source_events;

CREATE INDEX idx_source_events_source
  ON source_events(source_uuid, created_at DESC);
