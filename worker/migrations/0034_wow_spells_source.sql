-- Add source column to wow_spells for data provenance tracking.
-- Values: "blizzard_api" (has resolved description), "talent_tree" (name + description
-- from talent tree tooltip), "spell_name_csv" (name only from wago.tools SpellName).
-- Tells the AI whether a missing description is expected or indicates a data gap.

ALTER TABLE wow_spells ADD COLUMN source TEXT NOT NULL DEFAULT 'blizzard_api';
