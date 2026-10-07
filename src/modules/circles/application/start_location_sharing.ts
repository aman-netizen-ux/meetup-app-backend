import type { CircleDetails } from '../domain/entities/circle_details.js';
import type { LocationUpdate } from '../domain/entities/location_update.js';
import type { SharingTrigger } from '../domain/entities/sharing_trigger.js';
import type { CircleEventPublisher } from '../domain/ports/circle_event_publisher.js';
import type { CircleRepository } from '../domain/ports/circle_repository.js';
import { CircleRuleError } from '../domain/circle_rule_error.js';
import { LocationUpdatePolicy } from '../domain/location_update_policy.js';

export class StartLocationSharing {
  constructor(
    private readonly circles: CircleRepository,
    private readonly policy: LocationUpdatePolicy,
    private readonly events?: CircleEventPublisher,
  ) {}

  async execute(
    circleId: string,
    userId: string,
    trigger: SharingTrigger,
    consentGranted: boolean,
    location: LocationUpdate,
  ): Promise<CircleDetails> {
    if (!consentGranted) {
      throw new CircleRuleError('LOCATION_CONSENT_REQUIRED', 'Location sharing requires your consent.');
    }
    this.policy.validate(location);
    const updated = await this.circles.startLocationSharing(
      circleId,
      userId,
      trigger,
      location,
    );
    if (!updated) {
      throw new CircleRuleError('LOCATION_NOT_ALLOWED', 'Location sharing is not available for this membership.');
    }
    this.events?.publish(updated.id, updated.revision);
    return updated;
  }
}
