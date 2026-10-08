import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import { createApp } from '../dist/src/app/create_app.js';
import { AuthenticateUser } from '../dist/src/modules/auth/application/authenticate_user.js';
import { InvalidIdentityToken } from '../dist/src/modules/auth/domain/invalid_identity_token.js';
import { PgUserRepository } from '../dist/src/modules/auth/infrastructure/pg_user_repository.js';
import { IngestLocation } from '../dist/src/modules/circles/application/ingest_location.js';
import { StartLocationSharing } from '../dist/src/modules/circles/application/start_location_sharing.js';
import { MarkArrived } from '../dist/src/modules/circles/application/mark_arrived.js';
import { LocationUpdatePolicy } from '../dist/src/modules/circles/domain/location_update_policy.js';
import { InMemoryCircleEventBroker } from '../dist/src/modules/circles/infrastructure/in_memory_circle_event_broker.js';
import { PgCircleRepository } from '../dist/src/modules/circles/infrastructure/pg_circle_repository.js';

test('location ingestion requires consent and an active ready mover', async () => {
  const database = new PGlite();
  await database.exec(await readFile(resolve('migrations/001_initial_schema.sql'), 'utf8'));
  const pool = {
    query: (...args) => database.query(...args),
    connect: async () => ({ query: (...args) => database.query(...args), release() {} }),
  };
  const users = new PgUserRepository(pool);
  const verifier = {
    async verifyIdToken(token) {
      if (token !== 'mover') throw new InvalidIdentityToken();
      return { subject: token, phoneE164: '+919800000099' };
    },
  };
  const authenticate = new AuthenticateUser(verifier, users);
  const mover = await authenticate.execute('Bearer mover');
  const circleId = '00000000-0000-4000-8000-000000000099';
  await database.query(`
    INSERT INTO circles (
      id, organizer_id, destination_label, destination_latitude,
      destination_longitude, is_private_place, time_zone, state, armed_at
    ) VALUES ($1, $2, 'Destination', 12.970, 77.590, false, 'Asia/Kolkata', 'active', now())
  `, [circleId, mover.id]);
  await database.query(`
    INSERT INTO circle_memberships (circle_id, user_id, is_organizer, travel_role, setup_status)
    VALUES ($1, $2, true, 'mover', 'ready')
  `, [circleId, mover.id]);

  const circles = new PgCircleRepository(pool);
  const policy = new LocationUpdatePolicy();
  const events = new InMemoryCircleEventBroker();
  const app = createApp(undefined, {
    authenticate,
    startLocationSharing: new StartLocationSharing(circles, policy, events),
    ingestLocation: new IngestLocation(circles, policy, events),
  });
  const headers = { authorization: 'Bearer mover' };
  const location = {
    consentGranted: true,
    latitude: 12.971,
    longitude: 77.591,
    accuracyMeters: 18,
    capturedAt: new Date().toISOString(),
  };
  try {
    const beforeStart = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/me/locations`, headers, payload: location,
    });
    assert.equal(beforeStart.statusCode, 422);

    const noConsent = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/me/sharing/start`, headers,
      payload: { ...location, consentGranted: false, trigger: 'manual' },
    });
    assert.equal(noConsent.statusCode, 422);

    const inaccurate = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/me/sharing/start`, headers,
      payload: { ...location, accuracyMeters: 500, trigger: 'manual' },
    });
    assert.equal(inaccurate.statusCode, 422);

    const started = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/me/sharing/start`, headers,
      payload: { ...location, trigger: 'departure' },
    });
    assert.equal(started.statusCode, 200, started.body);
    assert.equal(started.json().revision, 1);
    assert.equal(started.json().members[0].presence, 'live');
    assert.deepEqual(started.json().members[0].pin, { latitude: 12.971, longitude: 77.591 });

    const nextLocation = { ...location, latitude: 12.972, capturedAt: new Date(Date.now() + 1000).toISOString() };
    const updated = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/me/locations`, headers, payload: nextLocation,
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().revision, 2);
    assert.equal(updated.json().members[0].pin.latitude, 12.972);

    const samples = await database.query(
      'SELECT count(*)::int AS count FROM location_samples WHERE circle_id = $1 AND user_id = $2',
      [circleId, mover.id],
    );
    assert.equal(samples.rows[0].count, 2);

    await database.query(
      "UPDATE member_live_state SET last_location_at = now() - interval '3 minutes' WHERE circle_id = $1 AND user_id = $2",
      [circleId, mover.id],
    );
    const stale = await circles.findForUser(circleId, mover.id);
    assert.equal(stale.members[0].presence, 'in_transit');

    await database.query(
      "UPDATE circle_memberships SET arrived_at = now(), presence = 'here' WHERE circle_id = $1 AND user_id = $2",
      [circleId, mover.id],
    );
    const afterArrival = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/me/locations`, headers,
      payload: { ...location, capturedAt: new Date(Date.now() + 2000).toISOString() },
    });
    assert.equal(afterArrival.statusCode, 422);

    await database.query(
      'UPDATE circle_memberships SET travel_role = $3, arrived_at = NULL WHERE circle_id = $1 AND user_id = $2',
      [circleId, mover.id, 'anchor'],
    );
    const asAnchor = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/me/locations`, headers,
      payload: { ...location, capturedAt: new Date(Date.now() + 2000).toISOString() },
    });
    assert.equal(asAnchor.statusCode, 422);

    await database.query(
      "UPDATE circle_memberships SET travel_role = 'mover' WHERE circle_id = $1 AND user_id = $2",
      [circleId, mover.id],
    );
    await database.query(
      "UPDATE circles SET state = 'ended', end_reason = 'organizer_ended', ended_at = now() WHERE id = $1",
      [circleId],
    );
    const afterEnd = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/me/locations`, headers,
      payload: { ...location, capturedAt: new Date(Date.now() + 3000).toISOString() },
    });
    assert.equal(afterEnd.statusCode, 422);
  } finally {
    await app.close();
    await database.close();
  }
});

