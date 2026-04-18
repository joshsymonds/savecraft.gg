-- Purge any leaked Path of Exile install rows.
-- PoE shipped reference modules (build_planner, gem_search, etc.) but no save
-- discovery — GGG API access is still pending. The web install picker now
-- hides reference-only games (web/src/lib/stores/games.ts hasInstallPath),
-- but rows written before that filter need cleanup.
--
-- Idempotent: re-running matches zero rows once complete.

-- Order matters: notes.save_id and search_index.save_id reference saves(uuid)
-- but neither cascades, so they must be deleted before the saves rows.
DELETE FROM notes WHERE save_id IN (SELECT uuid FROM saves WHERE game_id = 'poe');
DELETE FROM search_index WHERE save_id IN (SELECT uuid FROM saves WHERE game_id = 'poe');

-- saves cascades to sections (worker/migrations/0007_fix_sections_fk.sql).
DELETE FROM saves WHERE game_id = 'poe';

-- Per-source game configuration written by the install flow.
DELETE FROM source_configs WHERE game_id = 'poe';
