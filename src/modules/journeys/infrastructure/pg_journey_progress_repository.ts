import pg from 'pg';
import type { LocationUpdate } from '../../circles/domain/entities/location_update.js';
import type { JourneyProgress } from '../domain/entities/journey_progress.js';
import type { PrivateJourney } from '../domain/entities/private_journey.js';
import type { RouteCandidate } from '../domain/entities/route_candidate.js';
import type { JourneyProgressRepository } from '../domain/ports/journey_progress_repository.js';
import { JourneyProgressPolicy } from '../domain/journey_progress_policy.js';

interface ProgressSourceRow {
  route_snapshot: RouteCandidate;
  target_at: Date | null;
}

interface PrivateJourneyRow {
  travel_role: PrivateJourney['travelRole'];
  eta_min_minutes: number | null;
  eta_max_minutes: number | null;
  leave_by_at: Date | null;
  target_at: Date | null;
  arrived_at: Date | null;
}

export class PgJourneyProgressRepository implements JourneyProgressRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly policy = new JourneyProgressPolicy(),
  ) {}

  async calculate(
    circleId: string,
    userId: string,
    location: LocationUpdate,
  ): Promise<JourneyProgress | null> {
    const result = await this.pool.query<ProgressSourceRow>(`
      SELECT selected.route_snapshot, circle.target_at
      FROM selected_routes selected
      JOIN circles circle ON circle.id = selected.circle_id
      JOIN circle_memberships member
        ON member.circle_id = selected.circle_id AND member.user_id = selected.user_id
      WHERE selected.circle_id = $1 AND selected.user_id = $2
        AND circle.state = 'active' AND member.travel_role = 'mover'
        AND member.setup_status = 'ready' AND member.arrived_at IS NULL
    `, [circleId, userId]);
    const row = result.rows[0];
    return row
      ? this.policy.calculate(row.route_snapshot, location, row.target_at)
      : null;
  }

  async findPrivate(circleId: string, userId: string): Promise<PrivateJourney | null> {
    const result = await this.pool.query<PrivateJourneyRow>(`
      SELECT member.travel_role, live.eta_min_minutes, live.eta_max_minutes,
             live.leave_by_at, circle.target_at, member.arrived_at
      FROM circle_memberships member
      JOIN circles circle ON circle.id = member.circle_id
      LEFT JOIN member_live_state live
        ON live.circle_id = member.circle_id AND live.user_id = member.user_id
      WHERE member.circle_id = $1 AND member.user_id = $2
    `, [circleId, userId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      travelRole: row.travel_role,
      etaMinutes: row.eta_min_minutes === null || row.eta_max_minutes === null
        ? null
        : { min: row.eta_min_minutes, max: row.eta_max_minutes },
      leaveByAt: row.leave_by_at,
      arrivalDeltaMinutes: row.target_at && row.arrived_at
        ? Math.round((row.arrived_at.getTime() - row.target_at.getTime()) / 60_000)
        : null,
    };
  }
}
