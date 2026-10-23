CREATE TABLE pm_integration_keys (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 digest TEXT NOT NULL UNIQUE,
 scopes TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 revoked_at TEXT
);
CREATE TABLE pm_integration_limits (
 key_id TEXT NOT NULL,
 minute INTEGER NOT NULL,
 count INTEGER NOT NULL,
 PRIMARY KEY (key_id, minute)
);
CREATE TABLE pm_integration_audit (
 id TEXT PRIMARY KEY,
 key_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL,
 at TEXT NOT NULL
);
CREATE TABLE pm_integration_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 type TEXT NOT NULL,
 schema_version INTEGER NOT NULL,
 payload TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE pm_integration_subscriptions (
 id TEXT PRIMARY KEY,
 key_id TEXT NOT NULL,
 url TEXT NOT NULL,
 types TEXT NOT NULL,
 sealed_secret TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL,
 revoked_at TEXT
);
CREATE TABLE pm_integration_deliveries (
 id TEXT NOT NULL,
 subscription_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 status TEXT NOT NULL,
 http_status INTEGER,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL,
 finished_at TEXT,
 PRIMARY KEY (id,subscription_id)
);
