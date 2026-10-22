-- No legacy unpeppered PIN can unlock; staff reset it through a full session.
ALTER TABLE pm_host_pins ADD COLUMN pepper_version TEXT;
ALTER TABLE pm_host_pins ADD COLUMN iterations INTEGER NOT NULL DEFAULT 100000;
ALTER TABLE pm_host_pins ADD COLUMN disabled_at INTEGER;
ALTER TABLE pm_host_devices ADD COLUMN renewed_at INTEGER;
UPDATE pm_host_pins SET disabled_at=1;
