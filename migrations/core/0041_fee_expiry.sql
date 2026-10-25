-- Existing agreements have no proven finite authorization, so expire them conservatively.
ALTER TABLE pm_fee_consents ADD COLUMN expires_at TEXT;
ALTER TABLE pm_fee_consents ADD COLUMN recollection_requested_at TEXT;
UPDATE pm_fee_consents SET expires_at=recorded_at;
