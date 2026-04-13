-- Rename remaining mtga_* tables to magic_* on existing D1 instances.
-- Fresh D1s replay 0014–0042 with mtga_* names and then this migration
-- renames them, ending in the same state as the codebase expects.
--
-- ALTER TABLE RENAME is O(1) schema-only in SQLite; indexes follow the table.
-- FTS5 virtual tables do not support RENAME, so each FTS index is dropped
-- and recreated from the renamed source table.

-- ── Reference content ───────────────────────────────────────
ALTER TABLE mtga_rules RENAME TO magic_rules;
ALTER TABLE mtga_card_roles RENAME TO magic_card_roles;
ALTER TABLE mtga_set_metadata RENAME TO magic_set_metadata;
ALTER TABLE mtga_interactions RENAME TO magic_interactions;

-- ── Draft (17lands) ─────────────────────────────────────────
ALTER TABLE mtga_draft_ratings RENAME TO magic_draft_ratings;
ALTER TABLE mtga_draft_deck_stats RENAME TO magic_draft_deck_stats;
ALTER TABLE mtga_draft_archetype_curves RENAME TO magic_draft_archetype_curves;
ALTER TABLE mtga_draft_archetype_stats RENAME TO magic_draft_archetype_stats;
ALTER TABLE mtga_draft_calibration RENAME TO magic_draft_calibration;
ALTER TABLE mtga_draft_synergies RENAME TO magic_draft_synergies;
ALTER TABLE mtga_draft_role_targets RENAME TO magic_draft_role_targets;
ALTER TABLE mtga_draft_set_stats RENAME TO magic_draft_set_stats;

-- ── Constructed meta ────────────────────────────────────────
ALTER TABLE mtga_meta_archetypes RENAME TO magic_meta_archetypes;
ALTER TABLE mtga_meta_decklists RENAME TO magic_meta_decklists;
ALTER TABLE mtga_meta_matchups RENAME TO magic_meta_matchups;

-- ── Play advisor baselines ──────────────────────────────────
ALTER TABLE mtga_play_card_timing RENAME TO magic_play_card_timing;
ALTER TABLE mtga_play_combat RENAME TO magic_play_combat;
ALTER TABLE mtga_play_mulligan RENAME TO magic_play_mulligan;
ALTER TABLE mtga_play_tempo RENAME TO magic_play_tempo;
ALTER TABLE mtga_play_turn_baselines RENAME TO magic_play_turn_baselines;

-- ── User match history (PushSave-ingested constructed log) ──
ALTER TABLE mtga_match_history RENAME TO magic_match_history;

-- ── FTS5 rebuilds ───────────────────────────────────────────
-- Each FTS5 table must be dropped and recreated; ALTER TABLE RENAME does not
-- work on virtual tables. Rebuild from the renamed source table.

DROP TABLE IF EXISTS mtga_rules_fts;
CREATE VIRTUAL TABLE magic_rules_fts USING fts5(
  number UNINDEXED,
  text,
  example,
  tokenize='porter unicode61'
);
INSERT INTO magic_rules_fts (number, text, example)
  SELECT number, text, example FROM magic_rules;

DROP TABLE IF EXISTS mtga_draft_ratings_fts;
CREATE VIRTUAL TABLE magic_draft_ratings_fts USING fts5(
  set_code UNINDEXED,
  card_name,
  tokenize='porter unicode61'
);
INSERT INTO magic_draft_ratings_fts (set_code, card_name)
  SELECT set_code, card_name FROM magic_draft_ratings;

DROP TABLE IF EXISTS mtga_interactions_fts;
CREATE VIRTUAL TABLE magic_interactions_fts USING fts5(
  id UNINDEXED,
  title,
  mechanics,
  card_names,
  breakdown,
  tokenize='porter unicode61'
);
INSERT INTO magic_interactions_fts (id, title, mechanics, card_names, breakdown)
  SELECT id, title, mechanics, card_names, breakdown FROM magic_interactions;
