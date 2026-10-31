-- Add a successor representation without changing original event or attempt records.
ALTER TABLE pm_integration_subscriptions ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version IN (1,2));
ALTER TABLE pm_integration_deliveries ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version IN (1,2));
CREATE TABLE pm_integration_event_versions (
 event_id TEXT NOT NULL REFERENCES pm_integration_events(id),
 schema_version INTEGER NOT NULL CHECK (schema_version = 2),
 payload TEXT NOT NULL,
 PRIMARY KEY (event_id,schema_version)
);
INSERT INTO pm_integration_event_versions(event_id,schema_version,payload)
SELECT id,2,json_object('id',id,'type',type,'schemaVersion',2,'createdAt',created_at,
 'data',json_object('reservation',json_extract(payload,'$.reservation')))
FROM pm_integration_events WHERE schema_version=1 AND json_valid(payload);
