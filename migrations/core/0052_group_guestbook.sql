CREATE TABLE pm_group_guests (
 account_id TEXT PRIMARY KEY,
 profile_id TEXT NOT NULL UNIQUE,
 group_origin TEXT NOT NULL,
 binding TEXT NOT NULL,
 preferences INTEGER NOT NULL DEFAULT 0 CHECK(preferences IN (0,1)),
 visits INTEGER NOT NULL DEFAULT 0 CHECK(visits IN (0,1)),
 rebooking INTEGER NOT NULL DEFAULT 0 CHECK(rebooking IN (0,1)),
 updated_at TEXT NOT NULL
);
CREATE TABLE pm_group_guest_codes (
 digest TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 profile_id TEXT NOT NULL,
 link_id TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
