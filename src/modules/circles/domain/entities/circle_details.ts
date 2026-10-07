import type { Circle } from './circle.js';
import type { CircleMembership } from './circle_membership.js';

export interface CircleMemberDetails extends CircleMembership {
  displayName: string;
  presence: 'not_sharing' | 'live' | 'in_transit' | 'here' | 'fixed' | 'frozen';
  pin: { latitude: number; longitude: number } | null;
  lastUpdatedAt: Date | null;
  currentLeg: { mode: string; label: string } | null;
  etaMinutes: { min: number; max: number } | null;
}

export interface CircleDetails extends Circle {
  endReason: 'all_arrived' | 'organizer_ended' | 'cancelled' | 'timeout' | null;
  revision: number;
  viewerSetupStatus: 'pending' | 'ready';
  members: CircleMemberDetails[];
}
