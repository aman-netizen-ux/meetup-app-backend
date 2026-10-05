import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import { createApp } from '../dist/src/app/create_app.js';
import { AuthenticateUser } from '../dist/src/modules/auth/application/authenticate_user.js';
import { RegisterDeviceToken } from '../dist/src/modules/auth/application/register_device_token.js';
import { UpdateProfile } from '../dist/src/modules/auth/application/update_profile.js';
import { InvalidIdentityToken } from '../dist/src/modules/auth/domain/invalid_identity_token.js';
import { PgDeviceTokenRepository } from '../dist/src/modules/auth/infrastructure/pg_device_token_repository.js';
import { PgUserRepository } from '../dist/src/modules/auth/infrastructure/pg_user_repository.js';

test('verified phone user is created once and account routes require a valid token', async () => {
  const database = new PGlite();
  const sql = await readFile(resolve('migrations/001_initial_schema.sql'), 'utf8');
  await database.exec(sql);
  const users = new PgUserRepository(database);
  const tokens = new PgDeviceTokenRepository(database);
  const verifier = {
    async verifyIdToken(token) {
      if (token !== 'valid-token') throw new InvalidIdentityToken();
      return { subject: 'firebase-uid-1', phoneE164: '+919876543210' };
    },
  };
  const app = createApp({
    authenticate: new AuthenticateUser(verifier, users),
    updateProfile: new UpdateProfile(users),
    registerDeviceToken: new RegisterDeviceToken(tokens),
  });
  try {
    const unauthorized = await app.inject({ method: 'GET', url: '/v1/me' });
    assert.equal(unauthorized.statusCode, 401);
    const invalid = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer wrong' } });
    assert.equal(invalid.statusCode, 401);

    const headers = { authorization: 'Bearer valid-token' };
    const first = await app.inject({ method: 'GET', url: '/v1/me', headers });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().user.phoneE164, '+919876543210');
    assert.equal(first.json().user.profileCompleted, false);
    const userId = first.json().user.id;
    const second = await app.inject({ method: 'GET', url: '/v1/me', headers });
    assert.equal(second.json().user.id, userId);

    const badName = await app.inject({ method: 'PATCH', url: '/v1/me', headers, payload: { displayName: ' ' } });
    assert.equal(badName.statusCode, 422);
    const named = await app.inject({ method: 'PATCH', url: '/v1/me', headers, payload: { displayName: '  Priya  ' } });
    assert.equal(named.statusCode, 200);
    assert.equal(named.json().user.displayName, 'Priya');
    assert.equal(named.json().user.profileCompleted, true);

    const registered = await app.inject({ method: 'POST', url: '/v1/me/device-tokens', headers, payload: { platform: 'android', token: 'push-token-1' } });
    assert.equal(registered.statusCode, 204);
    const count = await database.query('SELECT count(*)::int AS count FROM device_push_tokens WHERE user_id = $1', [userId]);
    assert.equal(count.rows[0].count, 1);
  } finally {
    await app.close();
    await database.close();
  }
});
