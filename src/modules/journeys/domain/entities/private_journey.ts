import type { TravelRole } from '../../../circles/domain/entities/travel_role.js';

export interface PrivateJourney {
  travelRole: TravelRole;
  etaMinutes: { min: number; max: number } | null;
  leaveByAt: Date | null;
  arrivalDeltaMinutes: number | null;
}
