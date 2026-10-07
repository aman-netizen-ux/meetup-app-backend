import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { ContactCandidate } from '../domain/entities/contact_candidate.js';
import type { ContactMatch } from '../domain/entities/contact_match.js';
import type { ContactRepository } from '../domain/ports/contact_repository.js';

interface MatchedUserRow {
  id: string;
  phone_e164: string;
  display_name: string;
}

export class PgContactRepository implements ContactRepository {
  constructor(private readonly pool: pg.Pool) {}

  async match(
    circleId: string,
    requesterId: string,
    candidates: ContactCandidate[],
    expiresAt: Date,
  ): Promise<ContactMatch[]> {
    const phones = [...new Set(candidates.map((candidate) => candidate.phoneE164))];
    const users = await this.pool.query<MatchedUserRow>(`
      SELECT id, phone_e164, display_name
      FROM users
      WHERE phone_e164 = ANY($1::text[]) AND id <> $2
    `, [phones, requesterId]);
    const byPhone = new Map(users.rows.map((user) => [user.phone_e164, user]));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const matches: ContactMatch[] = [];
      for (const candidate of candidates) {
        const user = byPhone.get(candidate.phoneE164);
        if (!user) {
          matches.push({
            localId: candidate.localId,
            status: 'unmapped', displayName: null, matchId: null,
          });
          continue;
        }
        const matchId = randomUUID();
        await client.query(`
          INSERT INTO contact_match_grants (
            id, circle_id, requester_id, target_user_id, expires_at
          ) VALUES ($1, $2, $3, $4, $5)
        `, [matchId, circleId, requesterId, user.id, expiresAt]);
        matches.push({
          localId: candidate.localId,
          status: 'mapped', displayName: user.display_name, matchId,
        });
      }
      await client.query('COMMIT');
      return matches;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addMember(
    circleId: string,
    requesterId: string,
    matchId: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const grant = await client.query<{ target_user_id: string }>(`
        SELECT target_user_id
        FROM contact_match_grants
        WHERE id = $1 AND circle_id = $2 AND requester_id = $3
          AND expires_at > now()
        FOR UPDATE
      `, [matchId, circleId, requesterId]);
      if (!grant.rows[0]) {
        await client.query('ROLLBACK');
        return false;
      }
      const inserted = await client.query(`
        INSERT INTO circle_memberships (
          circle_id, user_id, is_organizer, travel_role, setup_status
        ) VALUES ($1, $2, false, 'mover', 'pending')
        ON CONFLICT (circle_id, user_id) DO NOTHING
      `, [circleId, grant.rows[0].target_user_id]);
      await client.query(
        'UPDATE contact_match_grants SET consumed_at = COALESCE(consumed_at, now()) WHERE id = $1',
        [matchId],
      );
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
