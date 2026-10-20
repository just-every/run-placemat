CREATE TABLE pm_performance_reports (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  published_by TEXT NOT NULL,
  floor_version INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX pm_performance_reports_service ON pm_performance_reports(service_id, published_at);
