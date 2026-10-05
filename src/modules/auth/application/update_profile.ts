import type { AppUser } from '../domain/entities/app_user.js';
import type { UserRepository } from '../domain/ports/user_repository.js';

export class UpdateProfile {
  constructor(private readonly users: UserRepository) {}

  execute(userId: string, displayName: string): Promise<AppUser> {
    const trimmed = displayName.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      throw new RangeError('Display name must be 2–80 characters.');
    }
    return this.users.updateDisplayName(userId, trimmed);
  }
}
