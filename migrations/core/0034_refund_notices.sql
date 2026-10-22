-- Only an explicit personal owner action sends an outcome notice. No scheduler retries it.
-- Recipient addresses are read at send time and never retained in this table.
CREATE TABLE pm_refund_notices (
 id TEXT PRIMARY KEY,
 refund_id TEXT NOT NULL REFERENCES pm_refunds(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('pending','succeeded','failed','canceled')),
 amount_cents INTEGER NOT NULL,
 remaining_cents INTEGER NOT NULL CHECK(remaining_cents >= 0),
 requested_by TEXT NOT NULL,
 requested_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('sending','accepted','unconfirmed')),
 provider_id TEXT,
 accepted_at TEXT,
 UNIQUE(refund_id,outcome)
);
