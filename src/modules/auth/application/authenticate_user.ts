import type { AppUser } from '../domain/entities/app_user.js';
import { InvalidIdentityToken } from '../domain/invalid_identity_token.js';
import type { IdentityVerifier } from '../domain/ports/identity_verifier.js';
import type { UserRepository } from '../domain/ports/user_repository.js';

export class AuthenticateUser {
  constructor(
    private readonly verifier: IdentityVerifier,
    private readonly users: UserRepository,
  ) {}

  async execute(authorization: string | undefined): Promise<AppUser | null> {
    const match = /^Bearer (\S+)$/i.exec(authorization ?? '');
    if (!match) return null;
    try {
      const identity = await this.verifier.verifyIdToken(match[1]);
      if (!identity.subject || !identity.phoneE164) return null;
      return await this.users.findOrCreate(identity);
    } catch (error) {
      // Invalid/expired tokens are rejected. Database faults remain server errors.
      if (error instanceof InvalidIdentityToken) return null;
      throw error;
    }
  }
}
