import pg from 'pg';
import type { NotificationDeliveryRepository } from '../domain/ports/notification_delivery_repository.js';

export class PgNotificationDeliveryRepository implements NotificationDeliveryRepository {
  constructor(private readonly pool: pg.Pool) {}

  async tokensForUser(userId: string): Promise<string[]> {
    const result = await this.pool.query<{ token: string }>(
      'SELECT token FROM device_push_tokens WHERE user_id = $1', [userId],
    );
    return result.rows.map((row) => row.token);
  }

  async claim(eventKey: string, token: string): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO notification_deliveries (event_key, device_token)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`, [eventKey, token],
    );
    return result.rowCount === 1;
  }
}
