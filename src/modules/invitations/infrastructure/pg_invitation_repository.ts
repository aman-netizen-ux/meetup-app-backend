import pg from 'pg';
import type { TravelRole } from '../../circles/domain/entities/travel_role.js';
import type { InvitationRecord } from '../domain/entities/invitation_record.js';
import type { InvitationRepository, NewInvitation } from '../domain/ports/invitation_repository.js';

interface InvitationRow {
  id: string;
  circle_id: string;
  destination_label: string;
  destination_latitude: string;
  destination_longitude: string;
  destination_place_id: string | null;
  state: InvitationRecord['state'];
  is_private_place: boolean;
  status: InvitationRecord['status'];
  expires_at: Date;
  member_names: string[];
}

export class PgInvitationRepository implements InvitationRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: NewInvitation): Promise<void> {
    await this.pool.query(`
      INSERT INTO circle_invitations (id, circle_id, token_hash, created_by, expires_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [input.id, input.circleId, input.tokenHash, input.createdBy, input.expiresAt]);
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    const result = await this.pool.query<InvitationRow>(`
      SELECT i.id, i.circle_id, i.status, i.expires_at,
             c.destination_label, c.destination_latitude, c.destination_longitude,
             c.destination_place_id, c.state, c.is_private_place,
             COALESCE(array_agg(u.display_name ORDER BY m.is_organizer DESC, m.joined_at)
               FILTER (WHERE u.id IS NOT NULL), ARRAY[]::text[]) AS member_names
      FROM circle_invitations i
      JOIN circles c ON c.id = i.circle_id
      LEFT JOIN circle_memberships m ON m.circle_id = c.id
      LEFT JOIN users u ON u.id = m.user_id
      WHERE i.token_hash = $1
      GROUP BY i.id, c.id
    `, [tokenHash]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id, circleId: row.circle_id,
      destination: {
        label: row.destination_label,
        latitude: Number(row.destination_latitude),
        longitude: Number(row.destination_longitude),
        placeId: row.destination_place_id,
      },
      state: row.state, isPrivatePlace: row.is_private_place,
      memberNames: row.member_names, status: row.status, expiresAt: row.expires_at,
    };
  }

  async addMember(
    invitationId: string,
    circleId: string,
    userId: string,
    role: TravelRole,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const available = await client.query(`
        SELECT 1 FROM circle_invitations i
        JOIN circles c ON c.id = i.circle_id
        WHERE i.id = $1 AND i.circle_id = $2 AND i.status = 'pending'
          AND i.expires_at > now() AND c.state <> 'ended'
        FOR UPDATE OF i
      `, [invitationId, circleId]);
      if (!available.rowCount) {
        await client.query('ROLLBACK');
        return false;
      }
      const inserted = await client.query(`
        INSERT INTO circle_memberships (
          circle_id, user_id, is_organizer, travel_role, setup_status
        ) VALUES ($1, $2, false, $3, 'ready')
        ON CONFLICT (circle_id, user_id) DO NOTHING
      `, [circleId, userId, role]);
      if (inserted.rowCount) {
        await client.query(
          'UPDATE circles SET revision = revision + 1, updated_at = now() WHERE id = $1',
          [circleId],
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
