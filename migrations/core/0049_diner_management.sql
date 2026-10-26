-- A device holds at most one reviewed reservation preview. Credentials remain excluded from archives.
ALTER TABLE pm_diner_sessions ADD COLUMN management_booking_id TEXT;
ALTER TABLE pm_diner_sessions ADD COLUMN management_fingerprint TEXT;
ALTER TABLE pm_diner_sessions ADD COLUMN preview_id TEXT;
ALTER TABLE pm_diner_sessions ADD COLUMN preview_data TEXT;
