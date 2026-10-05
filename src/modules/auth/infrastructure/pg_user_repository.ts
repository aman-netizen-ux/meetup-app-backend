import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { AppUser } from '../domain/entities/app_user.js';
import type { VerifiedIdentity } from '../domain/entities/verified_identity.js';
import type { UserRepository } from '../domain/ports/user_repository.js';

interface UserRow {
  id: string;
  phone_e164: string | null;
  display_name: string;
  profile_completed: boolean;
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: pg.Pool) {}

  async findOrCreate(identity: VerifiedIdentity): Promise<AppUser> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (id, auth_subject, phone_e164, display_name)
       VALUES ($1, $2, $3, 'Member')
       ON CONFLICT (auth_subject) DO UPDATE
         SET phone_e164 = EXCLUDED.phone_e164, updated_at = now()
       RETURNING id, phone_e164, display_name, profile_completed`,
      [randomUUID(), identity.subject, identity.phoneE164],
    );
    return this.mapRow(result.rows[0]);
  }

  async updateDisplayName(userId: string, displayName: string): Promise<AppUser> {
    const result = await this.pool.query<UserRow>(
      `UPDATE users SET display_name = $2, profile_completed = true, updated_at = now()
       WHERE id = $1 RETURNING id, phone_e164, display_name, profile_completed`,
      [userId, displayName],
    );
    if (!result.rows[0]) throw new Error('Authenticated user is missing.');
    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: UserRow): AppUser {
    return {
      id: row.id,
      phoneE164: row.phone_e164,
      displayName: row.display_name,
      profileCompleted: row.profile_completed,
    };
  }
}
