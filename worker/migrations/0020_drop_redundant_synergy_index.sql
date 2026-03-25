-- Drop redundant index: the PK (set_code, card_a, card_b) already provides
-- a B-tree on the (set_code, card_a) prefix in SQLite.
DROP INDEX IF EXISTS idx_draft_synergies_lookup;
