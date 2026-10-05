import type { Auth } from 'firebase-admin/auth';
import type { VerifiedIdentity } from '../domain/entities/verified_identity.js';
import { InvalidIdentityToken } from '../domain/invalid_identity_token.js';
import type { IdentityVerifier } from '../domain/ports/identity_verifier.js';

/** Only Firebase may assert that a phone number belongs to this subject. */
export class FirebaseIdentityVerifier implements IdentityVerifier {
  constructor(private readonly auth: Auth) {}

  async verifyIdToken(token: string): Promise<VerifiedIdentity> {
    try {
      const decoded = await this.auth.verifyIdToken(token, true);
      const phone = decoded.phone_number;
      if (!phone || !/^\+[1-9][0-9]{6,14}$/.test(phone)) {
        throw new InvalidIdentityToken();
      }
      return { subject: decoded.uid, phoneE164: phone };
    } catch (error) {
      if (error instanceof InvalidIdentityToken) throw error;
      if (
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^auth\/(id-token-|argument-error|user-disabled|user-not-found)/.test(error.code)
      ) {
        throw new InvalidIdentityToken();
      }
      throw error;
    }
  }
}
