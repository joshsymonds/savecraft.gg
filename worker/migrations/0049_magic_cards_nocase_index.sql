-- Add case-insensitive index for front_face_name lookups.
--
-- Several modules (deckbuilding commander/constructed validation,
-- play-advisor, collection-diff) query magic_cards with
-- `WHERE front_face_name COLLATE NOCASE = ?` or `... IN (?,...)`.
-- The existing idx_magic_cards_front_face_default index has no
-- COLLATE NOCASE so SQLite can't seek — it falls back to a full
-- covering-index scan (~113K rows per query).
--
-- Measured impact: commander 100-card validation took 2700ms per
-- call (2251ms just for the single commander lookup). User-visible
-- symptom: silent slow failures on commander deck checks.

CREATE INDEX idx_magic_cards_front_face_nocase
  ON magic_cards(front_face_name COLLATE NOCASE, is_default);
