-- Booking identities live in pm_state JSON; inserts are fenced to that state version.
CREATE TABLE pm_payment_requests (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents)='integer' AND amount_cents BETWEEN 50 AND 99999999),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK(currency='usd'),
  due_at TEXT NOT NULL,
  followup_owner_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'unpaid' CHECK(state IN ('unpaid','paid','expired','exception')),
  provider_attempt_at TEXT,
  provider_return_url TEXT,
  provider_session_id TEXT UNIQUE,
  provider_url TEXT,
  verified_at TEXT,
  paid_at TEXT
);
CREATE INDEX pm_payment_requests_due ON pm_payment_requests(state,due_at);
