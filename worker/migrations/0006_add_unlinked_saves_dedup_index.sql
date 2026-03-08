-- Enforce uniqueness for unlinked saves at the DB level.
-- SQLite's UNIQUE constraint on (user_uuid, game_id, save_name) does not
-- prevent duplicates when user_uuid IS NULL (NULL != NULL in SQL).
-- This partial index covers the unlinked case.
CREATE UNIQUE INDEX IF NOT EXISTS idx_saves_unlinked_dedup
  ON saves(last_source_uuid, game_id, save_name)
  WHERE user_uuid IS NULL;
