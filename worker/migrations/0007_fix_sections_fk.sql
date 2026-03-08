-- Fix sections FK referencing phantom "_saves_old" table.
--
-- Migration 0005 used ALTER TABLE saves RENAME TO _saves_old, which caused
-- SQLite to rewrite the sections FK from saves(uuid) to _saves_old(uuid).
-- After _saves_old was dropped, the FK points to a non-existent table,
-- silently rejecting all section inserts.

PRAGMA foreign_keys=OFF;

ALTER TABLE sections RENAME TO _sections_old;

CREATE TABLE sections (
  save_uuid TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (save_uuid, name),
  FOREIGN KEY (save_uuid) REFERENCES saves(uuid) ON DELETE CASCADE
);

INSERT INTO sections SELECT * FROM _sections_old;

DROP TABLE _sections_old;

PRAGMA foreign_keys=ON;
