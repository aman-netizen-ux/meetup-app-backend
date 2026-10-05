import assert from 'node:assert/strict';
import test from 'node:test';

import { FirebaseIdentityVerifier } from '../dist/src/modules/auth/infrastructure/firebase_identity_verifier.js';
import { InvalidIdentityToken } from '../dist/src/modules/auth/domain/invalid_identity_token.js';

test('Firebase adapter accepts only a token with a verified phone claim', async () => {
  const valid = new FirebaseIdentityVerifier({
    async verifyIdToken(token, checkRevoked) {
      assert.equal(token, 'valid');
      assert.equal(checkRevoked, true);
      return { uid: 'firebase-uid-1', phone_number: '+919876543210' };
    },
  });
  assert.deepEqual(await valid.verifyIdToken('valid'), {
    subject: 'firebase-uid-1',
    phoneE164: '+919876543210',
  });

  const noPhone = new FirebaseIdentityVerifier({
    async verifyIdToken() { return { uid: 'email-only' }; },
  });
  await assert.rejects(noPhone.verifyIdToken('valid'), InvalidIdentityToken);

  const expired = new FirebaseIdentityVerifier({
    async verifyIdToken() {
      throw Object.assign(new Error('expired'), { code: 'auth/id-token-expired' });
    },
  });
  await assert.rejects(expired.verifyIdToken('expired'), InvalidIdentityToken);
});