test('arrival marks a mover here, stops their sharing, and ends a completed circle', async () => {
  const database = new PGlite();
  await database.exec(await readFile(resolve('migrations/001_initial_schema.sql'), 'utf8'));
  const pool = {
    query: (...args) => database.query(...args),
    connect: async () => ({ query: (...args) => database.query(...args), release() {} }),
  };
  const users = new PgUserRepository(pool);
  const authenticate = new AuthenticateUser({
    async verifyIdToken(token) {
      if (token !== 'mover') throw new InvalidIdentityToken();
      return { subject: token, phoneE164: '+919800000098' };
    },
  }, users);
  const mover = await authenticate.execute('Bearer mover');
  const circleId = '00000000-0000-4000-8000-000000000098';
  await database.query(`INSERT INTO circles (
    id, organizer_id, destination_label, destination_latitude, destination_longitude,
    is_private_place, time_zone, state, armed_at
  ) VALUES ($1, $2, 'Destination', 12.970, 77.590, false, 'Asia/Kolkata', 'active', now())`, [circleId, mover.id]);
  await database.query(`INSERT INTO circle_memberships (circle_id, user_id, is_organizer, travel_role, setup_status)
    VALUES ($1, $2, true, 'mover', 'ready')`, [circleId, mover.id]);
  await database.query(`INSERT INTO member_live_state (circle_id, user_id, last_pin_latitude, last_pin_longitude)
    VALUES ($1, $2, 12.971, 77.591)`, [circleId, mover.id]);
  await database.query(`INSERT INTO location_samples (circle_id, user_id, latitude, longitude, accuracy_meters, captured_at)
    VALUES ($1, $2, 12.971, 77.591, 10, now())`, [circleId, mover.id]);
  const circles = new PgCircleRepository(pool);
  const app = createApp(undefined, { authenticate, markArrived: new MarkArrived(circles) });
  try {
    const response = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/me/arrival`, headers: { authorization: 'Bearer mover' }, payload: {},
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().state, 'ended');
    assert.equal(response.json().endReason, 'all_arrived');
    assert.equal(response.json().members[0].presence, 'here');
    const samples = await database.query('SELECT count(*)::int AS count FROM location_samples WHERE circle_id = $1', [circleId]);
    const arrivals = await database.query('SELECT count(*)::int AS count FROM arrival_events WHERE circle_id = $1', [circleId]);
    assert.equal(samples.rows[0].count, 0);
    assert.equal(arrivals.rows[0].count, 1);
  } finally {
    await app.close();
    await database.close();
  }
});

test('lifecycle job arms scheduled circles and purges timed-out journeys', async () => {
  const database = new PGlite();
  await database.exec(await readFile(resolve('migrations/001_initial_schema.sql'), 'utf8'));
  const pool = {
    query: (...args) => database.query(...args),
    connect: async () => ({ query: (...args) => database.query(...args), release() {} }),
  };
  const users = new PgUserRepository(pool);
  const user = await users.findOrCreate({ subject: 'lifecycle', phoneE164: '+919800000097' });
  const scheduledId = '00000000-0000-4000-8000-000000000097';
  const expiredId = '00000000-0000-4000-8000-000000000096';
  await database.query(`INSERT INTO circles (
    id, organizer_id, destination_label, destination_latitude, destination_longitude,
    is_private_place, meetup_date, time_zone, state
  ) VALUES ($1, $2, 'Destination', 12.970, 77.590, false, '2026-10-09', 'Asia/Kolkata', 'scheduled')`, [scheduledId, user.id]);
  await database.query(`INSERT INTO circles (
    id, organizer_id, destination_label, destination_latitude, destination_longitude,
    is_private_place, time_zone, state, armed_at
  ) VALUES ($1, $2, 'Destination', 12.970, 77.590, false, 'Asia/Kolkata', 'active', $3)`,
    [expiredId, user.id, new Date('2026-10-08T00:00:00Z')]);
  await database.query(`INSERT INTO circle_memberships (circle_id, user_id, is_organizer, travel_role, setup_status)
    VALUES ($1, $2, true, 'mover', 'ready'), ($3, $2, true, 'mover', 'ready')`, [scheduledId, user.id, expiredId]);
  await database.query(`INSERT INTO location_samples (circle_id, user_id, latitude, longitude, accuracy_meters, captured_at)
    VALUES ($1, $2, 12.971, 77.591, 10, now())`, [expiredId, user.id]);
  try {
    const changed = await new PgCircleRepository(pool).advanceLifecycle(new Date('2026-10-09T10:00:00Z'));
    assert.equal(changed.length, 2);
    const scheduled = await database.query('SELECT state FROM circles WHERE id = $1', [scheduledId]);
    const expired = await database.query('SELECT state, end_reason FROM circles WHERE id = $1', [expiredId]);
    const samples = await database.query('SELECT count(*)::int AS count FROM location_samples WHERE circle_id = $1', [expiredId]);
    assert.equal(scheduled.rows[0].state, 'active');
    assert.deepEqual(expired.rows[0], { state: 'ended', end_reason: 'timeout' });
    assert.equal(samples.rows[0].count, 0);
  } finally {
    await database.close();
  }
});
