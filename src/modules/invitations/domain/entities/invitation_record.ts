import type { CircleState } from '../../../circles/domain/entities/circle_state.js';
import type { Destination } from '../../../circles/domain/entities/destination.js';

export interface InvitationRecord {
  id: string;
  circleId: string;
  destination: Destination;
  state: CircleState;
  isPrivatePlace: boolean;
  memberNames: string[];
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: Date;
}
