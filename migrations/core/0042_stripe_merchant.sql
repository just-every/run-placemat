-- Connection state is installation custody; portable financial history stays in the fee event journal.
CREATE TABLE pm_stripe_merchant (
 id INTEGER PRIMARY KEY CHECK(id=1),
 account_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('connected','restricted','disconnected')),
 charges_enabled INTEGER NOT NULL CHECK(charges_enabled IN (0,1)),
 payouts_enabled INTEGER NOT NULL CHECK(payouts_enabled IN (0,1)),
 details_submitted INTEGER NOT NULL CHECK(details_submitted IN (0,1)),
 livemode INTEGER NOT NULL CHECK(livemode IN (0,1)),
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE pm_stripe_collections (
 id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL,
 account_id TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 provider_reference TEXT UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('pending','collected','expired')),
 verified_at TEXT
);
CREATE TABLE pm_stripe_collection_custody (
 collection_id TEXT PRIMARY KEY REFERENCES pm_stripe_collections(id),
 return_url TEXT NOT NULL,
 provider_url TEXT,
 setup_reference TEXT,
 customer_reference TEXT,
 method_reference TEXT
);

-- Each collection carries its own immutable guest agreement and booking facts.
CREATE TABLE pm_card_guarantees (
 id TEXT PRIMARY KEY REFERENCES pm_stripe_collections(id),
 booking_id TEXT NOT NULL,
 policy_id TEXT NOT NULL REFERENCES pm_fee_policies(id),
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 accepted_at TEXT,
 review_text TEXT NOT NULL,
 booking_snapshot TEXT NOT NULL CHECK(json_valid(booking_snapshot)),
 expires_at TEXT NOT NULL,
 ended_at TEXT,
 recollection_requested_at TEXT,
 max_fee_cents INTEGER NOT NULL CHECK(max_fee_cents BETWEEN 0 AND 99999999)
);
ALTER TABLE pm_stripe_collection_custody ADD COLUMN token_hash TEXT;
ALTER TABLE pm_stripe_collection_custody ADD COLUMN token_expires_at TEXT;
ALTER TABLE pm_fee_assessments ADD COLUMN guest_consent_id TEXT REFERENCES pm_card_guarantees(id);
