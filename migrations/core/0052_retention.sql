-- Marketing authority and bearer credentials are installation-local, never portable.
CREATE TABLE pm_retention_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),owner_id TEXT NOT NULL,revision TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE pm_retention_facts(guest_id TEXT PRIMARY KEY,created_at TEXT NOT NULL,birthday TEXT,anniversary TEXT,provenance TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE pm_retention_consents(guest_id TEXT PRIMARY KEY,id TEXT NOT NULL UNIQUE,email_hash TEXT NOT NULL,identity_data TEXT NOT NULL,purpose TEXT NOT NULL CHECK(purpose='venue-email-marketing'),venue_scope TEXT NOT NULL,confirmed_at TEXT NOT NULL);
CREATE TABLE pm_retention_tokens(token_hash TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('confirm','unsubscribe','offer')),guest_id TEXT NOT NULL,email_hash TEXT NOT NULL,identity_data TEXT NOT NULL,consent_id TEXT,message_id TEXT,venue_scope TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE pm_retention_requests(email_hash TEXT PRIMARY KEY,requested_at TEXT NOT NULL);
CREATE TABLE pm_retention_workflows(id TEXT PRIMARY KEY,data TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('draft','approved','stopped')),preview_hash TEXT,preview_data TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE pm_retention_approvals(workflow_id TEXT PRIMARY KEY REFERENCES pm_retention_workflows(id) ON DELETE CASCADE,owner_id TEXT NOT NULL,grant_revision TEXT NOT NULL,preview_hash TEXT NOT NULL,approved_at TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE pm_retention_deliveries(id TEXT PRIMARY KEY,workflow_id TEXT NOT NULL REFERENCES pm_retention_workflows(id) ON DELETE CASCADE,guest_id TEXT NOT NULL,occurrence TEXT NOT NULL,offer_data TEXT NOT NULL,email_hash TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('claimed','accepted','unconfirmed','suppressed','cancelled')),created_at TEXT NOT NULL,accepted_at TEXT,cap_until TEXT NOT NULL,provider_id TEXT,UNIQUE(workflow_id,guest_id,occurrence));
CREATE INDEX pm_retention_delivery_cap ON pm_retention_deliveries(guest_id,created_at);
CREATE INDEX pm_retention_address_cap ON pm_retention_deliveries(email_hash,created_at);
CREATE TABLE pm_retention_attributions(booking_id TEXT PRIMARY KEY,delivery_id TEXT NOT NULL REFERENCES pm_retention_deliveries(id) ON DELETE CASCADE,guest_id TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TRIGGER pm_retention_owner_revoke AFTER UPDATE OF role,status ON oa_operators WHEN (NEW.role!='owner' OR NEW.status!='active') AND EXISTS(SELECT 1 FROM pm_retention_settings WHERE owner_id=NEW.id) BEGIN
 DELETE FROM pm_retention_approvals WHERE owner_id=NEW.id;
 UPDATE pm_retention_settings SET enabled=0,revision=lower(hex(randomblob(16))) WHERE owner_id=NEW.id;
 UPDATE pm_retention_workflows SET status='stopped' WHERE status='approved';
 UPDATE pm_retention_deliveries SET state='cancelled' WHERE state='claimed';
END;
CREATE TRIGGER pm_retention_owner_delete AFTER DELETE ON oa_operators WHEN EXISTS(SELECT 1 FROM pm_retention_settings WHERE owner_id=OLD.id) BEGIN
 DELETE FROM pm_retention_approvals WHERE owner_id=OLD.id;
 UPDATE pm_retention_settings SET enabled=0,revision=lower(hex(randomblob(16))) WHERE owner_id=OLD.id;
 UPDATE pm_retention_workflows SET status='stopped' WHERE status='approved';
 UPDATE pm_retention_deliveries SET state='cancelled' WHERE state='claimed';
END;
CREATE TRIGGER pm_retention_contact_revoke AFTER UPDATE ON pm_guests
WHEN COALESCE(json_extract(NEW.data,'$.erased'),0)=1 OR json_extract(NEW.data,'$.mergedInto') IS NOT NULL
 OR COALESCE(json_extract(NEW.data,'$.email'),'')!=COALESCE(json_extract(OLD.data,'$.email'),'')
 OR COALESCE(json_extract(NEW.data,'$.name'),'')!=COALESCE(json_extract(OLD.data,'$.name'),'') BEGIN
 DELETE FROM pm_retention_consents WHERE guest_id=NEW.id;
 DELETE FROM pm_retention_tokens WHERE guest_id=NEW.id;
 UPDATE pm_retention_deliveries SET state='cancelled' WHERE guest_id=NEW.id AND state='claimed';
END;
CREATE TRIGGER pm_retention_guest_delete AFTER DELETE ON pm_guests BEGIN
 DELETE FROM pm_retention_consents WHERE guest_id=OLD.id;
 DELETE FROM pm_retention_tokens WHERE guest_id=OLD.id;
 UPDATE pm_retention_deliveries SET state='cancelled' WHERE guest_id=OLD.id AND state='claimed';
END;
