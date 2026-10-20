-- BOOK-002 analytics credentials: the owner's GA4 API secret and Meta access token.
-- Write-only: no door returns them, and the archive policy excludes this table from
-- backups and native exports, so a restored installation needs them entered again.
CREATE TABLE pm_analytics_keys (provider TEXT PRIMARY KEY CHECK(provider IN ('ga4','meta')), secret TEXT NOT NULL, saved_by TEXT NOT NULL, saved_at TEXT NOT NULL);
-- The latest provider answer per provider: event name, HTTP status and a short label only.
CREATE TABLE pm_analytics_results (provider TEXT PRIMARY KEY CHECK(provider IN ('ga4','meta')), event TEXT NOT NULL, status INTEGER NOT NULL, detail TEXT NOT NULL, at TEXT NOT NULL);
