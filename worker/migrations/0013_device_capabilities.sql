-- Device capability flags for DeviceHub command dispatch.
-- Daemons default to full capabilities; future mod-as-device
-- and adapter-as-device will register with restricted flags.
ALTER TABLE devices ADD COLUMN can_rescan INTEGER NOT NULL DEFAULT 1;
ALTER TABLE devices ADD COLUMN can_receive_config INTEGER NOT NULL DEFAULT 1;
