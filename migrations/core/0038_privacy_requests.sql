-- Owner-reviewed privacy work retains identifiers and decisions, never a second copy of guest text.
CREATE TABLE pm_privacy_policy (
 id INTEGER PRIMARY KEY CHECK(id=1),
 version INTEGER NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 actor_id TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE pm_privacy_requests (
 id TEXT PRIMARY KEY,
 guest_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('access','correction','deletion','retention')),
 state TEXT NOT NULL CHECK(state IN ('open','completed')),
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 completed_at TEXT,
 policy_version INTEGER,
 UNIQUE(id,guest_id)
);
CREATE TABLE pm_privacy_processors (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL REFERENCES pm_privacy_requests(id),
 provider TEXT NOT NULL,
 reference TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('open','submitted','confirmed','retained')),
 actor_id TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 ground TEXT NOT NULL DEFAULT '',
 UNIQUE(request_id,provider,reference)
);
CREATE TABLE pm_privacy_events (
 id TEXT PRIMARY KEY,
 request_id TEXT REFERENCES pm_privacy_requests(id),
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL,
 at TEXT NOT NULL,
 details TEXT NOT NULL CHECK(json_valid(details))
);
