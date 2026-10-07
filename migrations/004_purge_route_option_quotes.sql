CREATE OR REPLACE FUNCTION purge_circle_journey_data(p_circle_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM location_samples WHERE circle_id = p_circle_id;
  DELETE FROM selected_routes WHERE circle_id = p_circle_id;
  DELETE FROM route_option_quotes WHERE circle_id = p_circle_id;
  DELETE FROM member_live_state WHERE circle_id = p_circle_id;
END;
$$;
