import type { CircleDetails } from '../domain/entities/circle_details.js';
import type { LocationUpdate } from '../domain/entities/location_update.js';
import type { CircleEventPublisher } from '../domain/ports/circle_event_publisher.js';
import type { CircleRepository } from '../domain/ports/circle_repository.js';
import { CircleRuleError } from '../domain/circle_rule_error.js';
import { LocationUpdatePolicy } from '../domain/location_update_policy.js';

export class IngestLocation {
  constructor(
    private readonly circles: CircleRepository,
    private readonly policy: LocationUpdatePolicy,
    private readonly events?: CircleEventPublisher,
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
    const updated = await this.circles.ingestLocation(circleId, userId, location);
    if (!updated) {
      throw new CircleRuleError('LOCATION_NOT_ALLOWED', 'This circle is not accepting your location.');
    }
    this.events?.publish(updated.id, updated.revision);
    return updated;
  }
}
