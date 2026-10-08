import pg from 'pg';
import type { CircleDetails, CircleMemberDetails } from '../domain/entities/circle_details.js';
import type { CircleSummary } from '../domain/entities/circle_summary.js';
import type { CircleEdit, CircleRepository, NewCircle } from '../domain/ports/circle_repository.js';
import type { TravelRole } from '../domain/entities/travel_role.js';
import type { LocationUpdate } from '../domain/entities/location_update.js';
import type { SharingTrigger } from '../domain/entities/sharing_trigger.js';
import type { JourneyProgress } from '../../journeys/domain/entities/journey_progress.js';
import type { CircleRevision } from '../domain/entities/circle_revision.js';

interface CircleRow {
  id: string;
  organizer_id: string;
  destination_label: string;
  destination_latitude: string;
  destination_longitude: string;
  destination_place_id: string | null;
  is_private_place: boolean;
  meetup_date: string | null;
  meetup_time: string | null;
  time_zone: string;
  state: CircleDetails['state'];
  end_reason: CircleDetails['endReason'];
  revision: string;
  viewer_setup_status: CircleDetails['viewerSetupStatus'];
}

interface MemberRow {
  circle_id: string;
  user_id: string;
  display_name: string;
  is_organizer: boolean;
  travel_role: CircleMemberDetails['travelRole'];
  setup_status: CircleMemberDetails['setupStatus'];
  presence: CircleMemberDetails['presence'];
  arrived_at: Date | null;
  last_pin_latitude: string | null;
  last_pin_longitude: string | null;
  last_location_at: Date | null;
  current_leg: { mode?: unknown; label?: unknown } | null;
  eta_min_minutes: number | null;
  eta_max_minutes: number | null;
}

export class PgCircleRepository implements CircleRepository {
  constructor(private readonly pool: pg.Pool) {}

  async listForUser(userId: string): Promise<CircleSummary[]> {
    const rows = await this.pool.query<CircleRow & {
      my_role: CircleSummary['myRole']; is_organizer: boolean; member_count: string;
    }>(`
      SELECT c.id, c.destination_label, to_char(c.meetup_date, 'YYYY-MM-DD') AS meetup_date,
             to_char(c.meetup_time, 'HH24:MI') AS meetup_time, c.time_zone, c.state,
             mine.travel_role AS my_role, mine.is_organizer,
             (SELECT count(*)::int FROM circle_memberships members WHERE members.circle_id = c.id) AS member_count
      FROM circles c JOIN circle_memberships mine ON mine.circle_id = c.id
      WHERE mine.user_id = $1
      ORDER BY CASE c.state WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
               c.created_at DESC
    `, [userId]);
    return rows.rows.map((row) => ({
      id: row.id, destination: { label: row.destination_label },
      meetupDate: row.meetup_date, meetupTime: row.meetup_time,
      timeZone: row.time_zone, state: row.state, myRole: row.my_role,
      isOrganizer: row.is_organizer, memberCount: Number(row.member_count),
    }));
  }

