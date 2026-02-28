-- Add human-readable game name to saves (denormalized from plugin manifest)
ALTER TABLE saves ADD COLUMN game_name TEXT NOT NULL DEFAULT '';
