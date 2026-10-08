import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import { createApp } from '../dist/src/app/create_app.js';
import { AuthenticateUser } from '../dist/src/modules/auth/application/authenticate_user.js';
import { InvalidIdentityToken } from '../dist/src/modules/auth/domain/invalid_identity_token.js';
import { PgUserRepository } from '../dist/src/modules/auth/infrastructure/pg_user_repository.js';
import { SelectRoute } from '../dist/src/modules/journeys/application/select_route.js';
import { SuggestRoutes } from '../dist/src/modules/journeys/application/suggest_routes.js';
import { ViewSelectedRoute } from '../dist/src/modules/journeys/application/view_selected_route.js';
import { ViewPrivateJourney } from '../dist/src/modules/journeys/application/view_private_journey.js';
import { PgJourneyRouteRepository } from '../dist/src/modules/journeys/infrastructure/pg_journey_route_repository.js';
import { PgJourneyProgressRepository } from '../dist/src/modules/journeys/infrastructure/pg_journey_progress_repository.js';
import { IngestLocation } from '../dist/src/modules/circles/application/ingest_location.js';
import { LocationUpdatePolicy } from '../dist/src/modules/circles/domain/location_update_policy.js';
import { InMemoryCircleEventBroker } from '../dist/src/modules/circles/infrastructure/in_memory_circle_event_broker.js';
import { PgCircleRepository } from '../dist/src/modules/circles/infrastructure/pg_circle_repository.js';

