-- Add power and toughness columns to mtga_cards.
-- Populated by mtga-carddb from MTGA client Raw_CardDatabase.
ALTER TABLE mtga_cards ADD COLUMN power TEXT NOT NULL DEFAULT '';
ALTER TABLE mtga_cards ADD COLUMN toughness TEXT NOT NULL DEFAULT '';
