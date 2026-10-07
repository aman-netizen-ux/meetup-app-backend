CREATE TABLE contact_match_grants (
  id uuid PRIMARY KEY,
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_match_grants_expiry_idx
  ON contact_match_grants(expires_at);

CREATE INDEX contact_match_grants_requester_idx
  ON contact_match_grants(requester_id, circle_id, created_at DESC);
