-- Failed PIN attempts expire independently for each person. Existing counters
-- start a fresh bounded window on their next failed attempt; active blocks remain.
ALTER TABLE pm_host_pins ADD COLUMN failure_window_at INTEGER NOT NULL DEFAULT 0;
