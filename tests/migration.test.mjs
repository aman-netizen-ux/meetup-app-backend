import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('initial schema applies and circle purge removes granular journey data', async () => {
  const database = new PGlite();
  try {
    const sql = await readFile(resolve('migrations/001_initial_schema.sql'), 'utf8');
    await database.exec(sql);

    const userId = '00000000-0000-4000-8000-000000000001';
    const circleId = '00000000-0000-4000-8000-000000000002';
    await database.query(
      'INSERT INTO users (id, auth_subject, display_name) VALUES ($1, $2, $3)',
      [userId, 'test-subject', 'Test Member'],
    );
    await database.query(
      `INSERT INTO circles (
        id, organizer_id, destination_label, destination_latitude,
        destination_longitude, time_zone, state, armed_at
      ) VALUES ($1, $2, 'Cafe', 12.97, 77.59, 'Asia/Kolkata', 'active', now())`,
      [circleId, userId],
    );
    await database.query(
      `INSERT INTO circle_memberships (
        circle_id, user_id, is_organizer, travel_role, setup_status, presence
      ) VALUES ($1, $2, true, 'mover', 'ready', 'live')`,
      [circleId, userId],
    );
    await database.query(
      `INSERT INTO member_live_state (
        circle_id, user_id, sharing_started_at, sharing_trigger,
        last_pin_latitude, last_pin_longitude, last_location_at, leave_by_at
      ) VALUES ($1, $2, now(), 'departure', 12.97, 77.59, now(), now())`,
      [circleId, userId],
    );
    await database.query(
      `INSERT INTO selected_routes (
        circle_id, user_id, provider, route_option_id, route_snapshot
      ) VALUES ($1, $2, 'test', 'route-1', '{"origin":"private"}'::jsonb)`,
      [circleId, userId],
    );
    await database.query(
      `INSERT INTO location_samples (
        circle_id, user_id, latitude, longitude, accuracy_meters, captured_at
      ) VALUES ($1, $2, 12.97, 77.59, 10, now())`,
      [circleId, userId],
    );
    await database.query(
      'INSERT INTO arrival_events (circle_id, user_id, arrived_at) VALUES ($1, $2, now())',
      [circleId, userId],
    );

    await database.query('SELECT purge_circle_journey_data($1)', [circleId]);

    for (const table of ['location_samples', 'selected_routes', 'member_live_state']) {
      const result = await database.query(`SELECT count(*)::int AS count FROM ${table}`);
      assert.equal(result.rows[0].count, 0, `${table} should be purged`);
    }
    const arrivals = await database.query('SELECT count(*)::int AS count FROM arrival_events');
    assert.equal(arrivals.rows[0].count, 1, 'arrival summary should remain');
  } finally {
    await database.close();
  }
});
