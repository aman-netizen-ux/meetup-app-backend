-- B-03 initial data model. Application-level validation follows the API contract.

CREATE TABLE users (
  id uuid PRIMARY KEY,
  auth_subject text NOT NULL UNIQUE,
  phone_e164 text UNIQUE,
  display_name text NOT NULL,
  profile_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_phone_format CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);

CREATE TABLE circles (
  id uuid PRIMARY KEY,
  organizer_id uuid NOT NULL REFERENCES users(id),
  destination_label text NOT NULL,
  destination_latitude numeric(9, 6) NOT NULL CHECK (destination_latitude BETWEEN -90 AND 90),
  destination_longitude numeric(9, 6) NOT NULL CHECK (destination_longitude BETWEEN -180 AND 180),
  destination_place_id text,
  is_private_place boolean NOT NULL DEFAULT false,
  meetup_date date,
  meetup_time time without time zone,
  time_zone text NOT NULL,
  target_at timestamptz,
  state text NOT NULL CHECK (state IN ('scheduled', 'active', 'ended')),
  end_reason text CHECK (end_reason IN ('all_arrived', 'organizer_ended', 'cancelled', 'timeout')),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  armed_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circles_destination_label_nonblank CHECK (btrim(destination_label) <> ''),
  CONSTRAINT circles_time_zone_nonblank CHECK (btrim(time_zone) <> ''),
  CONSTRAINT circles_target_requires_time CHECK (target_at IS NULL OR meetup_time IS NOT NULL),
  CONSTRAINT circles_end_consistent CHECK (
    (state = 'ended' AND ended_at IS NOT NULL AND end_reason IS NOT NULL)
    OR (state <> 'ended' AND ended_at IS NULL AND end_reason IS NULL)
  )
);

CREATE INDEX circles_organizer_idx ON circles(organizer_id);
CREATE INDEX circles_scheduled_date_idx ON circles(meetup_date) WHERE state = 'scheduled';
CREATE INDEX circles_active_armed_idx ON circles(armed_at) WHERE state = 'active';

CREATE TABLE circle_memberships (
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  is_organizer boolean NOT NULL DEFAULT false,
  travel_role text NOT NULL CHECK (travel_role IN ('mover', 'anchor')),
  setup_status text NOT NULL CHECK (setup_status IN ('pending', 'ready')),
  presence text NOT NULL DEFAULT 'not_sharing'
    CHECK (presence IN ('not_sharing', 'live', 'in_transit', 'here', 'fixed', 'frozen')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  arrived_at timestamptz,
  PRIMARY KEY (circle_id, user_id)
);

CREATE UNIQUE INDEX one_organizer_per_circle_idx
  ON circle_memberships(circle_id) WHERE is_organizer;
CREATE INDEX memberships_user_idx ON circle_memberships(user_id, joined_at DESC);

CREATE TABLE circle_invitations (
  id uuid PRIMARY KEY,
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  invited_phone_hash text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_by uuid NOT NULL REFERENCES users(id),
  accepted_by uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT invitation_acceptance_consistent CHECK (
    (status = 'accepted' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
    OR (status <> 'accepted' AND accepted_by IS NULL AND accepted_at IS NULL)
  )
);

CREATE INDEX invitations_circle_idx ON circle_invitations(circle_id);
CREATE INDEX invitations_expiry_idx ON circle_invitations(expires_at) WHERE status = 'pending';

-- The next three tables contain granular/live journey data and are purged on end.
CREATE TABLE member_live_state (
  circle_id uuid NOT NULL,
  user_id uuid NOT NULL,
  sharing_started_at timestamptz,
  sharing_trigger text CHECK (sharing_trigger IN ('departure', 'manual')),
  last_pin_latitude numeric(9, 6) CHECK (last_pin_latitude BETWEEN -90 AND 90),
  last_pin_longitude numeric(9, 6) CHECK (last_pin_longitude BETWEEN -180 AND 180),
  last_location_at timestamptz,
  current_leg jsonb,
  eta_min_minutes integer CHECK (eta_min_minutes >= 0),
  eta_max_minutes integer CHECK (eta_max_minutes >= 0),
  leave_by_at timestamptz,
  PRIMARY KEY (circle_id, user_id),
  FOREIGN KEY (circle_id, user_id) REFERENCES circle_memberships(circle_id, user_id) ON DELETE CASCADE,
  CONSTRAINT live_pin_pair CHECK ((last_pin_latitude IS NULL) = (last_pin_longitude IS NULL)),
  CONSTRAINT live_eta_range CHECK (
    (eta_min_minutes IS NULL AND eta_max_minutes IS NULL)
    OR (eta_min_minutes IS NOT NULL AND eta_max_minutes IS NOT NULL AND eta_min_minutes <= eta_max_minutes)
  )
);

CREATE TABLE selected_routes (
  circle_id uuid NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  route_option_id text NOT NULL,
  route_snapshot jsonb NOT NULL,
  selected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, user_id),
  FOREIGN KEY (circle_id, user_id) REFERENCES circle_memberships(circle_id, user_id) ON DELETE CASCADE
);

CREATE TABLE location_samples (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  circle_id uuid NOT NULL,
  user_id uuid NOT NULL,
  latitude numeric(9, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters numeric(8, 2) NOT NULL CHECK (accuracy_meters >= 0),
  captured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (circle_id, user_id) REFERENCES circle_memberships(circle_id, user_id) ON DELETE CASCADE
);

CREATE INDEX location_samples_circle_user_time_idx
  ON location_samples(circle_id, user_id, captured_at DESC);

-- Arrival timestamps are summary metadata retained after journey-data purge.
CREATE TABLE arrival_events (
  circle_id uuid NOT NULL,
  user_id uuid NOT NULL,
  arrived_at timestamptz NOT NULL,
  PRIMARY KEY (circle_id, user_id),
  FOREIGN KEY (circle_id, user_id) REFERENCES circle_memberships(circle_id, user_id) ON DELETE CASCADE
);

CREATE TABLE device_push_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  token text NOT NULL UNIQUE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX device_push_tokens_user_idx ON device_push_tokens(user_id);

-- Call inside the same transaction that ends a circle, then commit both.
-- This removes GPS samples, last-known pins, route snapshots, and private leave-by.
CREATE FUNCTION purge_circle_journey_data(p_circle_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM location_samples WHERE circle_id = p_circle_id;
  DELETE FROM selected_routes WHERE circle_id = p_circle_id;
  DELETE FROM member_live_state WHERE circle_id = p_circle_id;
END;
$$;
