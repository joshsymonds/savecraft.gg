-- Purge stale Magic (MTGA) save rows keyed by the pre-rekey mutable
-- display name.
--
-- Why safe: before this epic, Magic save identity was
-- (source_uuid, game_id, save_name) where save_name was the player's
-- MTGA screen name — mutable, and unknown at first launch for over half
-- of production rows ("Unknown Player"). Commit 97ab478e re-keys the
-- plugin to the constant save_name "player" for every future push
-- (MTGA is one save per source) and moves the screen name to the
-- mutable display_name column instead. Every pre-existing magic save
-- row is therefore stale by construction: its identity key can never be
-- produced by the plugin again. The daemon's next push for each source
-- recreates a clean save row (and its sections/notes/search_index)
-- under the new "player" key. Pre-launch: hard delete, no soft-delete
-- shim, no migration path for the old rows.
--
-- Order matters: sections.save_uuid, search_index.save_id, and
-- notes.save_id all reference saves(uuid) but nothing cascades
-- automatically in this schema (same pattern as
-- worker/migrations/0048_purge_poe_installs.sql), so dependents must be
-- deleted before the saves rows themselves.
--
-- Idempotent: once no saves row has game_id = 'magic', every DELETE
-- below matches zero rows and the migration is a no-op — safe to apply
-- to a DB that has already been cleaned, or that never had magic saves.
--
-- Post-deploy verification (all four should return 0 — orphan checks,
-- not scoped to game_id since the saves rows are gone by then):
--   SELECT COUNT(*) FROM saves WHERE game_id = 'magic';
--   SELECT COUNT(*) FROM sections s LEFT JOIN saves v ON v.uuid = s.save_uuid WHERE v.uuid IS NULL;
--   SELECT COUNT(*) FROM search_index si LEFT JOIN saves v ON v.uuid = si.save_id WHERE v.uuid IS NULL;
--   SELECT COUNT(*) FROM notes n LEFT JOIN saves v ON v.uuid = n.save_id WHERE v.uuid IS NULL;

DELETE FROM sections WHERE save_uuid IN (SELECT uuid FROM saves WHERE game_id = 'magic');
DELETE FROM search_index WHERE save_id IN (SELECT uuid FROM saves WHERE game_id = 'magic');
DELETE FROM notes WHERE save_id IN (SELECT uuid FROM saves WHERE game_id = 'magic');
DELETE FROM saves WHERE game_id = 'magic';
