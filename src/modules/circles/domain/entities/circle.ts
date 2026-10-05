import type { CircleState } from './circle_state.js';
import type { Destination } from './destination.js';

export interface Circle {
  id: string;
  organizerId: string;
  destination: Destination;
  isPrivatePlace: boolean;
  meetupDate: string | null;
  meetupTime: string | null;
  timeZone: string;
  state: CircleState;
}
