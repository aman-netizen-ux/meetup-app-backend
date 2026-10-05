import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { DeviceTokenRepository } from '../domain/ports/device_token_repository.js';

export class PgDeviceTokenRepository implements DeviceTokenRepository {
  constructor(private readonly pool: pg.Pool) {}

  async register(userId: string, platform: 'android' | 'ios', token: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO device_push_tokens (id, user_id, platform, token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             platform = EXCLUDED.platform,
             last_seen_at = now()`,
      [randomUUID(), userId, platform, token],
    );
  }
}
