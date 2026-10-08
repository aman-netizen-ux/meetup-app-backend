-- Keeps push delivery idempotent across retries and process restarts. Tokens remain in device_push_tokens.
CREATE TABLE notification_deliveries (
  event_key text NOT NULL,
  device_token text NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_key, device_token)
);

CREATE INDEX notification_deliveries_delivered_at_idx ON notification_deliveries(delivered_at);
