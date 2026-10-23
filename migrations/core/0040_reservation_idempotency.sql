CREATE TABLE pm_reservation_requests (
 actor_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 response TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY (actor_id, request_id)
);
