import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { RouteCandidate } from '../domain/entities/route_candidate.js';
import type { RouteOption } from '../domain/entities/route_option.js';
import type {
  JourneyRouteRepository,
  SelectedRouteResult,
} from '../domain/ports/journey_route_repository.js';

interface OptionRow {
  id: string;
  provider: string;
  route_snapshot: RouteCandidate;
  expires_at: Date | null;
}

export class PgJourneyRouteRepository implements JourneyRouteRepository {
  constructor(private readonly pool: pg.Pool) {}

  async replaceOptions(
    circleId: string,
    userId: string,
    candidates: RouteCandidate[],
    expiresAt: Date,
  ): Promise<RouteOption[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM route_option_quotes WHERE circle_id = $1 AND user_id = $2',
        [circleId, userId],
      );
      const options: RouteOption[] = [];
      for (const candidate of candidates) {
        const id = randomUUID();
        await client.query(`
          INSERT INTO route_option_quotes (
            id, circle_id, user_id, provider, route_snapshot, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [id, circleId, userId, candidate.provider, JSON.stringify(candidate), expiresAt]);
        options.push({ id, ...candidate, expiresAt });
      }
      await client.query('COMMIT');
      return options;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async selectOption(
    circleId: string,
    userId: string,
    optionId: string,
  ): Promise<SelectedRouteResult | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const quote = await client.query<OptionRow>(`
        SELECT q.id, q.provider, q.route_snapshot, q.expires_at
        FROM route_option_quotes q
        JOIN circle_memberships m ON m.circle_id = q.circle_id AND m.user_id = q.user_id
        JOIN circles c ON c.id = q.circle_id
        WHERE q.id = $1 AND q.circle_id = $2 AND q.user_id = $3
          AND q.expires_at > now() AND c.state = 'active'
          AND m.travel_role = 'mover' AND m.setup_status = 'ready' AND m.arrived_at IS NULL
        FOR UPDATE OF q
      `, [optionId, circleId, userId]);
      if (!quote.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      const row = quote.rows[0];
      await client.query(`
        INSERT INTO selected_routes (
          circle_id, user_id, provider, route_option_id, route_snapshot, selected_at
        ) VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (circle_id, user_id) DO UPDATE SET
          provider = excluded.provider, route_option_id = excluded.route_option_id,
          route_snapshot = excluded.route_snapshot, selected_at = now()
      `, [circleId, userId, row.provider, row.id, JSON.stringify(row.route_snapshot)]);
      const firstLeg = row.route_snapshot.legs[0];
      if (firstLeg) {
        await client.query(`
          UPDATE member_live_state SET current_leg = $3
          WHERE circle_id = $1 AND user_id = $2
        `, [circleId, userId, JSON.stringify({ mode: firstLeg.mode, label: firstLeg.label })]);
      }
      const revision = await client.query<{ revision: string }>(`
        UPDATE circles SET revision = revision + 1, updated_at = now()
        WHERE id = $1 RETURNING revision
      `, [circleId]);
      await client.query('COMMIT');
      return {
        option: { id: row.id, ...row.route_snapshot, expiresAt: null },
        circleRevision: Number(revision.rows[0].revision),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findSelected(circleId: string, userId: string): Promise<RouteOption | null> {
    const selected = await this.pool.query<OptionRow>(`
      SELECT route_option_id AS id, provider, route_snapshot, NULL AS expires_at
      FROM selected_routes WHERE circle_id = $1 AND user_id = $2
    `, [circleId, userId]);
    const row = selected.rows[0];
    return row ? { id: row.id, ...row.route_snapshot, expiresAt: row.expires_at } : null;
  }
}
