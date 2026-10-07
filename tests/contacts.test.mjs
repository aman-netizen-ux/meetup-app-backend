import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import { createApp } from '../dist/src/app/create_app.js';
import { AuthenticateUser } from '../dist/src/modules/auth/application/authenticate_user.js';
import { InvalidIdentityToken } from '../dist/src/modules/auth/domain/invalid_identity_token.js';
import { PgUserRepository } from '../dist/src/modules/auth/infrastructure/pg_user_repository.js';
import { PgCircleRepository } from '../dist/src/modules/circles/infrastructure/pg_circle_repository.js';
import { AddContactMember } from '../dist/src/modules/contacts/application/add_contact_member.js';
import { MatchContacts } from '../dist/src/modules/contacts/application/match_contacts.js';
import { PgContactRepository } from '../dist/src/modules/contacts/infrastructure/pg_contact_repository.js';

test('contact matching keeps names local and adds mapped users as pending', async () => {
  const database = new PGlite();
  await database.exec(await readFile(resolve('migrations/001_initial_schema.sql'), 'utf8'));
  await database.exec(await readFile(resolve('migrations/002_contact_match_grants.sql'), 'utf8'));
  const pool = {
    query: (...args) => database.query(...args),
    connect: async () => ({ query: (...args) => database.query(...args), release() {} }),
  };
  const users = new PgUserRepository(pool);
  const phones = {
    organizer: '+919876543210',
    friend: '+919876543211',
    stranger: '+919876543212',
  };
  const verifier = {
    async verifyIdToken(token) {
      const phoneE164 = phones[token];
      if (!phoneE164) throw new InvalidIdentityToken();
      return { subject: token, phoneE164 };
    },
  };
  const authenticate = new AuthenticateUser(verifier, users);
  const organizer = await authenticate.execute('Bearer organizer');
  const friend = await authenticate.execute('Bearer friend');
  await authenticate.execute('Bearer stranger');
  await database.query('UPDATE users SET display_name = $1 WHERE id = $2', ['Priya', friend.id]);

  const circleId = '00000000-0000-4000-8000-000000000077';
  await database.query(`
    INSERT INTO circles (
      id, organizer_id, destination_label, destination_latitude,
      destination_longitude, is_private_place, time_zone, state, armed_at
    ) VALUES ($1, $2, 'Cubbon Park', 12.976, 77.592, false, 'Asia/Kolkata', 'active', now())
  `, [circleId, organizer.id]);
  await database.query(`
    INSERT INTO circle_memberships (circle_id, user_id, is_organizer, travel_role, setup_status)
    VALUES ($1, $2, true, 'mover', 'ready')
  `, [circleId, organizer.id]);

  const circles = new PgCircleRepository(pool);
  const contacts = new PgContactRepository(pool);
  const contactActions = {
    authenticate,
    match: new MatchContacts(circles, contacts),
    addMember: new AddContactMember(contacts, circles),
  };
  const app = createApp(undefined, undefined, null, undefined, contactActions);
  try {
    const unexpectedName = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/contacts/match`,
      headers: { authorization: 'Bearer organizer' },
      payload: { contacts: [{ localId: 'private-name', phoneE164: phones.friend, displayName: 'Phone book name' }] },
    });
    assert.equal(unexpectedName.statusCode, 400);

    const hidden = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/contacts/match`,
      headers: { authorization: 'Bearer stranger' },
      payload: { contacts: [{ localId: 'c1', phoneE164: phones.friend }] },
    });
    assert.equal(hidden.statusCode, 404);

    const matched = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/contacts/match`,
      headers: { authorization: 'Bearer organizer' },
      payload: { contacts: [
        { localId: 'c1', phoneE164: phones.friend },
        { localId: 'c2', phoneE164: '+919999999999' },
        { localId: 'self', phoneE164: phones.organizer },
      ] },
    });
    assert.equal(matched.statusCode, 200, matched.body);
    const items = matched.json().items;
    assert.deepEqual(items.map((item) => item.status), ['mapped', 'unmapped', 'unmapped']);
    assert.equal(items[0].displayName, 'Priya');
    assert.equal(matched.body.includes(phones.friend), false);
    assert.equal(matched.body.includes('Phone book name'), false);

    const columns = await database.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'contact_match_grants'
    `);
    assert.equal(columns.rows.some((row) => /phone|name/i.test(row.column_name)), false);

    const added = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/contact-members`,
      headers: { authorization: 'Bearer organizer' },
      payload: { matchId: items[0].matchId },
    });
    assert.equal(added.statusCode, 200, added.body);
    const member = added.json().members.find((value) => value.userId === friend.id);
    assert.equal(member.setupStatus, 'pending');
    assert.equal(member.travelRole, 'mover');
    assert.equal(member.pin, null);

    const grant = await database.query(
      'SELECT consumed_at IS NOT NULL AS consumed FROM contact_match_grants WHERE id = $1',
      [items[0].matchId],
    );
    assert.equal(grant.rows[0].consumed, true);
  } finally {
    await app.close();
    await database.close();
  }
});
