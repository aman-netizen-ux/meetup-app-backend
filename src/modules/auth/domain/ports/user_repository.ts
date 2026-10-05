import type { AppUser } from '../entities/app_user.js';
import type { VerifiedIdentity } from '../entities/verified_identity.js';

export interface UserRepository {
  findOrCreate(identity: VerifiedIdentity): Promise<AppUser>;
  updateDisplayName(userId: string, displayName: string): Promise<AppUser>;
}
