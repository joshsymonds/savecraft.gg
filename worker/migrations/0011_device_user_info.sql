-- Add user display info to devices table (cached at link time)
ALTER TABLE devices ADD COLUMN user_email TEXT;
ALTER TABLE devices ADD COLUMN user_display_name TEXT;
