-- Immutable policy/consent facts are portable. Execution credentials are deliberately separate.
CREATE TABLE pm_fee_policies (
 id TEXT PRIMARY KEY,
 version INTEGER NOT NULL UNIQUE CHECK(version > 0),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE TABLE pm_fee_consents (
 id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL UNIQUE,
 policy_id TEXT NOT NULL REFERENCES pm_fee_policies(id),
 actor_id TEXT NOT NULL,
 accepted_at TEXT NOT NULL,
 recorded_at TEXT NOT NULL,
 evidence TEXT NOT NULL,
 booking_snapshot TEXT NOT NULL CHECK(json_valid(booking_snapshot)),
 review_text TEXT NOT NULL
);
-- Never portable: restore historical consent without restoring charge authority.
CREATE TABLE pm_fee_credentials (
 consent_id TEXT PRIMARY KEY REFERENCES pm_fee_consents(id),
 customer_id TEXT NOT NULL,
 payment_method_id TEXT NOT NULL,
 setup_intent_id TEXT NOT NULL UNIQUE
);
CREATE TABLE pm_fee_previews (
 id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL,
 policy_id TEXT NOT NULL REFERENCES pm_fee_policies(id),
 consent_id TEXT REFERENCES pm_fee_consents(id),
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 floor_version INTEGER NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE TABLE pm_fee_assessments (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 booking_id TEXT NOT NULL,
 service_id TEXT NOT NULL,
 policy_id TEXT NOT NULL REFERENCES pm_fee_policies(id),
 consent_id TEXT REFERENCES pm_fee_consents(id),
 preview_id TEXT NOT NULL REFERENCES pm_fee_previews(id),
 kind TEXT NOT NULL CHECK(kind IN ('late_cancel','no_show')),
 event_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents)='integer' AND amount_cents BETWEEN 0 AND 99999999),
 action TEXT NOT NULL CHECK(action IN ('charge','waive')),
 status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','waived')),
 actor_id TEXT NOT NULL,
 reason TEXT NOT NULL,
 evidence TEXT NOT NULL,
 processor_id TEXT UNIQUE,
 charge_id TEXT UNIQUE,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 processing_until INTEGER NOT NULL DEFAULT 0,
 UNIQUE(booking_id,kind)
);
CREATE INDEX pm_fee_assessments_service ON pm_fee_assessments(service_id,status);
CREATE TABLE pm_fee_disputes (
 id TEXT PRIMARY KEY,
 assessment_id TEXT NOT NULL REFERENCES pm_fee_assessments(id),
 actor_id TEXT NOT NULL,
 at TEXT NOT NULL,
 reason TEXT NOT NULL,
 evidence TEXT NOT NULL
);
CREATE TABLE pm_fee_events (
 id TEXT PRIMARY KEY,
 booking_id TEXT,
 actor_id TEXT NOT NULL,
 at TEXT NOT NULL,
 action TEXT NOT NULL,
 subject_id TEXT NOT NULL,
 before_data TEXT CHECK(before_data IS NULL OR json_valid(before_data)),
 after_data TEXT NOT NULL CHECK(json_valid(after_data))
);
