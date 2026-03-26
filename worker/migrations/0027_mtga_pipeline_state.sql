-- Per-tool, per-set content hash tracking for the MTGA data pipeline.
-- Tools check this table before processing to skip unchanged data.
-- Prevents redundant CSV reprocessing and enables retry-from-disk.

CREATE TABLE IF NOT EXISTS mtga_pipeline_state (
  tool         TEXT NOT NULL,
  set_code     TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  imported_at  TEXT NOT NULL,
  row_count    INTEGER NOT NULL,
  PRIMARY KEY (tool, set_code)
);
