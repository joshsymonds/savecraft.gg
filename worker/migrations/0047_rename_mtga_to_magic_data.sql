-- Convert orphaned mtga rows to magic after the 2026-04-12 plugin rename
-- (commits 322d3fd, f15fedc, e19744d). The Worker alias in src/gameid.ts
-- catches new pushes going forward; this migration rewrites the rows that
-- were written with game_id='mtga' between the code rename and the alias
-- deploy — and stale per-source config rows pointing at the old id.
--
-- Idempotent: re-running matches zero rows once complete.
-- No unique-constraint collisions exist as of 2026-04-17 (verified in prod).

UPDATE saves SET game_id = 'magic' WHERE game_id = 'mtga';
UPDATE source_configs SET game_id = 'magic' WHERE game_id = 'mtga';
