import type { CircleDetails } from '../entities/circle_details.js';
import type { CircleSummary } from '../entities/circle_summary.js';
import type { Destination } from '../entities/destination.js';
import type { CircleState } from '../entities/circle_state.js';
import type { TravelRole } from '../entities/travel_role.js';

export interface NewCircle {
  id: string;
  organizerId: string;
  destination: Destination;
  isPrivatePlace: boolean;
  meetupDate: string | null;
  meetupTime: string | null;
  timeZone: string;
  state: CircleState;
  targetAt: Date | null;
  armedAt: Date | null;
}

export interface CircleEdit {
  meetupDate: string | null;
  meetupTime: string | null;
  isPrivatePlace: boolean;
  state: CircleState;
  targetAt: Date | null;
  armedAt: Date | null;
  expectedRevision: number;
}

/** Domain port. PostgreSQL implementation belongs in infrastructure. */
export interface CircleRepository {
  listForUser(userId: string): Promise<CircleSummary[]>;
  findForUser(circleId: string, userId: string): Promise<CircleDetails | null>;
  create(input: NewCircle): Promise<CircleDetails>;
  hasInvitees(circleId: string): Promise<boolean>;
  update(circleId: string, organizerId: string, edit: CircleEdit): Promise<CircleDetails | null>;
  end(circleId: string, organizerId: string, reason: 'organizer_ended' | 'cancelled'): Promise<CircleDetails | null>;
  changeRole(circleId: string, userId: string, role: TravelRole): Promise<CircleDetails | null>;
}
