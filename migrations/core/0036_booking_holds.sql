-- Ephemeral checkout capabilities are installation-local and excluded from archives.
-- No contact values or bearer tokens are stored before a booking commits.
CREATE TABLE pm_booking_holds (
 request_hash TEXT PRIMARY KEY,
 id TEXT NOT NULL UNIQUE,
 token_hash TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 allocation TEXT NOT NULL CHECK(json_valid(allocation)),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','abandoned','completed')),
 booking_id TEXT,
 result TEXT CHECK(result IS NULL OR json_valid(result)),
 CHECK((state='completed' AND result IS NOT NULL AND booking_id IS NOT NULL) OR (state!='completed' AND result IS NULL AND booking_id IS NULL))
);
CREATE INDEX pm_booking_holds_live ON pm_booking_holds(state,expires_at);
