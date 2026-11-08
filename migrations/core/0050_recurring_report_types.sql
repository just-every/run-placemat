-- Existing weekly group reports keep their original custody and projection.
ALTER TABLE pm_report_schedules ADD COLUMN report_kind TEXT NOT NULL DEFAULT 'group-covers' CHECK(report_kind IN ('group-covers','reservations','guests','finance'));
ALTER TABLE pm_report_schedules ADD COLUMN service_id TEXT;
