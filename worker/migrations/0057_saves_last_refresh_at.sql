-- Dedicated timestamp of the last adapter refresh ATTEMPT (success or
-- error). Distinct from last_updated, which reconcile bumps at discovery
-- without fetching anything. The adapter refresh cooldown keys off this:
-- NULL = never attempted = refresh allowed immediately (first load after
-- connect); otherwise throttled by ADAPTER_REFRESH_COOLDOWN_SEC.
ALTER TABLE saves ADD COLUMN last_refresh_at TEXT;
