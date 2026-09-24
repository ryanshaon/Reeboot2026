CREATE TABLE IF NOT EXISTS reboot.login_throttle (
  key_hash char(64) PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  failure_count integer NOT NULL CHECK (failure_count >= 1),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS login_throttle_expires_at_idx ON reboot.login_throttle (expires_at);
