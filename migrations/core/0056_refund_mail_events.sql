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

-- Live send-time custody is deliberately excluded from portable archives.
CREATE TABLE pm_refund_mail_custody (
 notice_id TEXT PRIMARY KEY REFERENCES pm_refund_notices(id),
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 guest_id TEXT NOT NULL REFERENCES pm_guests(id),
 recipient TEXT NOT NULL
);
-- Minimized provider observations are independent of refunds and human tasks.
CREATE TABLE pm_refund_mail_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 notice_id TEXT NOT NULL REFERENCES pm_refund_notices(id),
 event_id TEXT NOT NULL,
 provider_message_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 status TEXT CHECK(status IN ('accepted','deferred','delivered','bounced','rejected','complained')),
 occurred_at INTEGER NOT NULL CHECK(occurred_at >= 0),
 received_at TEXT NOT NULL,
 UNIQUE(notice_id,event_id)
);
CREATE INDEX pm_refund_mail_events_notice ON pm_refund_mail_events(notice_id,occurred_at);

-- Intake authorization precedes its transaction. Repeat the live identity fence
-- inside that transaction so erasure cannot race an authenticated observation.
CREATE TRIGGER pm_refund_mail_receipt_guard BEFORE INSERT ON rer_mail_event_receipts
WHEN NEW.event_namespace='placemat-refund-notices'
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM pm_refund_mail_custody c JOIN pm_refund_notices n ON n.id=c.notice_id
  JOIN pm_refunds r ON r.id=n.refund_id JOIN pm_guests g ON g.id=c.guest_id
  JOIN pm_state s ON s.id=1,json_each(s.data,'$.bookings') b
  WHERE NEW.provider='sendgrid' AND NEW.tenant_id=c.tenant_id
   AND json_extract(NEW.event_json,'$.deliveryId')=c.notice_id
   AND json_extract(NEW.event_json,'$.product')='placemat-refund-notices:'||c.installation_id
   AND json_extract(b.value,'$.id')=r.booking_id AND json_extract(b.value,'$.guestId')=c.guest_id
   AND COALESCE(json_extract(g.data,'$.erased'),0)=0
   AND json_array_length(NEW.event_json,'$.recipients')=1
   AND json_extract(NEW.event_json,'$.recipients[0]')=c.recipient
   AND n.provider_id IS NOT NULL
   AND (json_extract(NEW.event_json,'$.providerMessageId')=n.provider_id
    OR substr(json_extract(NEW.event_json,'$.providerMessageId'),1,length(n.provider_id)+1)=n.provider_id||'.')
   AND json_extract(NEW.event_json,'$.occurredAt') >= CAST(strftime('%s',n.requested_at) AS INTEGER)*1000
 ) THEN RAISE(ABORT,'refund mail binding unavailable') END;
END;
CREATE TRIGGER pm_refund_mail_observation AFTER INSERT ON rer_mail_event_receipts
WHEN NEW.event_namespace='placemat-refund-notices'
BEGIN
 INSERT INTO pm_refund_mail_events(notice_id,event_id,provider_message_id,event_type,status,occurred_at,received_at)
 VALUES(json_extract(NEW.event_json,'$.deliveryId'),NEW.event_id,
  json_extract(NEW.event_json,'$.providerMessageId'),json_extract(NEW.event_json,'$.type'),
  json_extract(NEW.event_json,'$.status'),json_extract(NEW.event_json,'$.occurredAt'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