  async findForUser(circleId: string, userId: string): Promise<CircleDetails | null> {
    const circle = await this.pool.query<CircleRow>(`
      SELECT c.id, c.organizer_id, c.destination_label, c.destination_latitude,
             c.destination_longitude, c.destination_place_id, c.is_private_place,
             to_char(c.meetup_date, 'YYYY-MM-DD') AS meetup_date,
             to_char(c.meetup_time, 'HH24:MI') AS meetup_time,
             c.time_zone, c.state, c.end_reason, c.revision,
             mine.setup_status AS viewer_setup_status
      FROM circles c JOIN circle_memberships mine ON mine.circle_id = c.id
      WHERE c.id = $1 AND mine.user_id = $2
    `, [circleId, userId]);
    if (!circle.rows[0]) return null;
    const members = await this.pool.query<MemberRow>(`
      SELECT m.circle_id, m.user_id, u.display_name, m.is_organizer, m.travel_role,
             m.setup_status,
             CASE WHEN m.presence = 'live' AND live.last_location_at < now() - interval '2 minutes'
               THEN 'in_transit' ELSE m.presence END AS presence,
             m.arrived_at,
             live.last_pin_latitude, live.last_pin_longitude,
             live.last_location_at, live.current_leg,
             live.eta_min_minutes, live.eta_max_minutes
      FROM circle_memberships m JOIN users u ON u.id = m.user_id
      LEFT JOIN member_live_state live
        ON live.circle_id = m.circle_id AND live.user_id = m.user_id
      WHERE m.circle_id = $1 ORDER BY m.is_organizer DESC, m.joined_at
    `, [circleId]);
    const row = circle.rows[0];
    return {
      id: row.id, organizerId: row.organizer_id,
      destination: {
        label: row.destination_label, latitude: Number(row.destination_latitude),
        longitude: Number(row.destination_longitude), placeId: row.destination_place_id,
      },
      isPrivatePlace: row.is_private_place, meetupDate: row.meetup_date,
      meetupTime: row.meetup_time, timeZone: row.time_zone,
      state: row.state, endReason: row.end_reason, revision: Number(row.revision),
      viewerSetupStatus: row.viewer_setup_status,
      members: members.rows.map((member) => ({
        circleId: member.circle_id, userId: member.user_id,
        displayName: member.display_name, isOrganizer: member.is_organizer,
        travelRole: member.travel_role, setupStatus: member.setup_status,
        presence: member.presence, arrivedAt: member.arrived_at,
        pin: member.last_pin_latitude === null
          ? null
          : {
              latitude: Number(member.last_pin_latitude),
              longitude: Number(member.last_pin_longitude),
            },
        lastUpdatedAt: member.last_location_at,
        currentLeg:
          typeof member.current_leg?.mode === 'string' &&
          typeof member.current_leg?.label === 'string'
            ? { mode: member.current_leg.mode, label: member.current_leg.label }
            : null,
        etaMinutes:
          member.eta_min_minutes === null || member.eta_max_minutes === null
            ? null
            : { min: member.eta_min_minutes, max: member.eta_max_minutes },
      })),
    };
  }

