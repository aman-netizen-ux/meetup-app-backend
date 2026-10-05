import type { Circle } from './circle.js';
import type { CircleMembership } from './circle_membership.js';

export interface CircleMemberDetails extends CircleMembership {
  displayName: string;
  presence: string;
}

export interface CircleDetails extends Circle {
  endReason: 'all_arrived' | 'organizer_ended' | 'cancelled' | 'timeout' | null;
  revision: number;
  members: CircleMemberDetails[];
}
