-- Policy and bearer custody remain installation-local; business visits can be exported inertly.
CREATE TABLE pm_feedback_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 owner_id TEXT NOT NULL, public_review_url TEXT NOT NULL DEFAULT '', recovery_assignee_id TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE pm_feedback_visits (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE, guest_id TEXT NOT NULL, visit_date TEXT NOT NULL,
 invite_state TEXT NOT NULL CHECK(invite_state IN ('claimed','accepted','unconfirmed','suppressed')),
 provider_id TEXT, created_at TEXT NOT NULL, rating INTEGER CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL DEFAULT '',
 submitted_at TEXT, withdrawn_at TEXT, assignee_id TEXT, due_at TEXT,
 assigned_by TEXT, assigned_at TEXT, closed_by TEXT, case_state TEXT CHECK(case_state IN ('open','closed')), outcome TEXT NOT NULL DEFAULT '', closed_at TEXT
);
CREATE TABLE pm_feedback_credentials (
 visit_id TEXT PRIMARY KEY REFERENCES pm_feedback_visits(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, email_hash TEXT NOT NULL,
 consent_at TEXT NOT NULL, expires_at TEXT NOT NULL, contact_data TEXT NOT NULL
);
CREATE TABLE pm_feedback_messages (
 id TEXT PRIMARY KEY, visit_id TEXT NOT NULL REFERENCES pm_feedback_visits(id) ON DELETE CASCADE,
 author TEXT NOT NULL CHECK(author IN ('guest','manager')), actor_id TEXT, message TEXT NOT NULL,
 at TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('recorded','pending','accepted','unconfirmed')),
 request_id TEXT UNIQUE, provider_id TEXT
);
CREATE INDEX pm_feedback_guest ON pm_feedback_visits(guest_id);
CREATE INDEX pm_feedback_thread ON pm_feedback_messages(visit_id,at,id);
-- Revocation is durable even if an operator or contact is later restored to its previous value.
CREATE TRIGGER pm_feedback_owner_revoke AFTER UPDATE OF role,status ON oa_operators
WHEN NEW.role!='owner' OR NEW.status!='active' BEGIN
 DELETE FROM pm_feedback_credentials WHERE owner_id=NEW.id;
 UPDATE pm_feedback_settings SET enabled=0 WHERE owner_id=NEW.id;
END;
CREATE TRIGGER pm_feedback_contact_revoke AFTER UPDATE ON pm_booking_contacts
WHEN NEW.data!=OLD.data OR NEW.guest_id!=OLD.guest_id BEGIN
 DELETE FROM pm_feedback_credentials WHERE visit_id IN (SELECT id FROM pm_feedback_visits WHERE booking_id=NEW.booking_id);
END;
CREATE TRIGGER pm_feedback_contact_delete AFTER DELETE ON pm_booking_contacts BEGIN
 DELETE FROM pm_feedback_credentials WHERE visit_id IN (SELECT id FROM pm_feedback_visits WHERE booking_id=OLD.booking_id);
END;
CREATE TRIGGER pm_feedback_guest_revoke AFTER UPDATE ON pm_guests
WHEN json_extract(NEW.data,'$.erased')=1 OR json_extract(NEW.data,'$.mergedInto') IS NOT NULL OR COALESCE(json_extract(NEW.data,'$.email'),'')!=COALESCE(json_extract(OLD.data,'$.email'),'')
 OR COALESCE(json_extract(NEW.data,'$.name'),'')!=COALESCE(json_extract(OLD.data,'$.name'),'')
 OR COALESCE(json_extract(NEW.data,'$.phone'),'')!=COALESCE(json_extract(OLD.data,'$.phone'),'') BEGIN
 DELETE FROM pm_feedback_credentials WHERE visit_id IN (SELECT id FROM pm_feedback_visits WHERE guest_id=NEW.id);
END;
CREATE TRIGGER pm_feedback_booking_revoke AFTER UPDATE ON pm_state BEGIN
 DELETE FROM pm_feedback_credentials WHERE visit_id IN (
 SELECT v.id FROM pm_feedback_visits v JOIN pm_feedback_credentials c ON c.visit_id=v.id
 WHERE NOT EXISTS(SELECT 1 FROM json_each(NEW.data,'$.bookings') b
 WHERE json_extract(b.value,'$.id')=v.booking_id AND json_extract(b.value,'$.guestId')=v.guest_id
 AND json_extract(b.value,'$.status')='completed'
 AND json_extract(b.value,'$.feedbackEmailConsent.source')='guest-supplied'
 AND COALESCE(json_extract(b.value,'$.feedbackEmailConsent.historical'),0)=0
 AND json_extract(b.value,'$.feedbackEmailConsent.emailHash')=c.email_hash
 AND json_extract(b.value,'$.feedbackEmailConsent.at')=c.consent_at));
END;

CREATE TRIGGER pm_feedback_owner_delete AFTER DELETE ON oa_operators BEGIN
 DELETE FROM pm_feedback_credentials WHERE owner_id=OLD.id;
 UPDATE pm_feedback_settings SET enabled=0 WHERE owner_id=OLD.id;
END;
CREATE TRIGGER pm_feedback_guest_delete AFTER DELETE ON pm_guests BEGIN
 DELETE FROM pm_feedback_credentials WHERE visit_id IN (SELECT id FROM pm_feedback_visits WHERE guest_id=OLD.id);
END;
