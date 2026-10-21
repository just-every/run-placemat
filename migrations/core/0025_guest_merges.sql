-- Reviewed identity changes and reversible record snapshots. Access is manager-only.
CREATE TABLE pm_guest_merges (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL DEFAULT 1,
 data TEXT NOT NULL CHECK(json_valid(data))
);
