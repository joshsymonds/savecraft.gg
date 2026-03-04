-- Remove old pairing code flow (superseded by device linking)
DROP TABLE IF EXISTS pairing_codes;
DROP TABLE IF EXISTS pairing_rate_limits;
