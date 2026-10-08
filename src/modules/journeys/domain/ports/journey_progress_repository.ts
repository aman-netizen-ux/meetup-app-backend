import type { LocationUpdate } from '../../../circles/domain/entities/location_update.js';
import type { JourneyProgress } from '../entities/journey_progress.js';
import type { PrivateJourney } from '../entities/private_journey.js';

export interface JourneyProgressRepository {
  calculate(
    circleId: string,
    userId: string,
    location: LocationUpdate,
  ): Promise<JourneyProgress | null>;
  findPrivate(circleId: string, userId: string): Promise<PrivateJourney | null>;
}
