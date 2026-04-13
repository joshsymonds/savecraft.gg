-- Add produced_mana column to mtga_cards.
-- Stores the colors of mana a card can produce as a JSON array (e.g. '["W","U"]').
-- Used by tagger-fetch to auto-detect mana_fixing role for multi-color lands.
ALTER TABLE mtga_cards ADD COLUMN produced_mana TEXT NOT NULL DEFAULT '[]';
