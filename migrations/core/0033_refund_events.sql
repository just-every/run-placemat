-- Store minimal signed-event receipts, never request/provider bodies or credentials.
-- IDs are retained financial facts, like pm_refunds; no guest/contact text is copied.
CREATE TABLE pm_refund_webhooks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id TEXT NOT NULL UNIQUE,
 refund_id TEXT NOT NULL REFERENCES pm_refunds(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('refund.created','refund.updated','refund.failed')),
 processor_status TEXT NOT NULL CHECK(processor_status IN ('pending','requires_action','succeeded','failed','canceled')),
 received_at TEXT NOT NULL,
 claim TEXT NOT NULL
);
CREATE INDEX pm_refund_webhooks_refund ON pm_refund_webhooks(refund_id,id);
CREATE TABLE pm_refund_followups (
 refund_id TEXT PRIMARY KEY REFERENCES pm_refunds(id),
 owner_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('open','resolved')),
 failure_status TEXT NOT NULL CHECK(failure_status IN ('failed','canceled')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 resolved_at TEXT
);
CREATE INDEX pm_refund_followups_owner ON pm_refund_followups(owner_id,state);
-- Original initiating person owns the follow-up. Original request and actor stay accountable.
-- This covers synchronous processor failures too, without creating a retry or sending mail.
CREATE TRIGGER pm_refund_followup_reserved AFTER INSERT ON pm_refunds
WHEN NEW.status IN ('failed','canceled') BEGIN
 INSERT INTO pm_refund_followups(refund_id,owner_id,actor_id,request_id,state,failure_status,created_at,updated_at)
 VALUES(NEW.id,NEW.actor_id,NEW.actor_id,NEW.request_id,'open',NEW.status,NEW.updated_at,NEW.updated_at);
END;
CREATE TRIGGER pm_refund_followup_failed AFTER UPDATE OF status ON pm_refunds
WHEN OLD.status != NEW.status AND NEW.status IN ('failed','canceled') BEGIN
 INSERT INTO pm_refund_followups(refund_id,owner_id,actor_id,request_id,state,failure_status,created_at,updated_at)
 VALUES(NEW.id,NEW.actor_id,NEW.actor_id,NEW.request_id,'open',NEW.status,NEW.updated_at,NEW.updated_at)
 ON CONFLICT(refund_id) DO UPDATE SET state='open',failure_status=excluded.failure_status,updated_at=excluded.updated_at,resolved_at=NULL;
END;
CREATE TRIGGER pm_refund_followup_succeeded AFTER UPDATE OF status ON pm_refunds
WHEN OLD.status != NEW.status AND NEW.status='succeeded' BEGIN
 UPDATE pm_refund_followups SET state='resolved',updated_at=NEW.updated_at,resolved_at=NEW.updated_at WHERE refund_id=NEW.id AND state='open';
END;
INSERT INTO pm_refund_followups(refund_id,owner_id,actor_id,request_id,state,failure_status,created_at,updated_at)
 SELECT id,actor_id,actor_id,request_id,'open',status,updated_at,updated_at FROM pm_refunds WHERE status IN ('failed','canceled');
