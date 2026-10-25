-- Report custody is private and never restored into a new installation.
CREATE TABLE pm_report_schedules (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 recipient_id TEXT NOT NULL,
 recipient_hash TEXT NOT NULL,
 venues TEXT NOT NULL CHECK(json_valid(venues)),
 timezone TEXT NOT NULL,
 next_at TEXT NOT NULL,
 approved_at TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE pm_report_deliveries (
 id TEXT PRIMARY KEY,
 schedule_id TEXT NOT NULL REFERENCES pm_report_schedules(id),
 due_at TEXT NOT NULL,
 date_from TEXT NOT NULL,
 date_to TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('delivery unconfirmed','provider accepted','blocked')),
 reason TEXT NOT NULL DEFAULT '',
 UNIQUE(schedule_id,due_at)
);
