CREATE TABLE route_option_quotes (
  id uuid PRIMARY KEY,
  circle_id uuid NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  route_snapshot jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (circle_id, user_id)
    REFERENCES circle_memberships(circle_id, user_id) ON DELETE CASCADE
);

CREATE INDEX route_option_quotes_owner_expiry_idx
  ON route_option_quotes(circle_id, user_id, expires_at DESC);
