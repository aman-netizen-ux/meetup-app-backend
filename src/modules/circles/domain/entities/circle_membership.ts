import type { TravelRole } from './travel_role.js';

export interface CircleMembership {
  circleId: string;
  userId: string;
  isOrganizer: boolean;
  travelRole: TravelRole;
  setupStatus: 'pending' | 'ready';
  arrivedAt: Date | null;
}
