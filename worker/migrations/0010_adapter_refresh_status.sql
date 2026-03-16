-- Track periodic adapter refresh outcomes per save.
ALTER TABLE saves ADD COLUMN refresh_status TEXT;
ALTER TABLE saves ADD COLUMN refresh_error TEXT;
