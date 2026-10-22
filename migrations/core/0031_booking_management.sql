-- Bearers never enter state, audit or business archives. Only their hashes live here.
-- Restores must discard this table; an owner must explicitly issue fresh links.
CREATE TABLE pm_booking_management (
 booking_id TEXT PRIMARY KEY,
 guest_id TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL,
 preview_id TEXT,
 preview_data TEXT CHECK(preview_data IS NULL OR json_valid(preview_data))
);
CREATE INDEX pm_booking_management_guest ON pm_booking_management(guest_id);
-- Reservation-specific contact edits never mutate a shared guest profile.
CREATE TABLE pm_booking_contacts (
 booking_id TEXT PRIMARY KEY,
 guest_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 updated_at TEXT NOT NULL
);
CREATE INDEX pm_booking_contacts_guest ON pm_booking_contacts(guest_id);
