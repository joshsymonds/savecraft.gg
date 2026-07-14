-- Mutable display label for a save, distinct from the immutable
-- save_name identity key. save_name is part of the save identity key
-- (source_uuid, game_id, save_name); a display label that changes
-- between pushes (e.g. a player renaming their account) must not fork
-- the identity key into a new save row. display_name is updated in
-- place on every push instead — see storePush in worker/src/store.ts.
ALTER TABLE saves ADD COLUMN display_name TEXT;
