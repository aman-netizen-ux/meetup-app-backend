import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { DateTime } from 'luxon';

import { createApp } from '../dist/src/app/create_app.js';
import { AuthenticateUser } from '../dist/src/modules/auth/application/authenticate_user.js';
import { PgUserRepository } from '../dist/src/modules/auth/infrastructure/pg_user_repository.js';
import { InvalidIdentityToken } from '../dist/src/modules/auth/domain/invalid_identity_token.js';
import { CreateCircle } from '../dist/src/modules/circles/application/create_circle.js';
import { EndCircle } from '../dist/src/modules/circles/application/end_circle.js';
import { ListCircles } from '../dist/src/modules/circles/application/list_circles.js';
import { UpdateCircle } from '../dist/src/modules/circles/application/update_circle.js';
import { ViewCircle } from '../dist/src/modules/circles/application/view_circle.js';
import { CircleSchedulePolicy } from '../dist/src/modules/circles/domain/circle_schedule_policy.js';
import { GeoTimeZoneResolver } from '../dist/src/modules/circles/infrastructure/geo_time_zone_resolver.js';
import { PgCircleRepository } from '../dist/src/modules/circles/infrastructure/pg_circle_repository.js';

test('circle creation, listing, organizer edits, and transactional end', async () => {
  const database = new PGlite();
  await database.exec(await readFile(resolve('migrations/001_initial_schema.sql'), 'utf8'));
  const pool = {
    query: (...args) => database.query(...args),
    connect: async () => ({ query: (...args) => database.query(...args), release() {} }),
  };
  const users = new PgUserRepository(pool);
  const circles = new PgCircleRepository(pool);
  const verifier = {
    async verifyIdToken(token) {
      if (token !== 'organizer' && token !== 'other') throw new InvalidIdentityToken();
      return { subject: token, phoneE164: token === 'organizer' ? '+919876543210' : '+919876543211' };
    },
  };
  const authenticate = new AuthenticateUser(verifier, users);
  const schedule = new CircleSchedulePolicy();
  const app = createApp(undefined, {
    authenticate,
    create: new CreateCircle(circles, new GeoTimeZoneResolver(), schedule),
    list: new ListCircles(circles), view: new ViewCircle(circles),
    update: new UpdateCircle(circles, schedule), end: new EndCircle(circles),
  });
  const headers = { authorization: 'Bearer organizer' };
  const tomorrow = DateTime.now().setZone('Asia/Kolkata').plus({ days: 1 }).toISODate();
  try {
    const noAuth = await app.inject({ method: 'GET', url: '/v1/circles' });
    assert.equal(noAuth.statusCode, 401);
    const invalid = await app.inject({ method: 'POST', url: '/v1/circles', headers, payload: { isPrivatePlace: false } });
    assert.equal(invalid.statusCode, 400);
    const wrongZone = await app.inject({ method: 'POST', url: '/v1/circles', headers, payload: {
      destination: { label: 'Bengaluru cafe', latitude: 12.965, longitude: 77.734 },
      isPrivatePlace: false, timeZone: 'Europe/London',
    } });
    assert.equal(wrongZone.statusCode, 422);

    const create = await app.inject({ method: 'POST', url: '/v1/circles', headers, payload: {
      destination: { label: 'Bengaluru cafe', latitude: 12.965, longitude: 77.734 },
      isPrivatePlace: true, meetupDate: tomorrow, meetupTime: '18:30',
    } });
    assert.equal(create.statusCode, 201, create.body);
    const circle = create.json();
    assert.equal(circle.timeZone, 'Asia/Kolkata');
    assert.equal(circle.state, 'scheduled');
    assert.equal(circle.members.length, 1);
    assert.equal(circle.members[0].travelRole, 'mover');
    assert.equal(circle.members[0].pin, null);
    const id = circle.id;

    const list = await app.inject({ method: 'GET', url: '/v1/circles', headers });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().items[0].id, id);
    assert.equal(list.json().items[0].memberCount, 1);
    const hidden = await app.inject({ method: 'GET', url: `/v1/circles/${id}`, headers: { authorization: 'Bearer other' } });
    assert.equal(hidden.statusCode, 404);

    const edit = await app.inject({ method: 'PATCH', url: `/v1/circles/${id}`, headers, payload: { meetupDate: null, meetupTime: null } });
    assert.equal(edit.statusCode, 200, edit.body);
    assert.equal(edit.json().state, 'active');
    assert.equal(edit.json().meetupTime, null);
    assert.equal(edit.json().revision, 1);
    const locked = await app.inject({ method: 'PATCH', url: `/v1/circles/${id}`, headers, payload: { meetupDate: tomorrow } });
    assert.equal(locked.statusCode, 409);

    await database.query(`INSERT INTO member_live_state (circle_id, user_id, last_pin_latitude, last_pin_longitude)
      VALUES ($1, $2, 12.965, 77.734)`, [id, circle.members[0].userId]);
    const ended = await app.inject({ method: 'POST', url: `/v1/circles/${id}/end`, headers, payload: { reason: 'organizer_ended' } });
    assert.equal(ended.statusCode, 200, ended.body);
    assert.equal(ended.json().state, 'ended');
    assert.equal(ended.json().endReason, 'organizer_ended');
    const repeat = await app.inject({ method: 'POST', url: `/v1/circles/${id}/end`, headers, payload: { reason: 'cancelled' } });
    assert.equal(repeat.json().endReason, 'organizer_ended');
    const live = await database.query('SELECT count(*)::int AS count FROM member_live_state WHERE circle_id = $1', [id]);
    assert.equal(live.rows[0].count, 0);
  } finally {
    await app.close();
    await database.close();
  }
});
