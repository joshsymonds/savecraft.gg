-- Add front_face_name column for robust card name matching.
-- 17Lands and MTGA draft_history use front-face-only names (e.g. "Bonecrusher Giant"),
-- but Scryfall stores full names with " // " (e.g. "Bonecrusher Giant // Stomp").
-- All lookups from external sources should use front_face_name.

ALTER TABLE mtga_cards ADD COLUMN front_face_name TEXT NOT NULL DEFAULT '';

-- Backfill: extract everything before " // ", or use full name if no separator.
UPDATE mtga_cards SET front_face_name = CASE
  WHEN instr(name, ' // ') > 0 THEN substr(name, 1, instr(name, ' // ') - 1)
  ELSE name
END;

CREATE INDEX IF NOT EXISTS idx_mtga_cards_front_face
  ON mtga_cards(front_face_name);
CREATE INDEX IF NOT EXISTS idx_mtga_cards_front_face_default
  ON mtga_cards(front_face_name, is_default);
