ALTER TABLE pm_payment_requests ADD COLUMN per_guest_cents INTEGER;
ALTER TABLE pm_payment_requests ADD COLUMN original_party_size INTEGER;
CREATE TRIGGER pm_deposit_scope_immutable BEFORE UPDATE OF per_guest_cents,original_party_size,amount_cents,booking_id ON pm_payment_requests
WHEN NEW.per_guest_cents IS NOT OLD.per_guest_cents OR NEW.original_party_size IS NOT OLD.original_party_size OR NEW.amount_cents != OLD.amount_cents OR NEW.booking_id != OLD.booking_id
BEGIN SELECT RAISE(ABORT,'Deposit scope is immutable'); END;
