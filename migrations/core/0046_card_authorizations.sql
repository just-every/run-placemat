-- Preserve the agreed hold scope and separately observed provider facts.
ALTER TABLE pm_card_guarantees ADD COLUMN authorization_cents INTEGER NOT NULL DEFAULT 0 CHECK(authorization_cents BETWEEN 0 AND 99999999);
ALTER TABLE pm_card_guarantees ADD COLUMN authorization_reference TEXT;
ALTER TABLE pm_card_guarantees ADD COLUMN authorization_state TEXT NOT NULL DEFAULT 'unconfirmed' CHECK(authorization_state IN ('unconfirmed','held','released','captured'));
ALTER TABLE pm_card_guarantees ADD COLUMN authorization_held_cents INTEGER NOT NULL DEFAULT 0 CHECK(authorization_held_cents BETWEEN 0 AND 99999999);
ALTER TABLE pm_card_guarantees ADD COLUMN authorization_expires_at TEXT;
ALTER TABLE pm_card_guarantees ADD COLUMN authorization_verified_at TEXT;
