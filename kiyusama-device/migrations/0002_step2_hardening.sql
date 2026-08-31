PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS delivery_claims (
  delivery_event_id TEXT PRIMARY KEY,
  device_event_id TEXT NOT NULL,
  hop INTEGER NOT NULL CHECK (hop >= 1),
  accepted_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS durable_payloads (
  delivery_event_id TEXT PRIMARY KEY
    REFERENCES delivery_claims(delivery_event_id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL CHECK (length(payload_json) > 0),
  persisted_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dispatches (
  device_event_id TEXT NOT NULL,
  hop INTEGER NOT NULL CHECK (hop >= 1),
  state TEXT NOT NULL CHECK (
    state IN ('DISPATCHING', 'DISPATCHED', 'RECONCILING', 'UNKNOWN_DISPATCH', 'COMPLETED')
  ),
  claimed_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  provider_session_id TEXT,
  provider_run_id TEXT,
  PRIMARY KEY (device_event_id, hop)
);

