import type { CircleDetails } from '../domain/entities/circle_details.js';
import type { LocationUpdate } from '../domain/entities/location_update.js';
import type { CircleEventPublisher } from '../domain/ports/circle_event_publisher.js';
import type { CircleRepository } from '../domain/ports/circle_repository.js';
import { CircleRuleError } from '../domain/circle_rule_error.js';
import { LocationUpdatePolicy } from '../domain/location_update_policy.js';
import type { JourneyProgressRepository } from '../../journeys/domain/ports/journey_progress_repository.js';

export class IngestLocation {
  constructor(
    private readonly circles: CircleRepository,
    private readonly policy: LocationUpdatePolicy,
    private readonly events?: CircleEventPublisher,
    private readonly journeyProgress?: JourneyProgressRepository,
  ) {}

  async execute(
    circleId: string,
    userId: string,
    consentGranted: boolean,
    location: LocationUpdate,
  ): Promise<CircleDetails> {
    if (!consentGranted) {
      throw new CircleRuleError('LOCATION_CONSENT_REQUIRED', 'Location sharing requires your consent.');
    }
    this.policy.validate(location);
    const progress = await this.journeyProgress?.calculate(circleId, userId, location);
    const updated = await this.circles.ingestLocation(
      circleId,
      userId,
      location,
      progress,
    );
    if (!updated) {
      throw new CircleRuleError('LOCATION_NOT_ALLOWED', 'This circle is not accepting your location.');
    }
    this.events?.publish(updated.id, updated.revision);
    return updated;
  }
}
