-- Additive migration. Never drop existing delivery receipts or state.
CREATE TABLE IF NOT EXISTS rer_mail_event_receipts (
  provider TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_namespace TEXT NOT NULL,
  event_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  event_json TEXT NOT NULL,
  commit_token TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  conflict INTEGER NOT NULL DEFAULT 0 CONSTRAINT rer_mail_event_identity_conflict CHECK (conflict = 0),
  PRIMARY KEY (provider, tenant_id, event_namespace, event_id)
);
CREATE TABLE IF NOT EXISTS rer_mail_event_states (
  provider TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_namespace TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  terminal INTEGER NOT NULL CHECK (terminal IN (0, 1)),
  PRIMARY KEY (provider, tenant_id, event_namespace, provider_message_id, recipient)
);

-- Original recipient custody is separate from booking and private-link state.
CREATE TABLE pm_booking_mail (
 delivery_id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL,
 guest_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider='resend'),
 tenant_id TEXT NOT NULL,
 event_namespace TEXT NOT NULL,
 provider_message_id TEXT,
 recipient TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 accepted_at TEXT,
 historical INTEGER NOT NULL DEFAULT 0 CHECK(historical IN (0,1)),
 UNIQUE(provider,tenant_id,event_namespace,provider_message_id)
);
-- Close the interval between intake authorization and persistence during erasure.
CREATE TRIGGER pm_booking_mail_receipt_fence BEFORE INSERT ON rer_mail_event_receipts
WHEN NEW.provider='resend'
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM pm_booking_mail m JOIN pm_guests g ON g.id=m.guest_id
  WHERE m.provider=NEW.provider AND m.tenant_id=NEW.tenant_id AND m.event_namespace=NEW.event_namespace
   AND m.provider_message_id=json_extract(NEW.event_json,'$.providerMessageId')
   AND json_array_length(NEW.event_json,'$.recipients')=1
   AND m.recipient=json_extract(NEW.event_json,'$.recipients[0]')
   AND m.accepted_at IS NOT NULL AND coalesce(json_extract(g.data,'$.erased'),0)=0
   AND json_extract(g.data,'$.mergedInto') IS NULL
 ) THEN RAISE(ABORT,'pm_booking_mail_binding_unavailable') END;
END;
CREATE TRIGGER pm_booking_mail_state_fence BEFORE INSERT ON rer_mail_event_states
WHEN NEW.provider='resend'
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM pm_booking_mail m JOIN pm_guests g ON g.id=m.guest_id
  WHERE m.provider=NEW.provider AND m.tenant_id=NEW.tenant_id AND m.event_namespace=NEW.event_namespace
   AND m.provider_message_id=NEW.provider_message_id AND m.recipient=NEW.recipient
   AND m.accepted_at IS NOT NULL AND coalesce(json_extract(g.data,'$.erased'),0)=0
   AND json_extract(g.data,'$.mergedInto') IS NULL
 ) THEN RAISE(ABORT,'pm_booking_mail_binding_unavailable') END;
END;
CREATE TRIGGER pm_booking_mail_erase AFTER DELETE ON pm_booking_mail
BEGIN
 DELETE FROM rer_mail_event_states WHERE provider=OLD.provider AND tenant_id=OLD.tenant_id
  AND event_namespace=OLD.event_namespace AND provider_message_id=OLD.provider_message_id;
 DELETE FROM rer_mail_event_receipts WHERE provider=OLD.provider AND tenant_id=OLD.tenant_id
  AND event_namespace=OLD.event_namespace AND json_extract(event_json,'$.providerMessageId')=OLD.provider_message_id;
END;
