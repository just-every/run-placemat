-- ROLE-001 venue groups. Invitations, link secrets and tokens live only as hashes, apart from the
-- member venue's own outbound link secret. None of it enters state, audit, exports or archives:
-- a restore starts ungrouped and the owner reconnects.
CREATE TABLE pm_group_invites (
 code_hash TEXT PRIMARY KEY,
 label TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 used_at TEXT
);
CREATE TABLE pm_group_links (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 origin TEXT NOT NULL UNIQUE,
 secret_hash TEXT NOT NULL,
 ceiling TEXT NOT NULL CHECK(json_valid(ceiling)),
 joined_at TEXT NOT NULL,
 revoked_at TEXT
);
CREATE TABLE pm_group_admins (
 operator_id TEXT NOT NULL,
 venue_id TEXT NOT NULL,
 rights TEXT NOT NULL CHECK(json_valid(rights)),
 granted_by TEXT NOT NULL,
 granted_at TEXT NOT NULL,
 PRIMARY KEY(operator_id,venue_id)
);
CREATE TABLE pm_group_tokens (
 token_hash TEXT PRIMARY KEY,
 operator_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
CREATE INDEX pm_group_tokens_operator ON pm_group_tokens(operator_id);
CREATE TABLE pm_group_home (
 id INTEGER PRIMARY KEY CHECK(id=1),
 home_origin TEXT NOT NULL,
 link_id TEXT NOT NULL,
 secret TEXT NOT NULL,
 ceiling TEXT NOT NULL CHECK(json_valid(ceiling)),
 joined_at TEXT NOT NULL
);
