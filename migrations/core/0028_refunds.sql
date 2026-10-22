-- Processor-confirmed captured charges only; imported refunds consume balance.
CREATE TABLE pm_refund_charges (
 charge_id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
 imported_refunded_cents INTEGER NOT NULL CHECK(imported_refunded_cents >= 0 AND imported_refunded_cents <= amount_cents),
 currency TEXT NOT NULL CHECK(currency='usd'),
 synced_by TEXT NOT NULL,
 synced_at TEXT NOT NULL
);
CREATE INDEX pm_refund_charges_booking ON pm_refund_charges(booking_id);
CREATE TABLE pm_refunds (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 booking_id TEXT NOT NULL,
 charge_id TEXT NOT NULL REFERENCES pm_refund_charges(charge_id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
 reason TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','canceled')),
 processor_id TEXT UNIQUE,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 processing_until INTEGER NOT NULL DEFAULT 0,
 UNIQUE(actor_id,request_id)
);
CREATE INDEX pm_refunds_person_booking ON pm_refunds(actor_id,booking_id,status);
CREATE INDEX pm_refunds_charge ON pm_refunds(charge_id,status);
CREATE TABLE pm_refund_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 refund_id TEXT NOT NULL REFERENCES pm_refunds(id),
 actor_id TEXT NOT NULL,
 at TEXT NOT NULL,
 before_data TEXT CHECK(before_data IS NULL OR json_valid(before_data)),
 after_data TEXT NOT NULL CHECK(json_valid(after_data))
);
CREATE TRIGGER pm_refund_reserved AFTER INSERT ON pm_refunds BEGIN
 INSERT INTO pm_refund_events(refund_id,actor_id,at,before_data,after_data)
 VALUES(NEW.id,NEW.actor_id,NEW.created_at,NULL,json_object('bookingId',NEW.booking_id,'chargeId',NEW.charge_id,'amountCents',NEW.amount_cents,'reason',NEW.reason,'status',NEW.status,'processorId',NEW.processor_id));
END;
CREATE TRIGGER pm_refund_progress AFTER UPDATE OF status,processor_id ON pm_refunds
WHEN OLD.status != NEW.status OR OLD.processor_id IS NOT NEW.processor_id BEGIN
 INSERT INTO pm_refund_events(refund_id,actor_id,at,before_data,after_data)
 VALUES(NEW.id,NEW.actor_id,NEW.updated_at,
 json_object('bookingId',OLD.booking_id,'chargeId',OLD.charge_id,'amountCents',OLD.amount_cents,'reason',OLD.reason,'status',OLD.status,'processorId',OLD.processor_id),
 json_object('bookingId',NEW.booking_id,'chargeId',NEW.charge_id,'amountCents',NEW.amount_cents,'reason',NEW.reason,'status',NEW.status,'processorId',NEW.processor_id));
END;
