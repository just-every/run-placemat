CREATE TABLE pm_payment_cases (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, charge_id TEXT NOT NULL UNIQUE,
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 99999999), currency TEXT NOT NULL CHECK(currency='usd'),
 reason TEXT NOT NULL, status TEXT NOT NULL, due_at TEXT NOT NULL,
 ledger TEXT NOT NULL CHECK(json_valid(ledger)), opened_by TEXT NOT NULL, opened_at TEXT NOT NULL
);
CREATE TABLE pm_payment_reviews (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES pm_payment_cases(id),
 evidence TEXT NOT NULL CHECK(json_valid(evidence)), digest TEXT NOT NULL,
 response TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT
);
CREATE TABLE pm_accounting_exports (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL UNIQUE REFERENCES pm_payment_cases(id),
 review_id TEXT NOT NULL REFERENCES pm_payment_reviews(id), actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 journal TEXT NOT NULL CHECK(json_valid(journal)), ledger TEXT NOT NULL CHECK(json_valid(ledger)),
 state TEXT NOT NULL CHECK(state IN ('reserved','accepted','rejected','unconfirmed')),
 provider_id TEXT, code TEXT NOT NULL, trace_id TEXT, updated_at TEXT NOT NULL
);
-- A restored review is history, never a new execution grant.
CREATE TABLE pm_payment_operation_custody (review_id TEXT PRIMARY KEY REFERENCES pm_payment_reviews(id));