  async create(input: NewCircle): Promise<CircleDetails> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO circles (
          id, organizer_id, destination_label, destination_latitude, destination_longitude,
          destination_place_id, is_private_place, meetup_date, meetup_time, time_zone,
          target_at, state, armed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `, [
        input.id, input.organizerId, input.destination.label,
        input.destination.latitude, input.destination.longitude, input.destination.placeId,
        input.isPrivatePlace, input.meetupDate, input.meetupTime, input.timeZone,
        input.targetAt, input.state, input.armedAt,
      ]);
      await client.query(`
        INSERT INTO circle_memberships (circle_id, user_id, is_organizer, travel_role, setup_status)
        VALUES ($1, $2, true, 'mover', 'ready')
      `, [input.id, input.organizerId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return (await this.findForUser(input.id, input.organizerId))!;
  }

  async hasInvitees(circleId: string): Promise<boolean> {
    const result = await this.pool.query<{ has_invitees: boolean }>(`
      SELECT EXISTS (SELECT 1 FROM circle_memberships WHERE circle_id = $1 AND NOT is_organizer)
          OR EXISTS (SELECT 1 FROM circle_invitations WHERE circle_id = $1) AS has_invitees
    `, [circleId]);
    return result.rows[0].has_invitees;
  }

  async update(circleId: string, organizerId: string, edit: CircleEdit): Promise<CircleDetails | null> {
    const result = await this.pool.query(`
      UPDATE circles SET meetup_date = $3, meetup_time = $4, is_private_place = $5,
        state = $6, target_at = $7,
        armed_at = CASE WHEN $6 = 'active' AND armed_at IS NULL THEN $8 ELSE armed_at END,
        revision = revision + 1, updated_at = now()
      WHERE id = $1 AND organizer_id = $2 AND revision = $9 AND state <> 'ended'
    `, [circleId, organizerId, edit.meetupDate, edit.meetupTime, edit.isPrivatePlace,
      edit.state, edit.targetAt, edit.armedAt, edit.expectedRevision]);
    return result.rowCount ? this.findForUser(circleId, organizerId) : null;
  }

  async end(circleId: string, organizerId: string, reason: 'organizer_ended' | 'cancelled'): Promise<CircleDetails | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ state: string }>(
        'SELECT state FROM circles WHERE id = $1 AND organizer_id = $2 FOR UPDATE',
        [circleId, organizerId],
      );
      if (!current.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      if (current.rows[0].state !== 'ended') {
        await client.query(`
          UPDATE circles SET state = 'ended', end_reason = $3, ended_at = now(),
            revision = revision + 1, updated_at = now() WHERE id = $1 AND organizer_id = $2
        `, [circleId, organizerId, reason]);
        await client.query('SELECT purge_circle_journey_data($1)', [circleId]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findForUser(circleId, organizerId);
  }

  async changeRole(circleId: string, userId: string, role: TravelRole): Promise<CircleDetails | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const changed = await client.query(`
        UPDATE circle_memberships m SET travel_role = $3, setup_status = 'ready',
          presence = CASE
            WHEN $3 = 'anchor' AND EXISTS (
              SELECT 1 FROM member_live_state live
              WHERE live.circle_id = m.circle_id AND live.user_id = m.user_id
            ) THEN 'frozen'
            WHEN $3 = 'anchor' THEN 'fixed'
            ELSE 'not_sharing'
          END,
          arrived_at = CASE WHEN $3 = 'mover' THEN NULL ELSE arrived_at END
        FROM circles c
        WHERE m.circle_id = $1 AND m.user_id = $2 AND c.id = m.circle_id
          AND c.state <> 'ended'
      `, [circleId, userId, role]);
      if (!changed.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }
      if (role === 'mover') {
        await client.query(
          'DELETE FROM member_live_state WHERE circle_id = $1 AND user_id = $2',
          [circleId, userId],
        );
      }
      await client.query(
        'UPDATE circles SET revision = revision + 1, updated_at = now() WHERE id = $1',
        [circleId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findForUser(circleId, userId);
  }

  async startLocationSharing(
    circleId: string,
    userId: string,
    trigger: SharingTrigger,
    location: LocationUpdate,
  ): Promise<CircleDetails | null> {
    return this.saveLocation(circleId, userId, location, trigger);
  }

  async ingestLocation(
    circleId: string,
    userId: string,
    location: LocationUpdate,
    progress: JourneyProgress | null = null,
  ): Promise<CircleDetails | null> {
    return this.saveLocation(circleId, userId, location, null, progress);
  }

  async markArrived(circleId: string, userId: string): Promise<CircleDetails | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const eligible = await client.query(`
        SELECT c.id FROM circles c JOIN circle_memberships m ON m.circle_id = c.id
        WHERE c.id = $1 AND m.user_id = $2 AND c.state = 'active'
          AND m.travel_role = 'mover' AND m.setup_status = 'ready' AND m.arrived_at IS NULL
        FOR UPDATE OF c, m
      `, [circleId, userId]);
      if (!eligible.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query(`
        UPDATE circle_memberships SET arrived_at = now(), presence = 'here'
        WHERE circle_id = $1 AND user_id = $2
      `, [circleId, userId]);
      await client.query(`
        INSERT INTO arrival_events (circle_id, user_id, arrived_at)
        VALUES ($1, $2, now()) ON CONFLICT (circle_id, user_id) DO NOTHING
      `, [circleId, userId]);
      await client.query('DELETE FROM member_live_state WHERE circle_id = $1 AND user_id = $2', [circleId, userId]);
      const allArrived = await client.query<{ complete: boolean }>(`
        SELECT count(*) > 0 AND bool_and(arrived_at IS NOT NULL) AS complete
        FROM circle_memberships
        WHERE circle_id = $1 AND travel_role = 'mover' AND setup_status = 'ready'
      `, [circleId]);
      if (allArrived.rows[0]?.complete) {
        await client.query(`
          UPDATE circles SET state = 'ended', end_reason = 'all_arrived', ended_at = now(),
            revision = revision + 1, updated_at = now() WHERE id = $1
        `, [circleId]);
        await client.query('SELECT purge_circle_journey_data($1)', [circleId]);
      } else {
        await client.query('UPDATE circles SET revision = revision + 1, updated_at = now() WHERE id = $1', [circleId]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findForUser(circleId, userId);
  }

  async advanceLifecycle(now: Date): Promise<CircleRevision[]> {
    const client = await this.pool.connect();
    const revisions: CircleRevision[] = [];
    try {
      await client.query('BEGIN');
      const armed = await client.query<{ id: string; revision: string }>(`
        UPDATE circles SET state = 'active', armed_at = $1, revision = revision + 1, updated_at = $1
        WHERE state = 'scheduled' AND meetup_date IS NOT NULL
          AND meetup_date <= ($1::timestamptz AT TIME ZONE time_zone)::date
        RETURNING id, revision
      `, [now]);
      revisions.push(...armed.rows.map((row) => ({ id: row.id, revision: Number(row.revision) })));
      const expired = await client.query<{ id: string; revision: string }>(`
        UPDATE circles SET state = 'ended', end_reason = 'timeout', ended_at = $1,
          revision = revision + 1, updated_at = $1
        WHERE state = 'active' AND armed_at <= $1::timestamptz - interval '12 hours'
        RETURNING id, revision
      `, [now]);
      for (const row of expired.rows) {
        await client.query('SELECT purge_circle_journey_data($1)', [row.id]);
        revisions.push({ id: row.id, revision: Number(row.revision) });
      }
      await client.query('COMMIT');
      return revisions;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async saveLocation(
    circleId: string,
    userId: string,
    location: LocationUpdate,
    trigger: SharingTrigger | null,
    progress: JourneyProgress | null = null,
  ): Promise<CircleDetails | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const allowed = await client.query(`
        SELECT 1 FROM circle_memberships m
        JOIN circles c ON c.id = m.circle_id
        LEFT JOIN member_live_state live
          ON live.circle_id = m.circle_id AND live.user_id = m.user_id
        WHERE m.circle_id = $1 AND m.user_id = $2 AND c.state = 'active'
          AND m.travel_role = 'mover' AND m.setup_status = 'ready'
          AND m.arrived_at IS NULL
          AND ($4::text IS NOT NULL OR live.sharing_started_at IS NOT NULL)
          AND (live.last_location_at IS NULL OR live.last_location_at < $3)
        FOR UPDATE OF m
      `, [circleId, userId, location.capturedAt, trigger]);
      if (!allowed.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query(`
        INSERT INTO member_live_state (
          circle_id, user_id, sharing_started_at, sharing_trigger,
          last_pin_latitude, last_pin_longitude, last_location_at
        ) VALUES ($1, $2, now(), $6, $3, $4, $5)
        ON CONFLICT (circle_id, user_id) DO UPDATE SET
          sharing_started_at = COALESCE(member_live_state.sharing_started_at, now()),
          sharing_trigger = COALESCE(member_live_state.sharing_trigger, $6),
          last_pin_latitude = $3, last_pin_longitude = $4, last_location_at = $5
      `, [circleId, userId, location.latitude, location.longitude,
        location.capturedAt, trigger]);
      if (progress) {
        await client.query(`
          UPDATE member_live_state SET
            current_leg = $3,
            eta_min_minutes = $4,
            eta_max_minutes = $5,
            leave_by_at = $6
          WHERE circle_id = $1 AND user_id = $2
        `, [
          circleId,
          userId,
          progress.currentLeg ? JSON.stringify(progress.currentLeg) : null,
          progress.etaMinutes?.min ?? null,
          progress.etaMinutes?.max ?? null,
          progress.leaveByAt,
        ]);
      }
      await client.query(`
        INSERT INTO location_samples (
          circle_id, user_id, latitude, longitude, accuracy_meters, captured_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [circleId, userId, location.latitude, location.longitude,
        location.accuracyMeters, location.capturedAt]);
      await client.query(
        "UPDATE circle_memberships SET presence = 'live' WHERE circle_id = $1 AND user_id = $2",
        [circleId, userId],
      );
      await client.query(
        'UPDATE circles SET revision = revision + 1, updated_at = now() WHERE id = $1',
        [circleId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findForUser(circleId, userId);
  }
}
