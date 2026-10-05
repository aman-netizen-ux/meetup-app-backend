import pg from 'pg';
import type { CircleDetails, CircleMemberDetails } from '../domain/entities/circle_details.js';
import type { CircleSummary } from '../domain/entities/circle_summary.js';
import type { CircleEdit, CircleRepository, NewCircle } from '../domain/ports/circle_repository.js';

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
}

interface MemberRow {
  circle_id: string;
  user_id: string;
  display_name: string;
  is_organizer: boolean;
  travel_role: CircleMemberDetails['travelRole'];
  setup_status: CircleMemberDetails['setupStatus'];
  presence: string;
  arrived_at: Date | null;
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
             c.time_zone, c.state, c.end_reason, c.revision
      FROM circles c JOIN circle_memberships mine ON mine.circle_id = c.id
      WHERE c.id = $1 AND mine.user_id = $2
    `, [circleId, userId]);
    if (!circle.rows[0]) return null;
    const members = await this.pool.query<MemberRow>(`
      SELECT m.circle_id, m.user_id, u.display_name, m.is_organizer, m.travel_role,
             m.setup_status, m.presence, m.arrived_at
      FROM circle_memberships m JOIN users u ON u.id = m.user_id
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
      members: members.rows.map((member) => ({
        circleId: member.circle_id, userId: member.user_id,
        displayName: member.display_name, isOrganizer: member.is_organizer,
        travelRole: member.travel_role, setupStatus: member.setup_status,
        presence: member.presence, arrivedAt: member.arrived_at,
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
}
