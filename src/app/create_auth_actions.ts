import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { AuthenticateUser } from '../modules/auth/application/authenticate_user.js';
import { RegisterDeviceToken } from '../modules/auth/application/register_device_token.js';
import { UpdateProfile } from '../modules/auth/application/update_profile.js';
import { FirebaseIdentityVerifier } from '../modules/auth/infrastructure/firebase_identity_verifier.js';
import { PgDeviceTokenRepository } from '../modules/auth/infrastructure/pg_device_token_repository.js';
import { PgUserRepository } from '../modules/auth/infrastructure/pg_user_repository.js';
import type { AuthRouteActions } from '../modules/auth/presentation/auth_routes.js';
import { PgPoolProvider } from '../shared/infrastructure/database/pg_pool.js';

export function createAuthActions(poolProvider: PgPoolProvider): AuthRouteActions {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required for authentication.');
  const firebaseApp = getApps()[0] ?? initializeApp({
    credential: applicationDefault(),
    projectId,
  });
  const users = new PgUserRepository(poolProvider.getPool());
  const tokens = new PgDeviceTokenRepository(poolProvider.getPool());
  return {
    authenticate: new AuthenticateUser(new FirebaseIdentityVerifier(getAuth(firebaseApp)), users),
    updateProfile: new UpdateProfile(users),
    registerDeviceToken: new RegisterDeviceToken(tokens),
  };
}
