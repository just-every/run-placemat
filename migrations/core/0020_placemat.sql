CREATE TABLE pm_state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE pm_guests (id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE pm_erased (identity_hash TEXT PRIMARY KEY, erased_at TEXT NOT NULL);
CREATE TABLE pm_agent_keys (id TEXT PRIMARY KEY, digest TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE pm_public_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL);
