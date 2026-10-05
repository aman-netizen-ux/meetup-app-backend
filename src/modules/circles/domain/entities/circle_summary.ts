import type { CircleState } from './circle_state.js';
import type { TravelRole } from './travel_role.js';

export interface CircleSummary {
  id: string;
  destination: { label: string };
  meetupDate: string | null;
  meetupTime: string | null;
  timeZone: string;
  state: CircleState;
  myRole: TravelRole;
  isOrganizer: boolean;
  memberCount: number;
}
