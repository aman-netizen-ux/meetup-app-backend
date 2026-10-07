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
import { ChangeMemberRole } from '../dist/src/modules/circles/application/change_member_role.js';
import { AcceptInvitation } from '../dist/src/modules/invitations/application/accept_invitation.js';
import { CreateInvitationLink } from '../dist/src/modules/invitations/application/create_invitation_link.js';
import { PreviewInvitation } from '../dist/src/modules/invitations/application/preview_invitation.js';
import { NodeInvitationTokenService } from '../dist/src/modules/invitations/infrastructure/node_invitation_token_service.js';
import { PgInvitationRepository } from '../dist/src/modules/invitations/infrastructure/pg_invitation_repository.js';

test('invitation links preview safely and support authenticated role choice', async () => {
  const database = new PGlite();
  await database.exec(await readFile(resolve('migrations/001_initial_schema.sql'), 'utf8'));
  const pool = {
    query: (...args) => database.query(...args),
    connect: async () => ({ query: (...args) => database.query(...args), release() {} }),
  };
  const users = new PgUserRepository(pool);
  const verifier = {
    async verifyIdToken(token) {
      const phone = { organizer: '+919876543210', guest: '+919876543211' }[token];
      if (!phone) throw new InvalidIdentityToken();
      return { subject: token, phoneE164: phone };
    },
  };
  const authenticate = new AuthenticateUser(verifier, users);
  const organizer = await authenticate.execute('Bearer organizer');
  const circles = new PgCircleRepository(pool);
  const invitations = new PgInvitationRepository(pool);
  const tokens = new NodeInvitationTokenService();
  const circleId = '00000000-0000-4000-8000-000000000099';
  await database.query(`
    INSERT INTO circles (
      id, organizer_id, destination_label, destination_latitude,
      destination_longitude, is_private_place, time_zone, state, armed_at
    ) VALUES ($1, $2, 'Private home', 12.97, 77.59, true, 'Asia/Kolkata', 'active', now())
  `, [circleId, organizer.id]);
  await database.query(`
    INSERT INTO circle_memberships (circle_id, user_id, is_organizer, travel_role, setup_status)
    VALUES ($1, $2, true, 'mover', 'ready')
  `, [circleId, organizer.id]);

  const invitationActions = {
    authenticate,
    createLink: new CreateInvitationLink(circles, invitations, tokens, 'meetup://join'),
    preview: new PreviewInvitation(invitations, tokens),
    accept: new AcceptInvitation(invitations, tokens, circles),
  };
  const app = createApp(undefined, {
    authenticate,
    changeRole: new ChangeMemberRole(circles),
  }, null, invitationActions);
  try {
    const created = await app.inject({
      method: 'POST', url: `/v1/circles/${circleId}/invite-links`,
      headers: { authorization: 'Bearer organizer' }, payload: {},
    });
    assert.equal(created.statusCode, 201, created.body);
    const inviteUrl = Uri(created.json().url);
    const token = inviteUrl.pathname.slice(1);
    assert.match(token, /^[A-Za-z0-9_-]{40,64}$/);

    const stored = await database.query('SELECT token_hash FROM circle_invitations');
    assert.notEqual(stored.rows[0].token_hash, token);

    const preview = await app.inject({ method: 'GET', url: `/v1/invitations/${token}/preview` });
    assert.equal(preview.statusCode, 200, preview.body);
    assert.deepEqual(preview.json().memberNames, ['Member']);
    assert.equal(preview.json().isPrivatePlace, true);
    assert.equal(preview.body.includes('phone'), false);
    assert.equal(preview.body.includes('userId'), false);
    assert.equal(preview.body.includes('pin'), false);

    const accepted = await app.inject({
      method: 'POST', url: `/v1/invitations/${token}/accept`,
      headers: { authorization: 'Bearer guest' }, payload: { travelRole: 'anchor' },
    });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal(accepted.json().members.length, 2);
    assert.equal(accepted.json().members.find((member) => !member.isOrganizer).travelRole, 'anchor');

    const changed = await app.inject({
      method: 'PATCH', url: `/v1/circles/${circleId}/me/role`,
      headers: { authorization: 'Bearer guest' }, payload: { travelRole: 'mover' },
    });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal(changed.json().members.find((member) => !member.isOrganizer).travelRole, 'mover');
  } finally {
    await app.close();
    await database.close();
  }
});

function Uri(value) {
  return new URL(value);
}