test('route options are server-owned, explicitly selected, and replaceable', async () => {
  const database = new PGlite();
  await database.exec(await readFile(resolve('migrations/001_initial_schema.sql'), 'utf8'));
  await database.exec(await readFile(resolve('migrations/003_route_option_quotes.sql'), 'utf8'));
  await database.exec(await readFile(resolve('migrations/004_purge_route_option_quotes.sql'), 'utf8'));
  const pool = {
    query: (...args) => database.query(...args),
    connect: async () => ({ query: (...args) => database.query(...args), release() {} }),
  };
  const users = new PgUserRepository(pool);
  const authenticate = new AuthenticateUser({
    async verifyIdToken(token) {
      if (token !== 'mover' && token !== 'outsider') throw new InvalidIdentityToken();
      return {
        subject: token,
        phoneE164: token === 'mover' ? '+919800000121' : '+919800000122',
      };
    },
  }, users);
  const mover = await authenticate.execute('Bearer mover');
  const circleId = '00000000-0000-4000-8000-000000000121';
  await database.query(`
    INSERT INTO circles (
      id, organizer_id, destination_label, destination_latitude,
      destination_longitude, is_private_place, time_zone, state, armed_at
    ) VALUES ($1, $2, 'Cubbon Park', 12.9763, 77.5929, false, 'Asia/Kolkata', 'active', now())
  `, [circleId, mover.id]);
  await database.query(`
    INSERT INTO circle_memberships (circle_id, user_id, is_organizer, travel_role, setup_status)
    VALUES ($1, $2, true, 'mover', 'ready')
  `, [circleId, mover.id]);
  await database.query(`
    INSERT INTO member_live_state (
      circle_id, user_id, sharing_started_at, sharing_trigger,
      last_pin_latitude, last_pin_longitude, last_location_at
    ) VALUES ($1, $2, now(), 'manual', 12.9698, 77.7500, now())
  `, [circleId, mover.id]);

  const candidates = [
    {
      provider: 'test-provider', mode: 'walk', label: 'Walk there',
      accuracyLabel: 'Walking estimate', distanceMeters: 1500, durationSeconds: 1200,
      encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', polylinePrecision: 5,
      legs: [{ mode: 'walk', label: 'Walk west', distanceMeters: 1500, durationSeconds: 1200 }],
      checkpoints: [],
    },
    {
      provider: 'test-provider', mode: 'road', label: 'Road route',
      accuracyLabel: 'Typical traffic estimate', distanceMeters: 3200, durationSeconds: 720,
      encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', polylinePrecision: 5,
      legs: [{ mode: 'road', label: 'Drive west', distanceMeters: 3200, durationSeconds: 720 }],
      checkpoints: [],
    },
  ];
  const routes = new PgJourneyRouteRepository(pool);
  const progress = new PgJourneyProgressRepository(pool);
  const circles = new PgCircleRepository(pool);
  const events = new InMemoryCircleEventBroker();
  const actions = {
    authenticate,
    suggest: new SuggestRoutes(circles, routes, { async suggest() { return candidates; } }),
    select: new SelectRoute(routes, events),
    viewSelected: new ViewSelectedRoute(circles, routes),
    viewPrivate: new ViewPrivateJourney(progress),
  };
  const app = createApp(undefined, {
    authenticate,
    ingestLocation: new IngestLocation(
      circles,
      new LocationUpdatePolicy(),
      events,
      progress,
    ),
  }, undefined, undefined, undefined, actions);
  const headers = { authorization: 'Bearer mover' };
  try {
    const suggestions = await app.inject({
      method: 'GET', url: `/v1/circles/${circleId}/me/route-options`, headers,
    });
    assert.equal(suggestions.statusCode, 200, suggestions.body);
    assert.equal(suggestions.json().items.length, 2);
    assert.match(suggestions.json().items[0].id, /^[0-9a-f-]{36}$/);
    assert.ok(suggestions.json().items[0].expiresAt);
    assert.equal(suggestions.body.includes('test-provider'), false);

    const walkId = suggestions.json().items[0].id;
    const roadId = suggestions.json().items[1].id;
    const selectedWalk = await app.inject({
      method: 'PUT', url: `/v1/circles/${circleId}/me/selected-route`, headers,
      payload: { routeOptionId: walkId },
    });
    assert.equal(selectedWalk.statusCode, 200, selectedWalk.body);
    assert.equal(selectedWalk.json().mode, 'walk');
    assert.equal(selectedWalk.json().expiresAt, undefined);

    const selectedRoad = await app.inject({
      method: 'PUT', url: `/v1/circles/${circleId}/me/selected-route`, headers,
      payload: { routeOptionId: roadId },
    });
    assert.equal(selectedRoad.statusCode, 200, selectedRoad.body);
    assert.equal(selectedRoad.json().mode, 'road');

    const saved = await app.inject({
      method: 'GET', url: `/v1/circles/${circleId}/me/selected-route`, headers,
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().id, roadId);
    assert.equal(saved.json().encodedPolyline, '_p~iF~ps|U_ulLnnqC_mqNvxq`@');

    await database.query(
      "UPDATE circles SET meetup_time = '23:00', target_at = now() + interval '2 hours' WHERE id = $1",
      [circleId],
    );
    const progressed = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/me/locations`, headers,
      payload: {
        consentGranted: true,
        latitude: 40.7,
        longitude: -120.95,
        accuracyMeters: 12,
        capturedAt: new Date(Date.now() + 1000).toISOString(),
      },
    });
    assert.equal(progressed.statusCode, 200, progressed.body);
    assert.ok(progressed.json().members[0].etaMinutes.min > 0);
    assert.equal(progressed.json().members[0].currentLeg.mode, 'road');
    assert.equal(progressed.body.includes('leaveByAt'), false);

    const privateJourney = await app.inject({
      method: 'GET', url: `/v1/circles/${circleId}/me`, headers,
    });
    assert.equal(privateJourney.statusCode, 200, privateJourney.body);
    assert.deepEqual(privateJourney.json().etaMinutes, progressed.json().members[0].etaMinutes);
    assert.ok(privateJourney.json().leaveByAt);
    assert.equal(privateJourney.json().arrivalDeltaMinutes, null);

    const stored = await database.query(
      'SELECT route_option_id, route_snapshot, provider FROM selected_routes WHERE circle_id = $1',
      [circleId],
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].route_option_id, roadId);
    assert.equal(stored.rows[0].provider, 'test-provider');
    const circle = await circles.findForUser(circleId, mover.id);
    assert.equal(circle.revision, 3);
    assert.deepEqual(circle.members[0].currentLeg, { mode: 'road', label: 'Drive west' });

    const forged = await app.inject({
      method: 'PUT', url: `/v1/circles/${circleId}/me/selected-route`, headers,
      payload: { routeOptionId: '00000000-0000-4000-8000-000000000999' },
    });
    assert.equal(forged.statusCode, 409);

    const outsider = await app.inject({
      method: 'GET', url: `/v1/circles/${circleId}/me/route-options`,
      headers: { authorization: 'Bearer outsider' },
    });
    assert.equal(outsider.statusCode, 404);
    const outsiderPrivate = await app.inject({
      method: 'GET', url: `/v1/circles/${circleId}/me`,
      headers: { authorization: 'Bearer outsider' },
    });
    assert.equal(outsiderPrivate.statusCode, 404);

    await database.query(
      "UPDATE circle_memberships SET travel_role = 'anchor' WHERE circle_id = $1 AND user_id = $2",
      [circleId, mover.id],
    );
    const anchor = await app.inject({
      method: 'GET', url: `/v1/circles/${circleId}/me/route-options`, headers,
    });
    assert.equal(anchor.statusCode, 422);

    await database.query('SELECT purge_circle_journey_data($1)', [circleId]);
    const purged = await database.query(`
      SELECT
        (SELECT count(*)::int FROM route_option_quotes WHERE circle_id = $1) AS quotes,
        (SELECT count(*)::int FROM selected_routes WHERE circle_id = $1) AS selected
    `, [circleId]);
    assert.deepEqual(purged.rows[0], { quotes: 0, selected: 0 });
  } finally {
    await app.close();
    await database.close();
  }
});

test('no provider route returns an empty recoverable option list', async () => {
  const database = new PGlite();
  await database.exec(await readFile(resolve('migrations/001_initial_schema.sql'), 'utf8'));
  await database.exec(await readFile(resolve('migrations/003_route_option_quotes.sql'), 'utf8'));
  const pool = {
    query: (...args) => database.query(...args),
    connect: async () => ({ query: (...args) => database.query(...args), release() {} }),
  };
  const users = new PgUserRepository(pool);
  const authenticate = new AuthenticateUser({
    async verifyIdToken() { return { subject: 'empty', phoneE164: '+919800000123' }; },
  }, users);
  const user = await authenticate.execute('Bearer empty');
  const circleId = '00000000-0000-4000-8000-000000000123';
  await database.query(`
    INSERT INTO circles (id, organizer_id, destination_label, destination_latitude,
      destination_longitude, is_private_place, time_zone, state, armed_at)
    VALUES ($1, $2, 'Nowhere', 12.9, 77.6, false, 'Asia/Kolkata', 'active', now())
  `, [circleId, user.id]);
  await database.query(`
    INSERT INTO circle_memberships (circle_id, user_id, is_organizer, travel_role, setup_status)
    VALUES ($1, $2, true, 'mover', 'ready')
  `, [circleId, user.id]);
  await database.query(`
    INSERT INTO member_live_state (circle_id, user_id, last_pin_latitude, last_pin_longitude)
    VALUES ($1, $2, 12.8, 77.5)
  `, [circleId, user.id]);
  const routes = new PgJourneyRouteRepository(pool);
  const circles = new PgCircleRepository(pool);
  const progress = new PgJourneyProgressRepository(pool);
  const app = createApp(undefined, undefined, undefined, undefined, undefined, {
    authenticate,
    suggest: new SuggestRoutes(circles, routes, { async suggest() { return []; } }),
    select: new SelectRoute(routes),
    viewSelected: new ViewSelectedRoute(circles, routes),
    viewPrivate: new ViewPrivateJourney(progress),
  });
  try {
    const response = await app.inject({
      method: 'GET', url: `/v1/circles/${circleId}/me/route-options`,
      headers: { authorization: 'Bearer empty' },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { items: [] });
  } finally {
    await app.close();
    await database.close();
  }
});
