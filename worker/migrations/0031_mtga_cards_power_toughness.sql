-- Add power and toughness columns to magic_cards.
-- Populated by mtga-carddb from MTGA client Raw_CardDatabase.
ALTER TABLE magic_cards ADD COLUMN power TEXT NOT NULL DEFAULT '';
ALTER TABLE magic_cards ADD COLUMN toughness TEXT NOT NULL DEFAULT '';
