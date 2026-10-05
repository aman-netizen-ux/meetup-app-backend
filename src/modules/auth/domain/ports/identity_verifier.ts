import type { VerifiedIdentity } from '../entities/verified_identity.js';

export interface IdentityVerifier {
  verifyIdToken(token: string): Promise<VerifiedIdentity>;
}
