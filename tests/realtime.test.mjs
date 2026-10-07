import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import { createApp } from '../dist/src/app/create_app.js';
import { AuthenticateUser } from '../dist/src/modules/auth/application/authenticate_user.js';
import { InvalidIdentityToken } from '../dist/src/modules/auth/domain/invalid_identity_token.js';
import { PgUserRepository } from '../dist/src/modules/auth/infrastructure/pg_user_repository.js';
import { ChangeMemberRole } from '../dist/src/modules/circles/application/change_member_role.js';
import { WaitForCircleChange } from '../dist/src/modules/circles/application/wait_for_circle_change.js';
import { InMemoryCircleEventBroker } from '../dist/src/modules/circles/infrastructure/in_memory_circle_event_broker.js';
import { PgCircleRepository } from '../dist/src/modules/circles/infrastructure/pg_circle_repository.js';

test('authenticated long polling returns complete newer snapshots', async () => {
  const database = new PGlite();
  await database.exec(await readFile(resolve('migrations/001_initial_schema.sql'), 'utf8'));
  const pool = {
    query: (...args) => database.query(...args),
    connect: async () => ({ query: (...args) => database.query(...args), release() {} }),
  };
  const users = new PgUserRepository(pool);
  const phones = {
    organizer: '+919800000001',
    guest: '+919800000002',
    stranger: '+919800000003',
  };
  const verifier = {
    async verifyIdToken(token) {
      if (!phones[token]) throw new InvalidIdentityToken();
      return { subject: token, phoneE164: phones[token] };
    },
  };
  const authenticate = new AuthenticateUser(verifier, users);
  const organizer = await authenticate.execute('Bearer organizer');
  const guest = await authenticate.execute('Bearer guest');
  await authenticate.execute('Bearer stranger');
  const circleId = '00000000-0000-4000-8000-000000000088';
  await database.query(`
    INSERT INTO circles (
      id, organizer_id, destination_label, destination_latitude,
      destination_longitude, is_private_place, time_zone, state, armed_at
    ) VALUES ($1, $2, 'Private destination', 12.97, 77.59, true, 'Asia/Kolkata', 'active', now())
  `, [circleId, organizer.id]);
  await database.query(`
    INSERT INTO circle_memberships (circle_id, user_id, is_organizer, travel_role, setup_status)
    VALUES ($1, $2, true, 'mover', 'ready'), ($1, $3, false, 'mover', 'pending')
  `, [circleId, organizer.id, guest.id]);
  await database.query(`
    UPDATE circle_memberships
    SET presence = 'here', arrived_at = now()
    WHERE circle_id = $1 AND user_id = $2
  `, [circleId, organizer.id]);
  await database.query(`
    INSERT INTO member_live_state (
      circle_id, user_id, last_pin_latitude, last_pin_longitude,
      last_location_at, current_leg, eta_min_minutes, eta_max_minutes
    ) VALUES ($1, $2, 12.971, 77.591, now(),
      '{"mode":"walk","label":"Final walk"}'::jsonb, 4, 7)
  `, [circleId, organizer.id]);

  const circles = new PgCircleRepository(pool);
  const broker = new InMemoryCircleEventBroker();
  const app = createApp(undefined, {
    authenticate,
    changeRole: new ChangeMemberRole(circles, broker),
    waitForChange: new WaitForCircleChange(circles, broker),
  });
  try {
    const initial = await app.inject({
      method: 'GET', url: `/v1/circles/${circleId}/events?afterRevision=-1`,
      headers: { authorization: 'Bearer guest' },
    });
    assert.equal(initial.statusCode, 200, initial.body);
    assert.equal(initial.json().revision, 0);
    assert.equal(initial.body.includes('leaveBy'), false);
    assert.equal(initial.json().members.every((member) => member.pin === null), true);
    assert.equal(initial.json().members.every((member) => member.etaMinutes === null), true);
    assert.equal(
      initial.json().members.every((member) => member.presence === 'not_sharing'),
      true,
    );

    const hidden = await app.inject({
      method: 'GET', url: `/v1/circles/${circleId}/events?afterRevision=-1`,
      headers: { authorization: 'Bearer stranger' },
    });
    assert.equal(hidden.statusCode, 404);

    const waiting = app.inject({
      method: 'GET', url: `/v1/circles/${circleId}/events?afterRevision=0`,
      headers: { authorization: 'Bearer organizer' },
    });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
    const changed = await app.inject({
      method: 'PATCH', url: `/v1/circles/${circleId}/me/role`,
      headers: { authorization: 'Bearer guest' },
      payload: { travelRole: 'anchor' },
    });
    assert.equal(changed.statusCode, 200, changed.body);
    const guestMember = changed.json().members.find((member) => member.userId === guest.id);
    assert.equal(guestMember.setupStatus, 'ready');
    assert.equal(guestMember.travelRole, 'anchor');

    const event = await waiting;
    assert.equal(event.statusCode, 200, event.body);
    assert.equal(event.json().revision, 1);
    assert.equal(event.json().members.length, 2);
    const organizerMember = event.json().members.find(
      (member) => member.userId === organizer.id,
    );
    assert.deepEqual(organizerMember.pin, { latitude: 12.971, longitude: 77.591 });
    assert.deepEqual(organizerMember.currentLeg, { mode: 'walk', label: 'Final walk' });
    assert.deepEqual(organizerMember.etaMinutes, { min: 4, max: 7 });
    assert.match(organizerMember.arrivedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(event.body.includes('leaveBy'), false);
    assert.equal(event.body.includes(phones.guest), false);
  } finally {
    await app.close();
    await database.close();
  }
});
