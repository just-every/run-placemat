CREATE TABLE pm_diner_accounts (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
 preferences TEXT NOT NULL DEFAULT ''
);
CREATE TABLE pm_diner_bookings (
 account_id TEXT NOT NULL,
 booking_id TEXT NOT NULL,
 guest_id TEXT NOT NULL,
 verified_at TEXT NOT NULL,
 PRIMARY KEY(account_id,booking_id)
);
CREATE TABLE pm_diner_challenges (
 digest TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL,
 guest_id TEXT NOT NULL,
 email TEXT NOT NULL,
 contact_digest TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE pm_diner_sessions (
 digest TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);

CREATE TABLE pm_diner_mail_limits (
 booking_id TEXT NOT NULL,
 day TEXT NOT NULL,
 count INTEGER NOT NULL,
 PRIMARY KEY(booking_id,day)
);
