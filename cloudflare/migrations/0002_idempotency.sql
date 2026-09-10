-- Durable idempotency for hosted POST requests.
CREATE TABLE IF NOT EXISTS engram_idempotency (
  route_key TEXT NOT NULL,
  request_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (route_key, request_key)
);
