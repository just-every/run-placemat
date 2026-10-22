-- Keep each person's failed attempts within the documented 15-minute window.
ALTER TABLE pm_host_pins ADD COLUMN failure_window_at INTEGER NOT NULL DEFAULT 0;
-- Preserve existing failed attempts conservatively across the schema upgrade.
UPDATE pm_host_pins SET failure_window_at=unixepoch('now')*1000 WHERE failures>0;
