import type { CircleDetails } from '../domain/entities/circle_details.js';
import type { TravelRole } from '../domain/entities/travel_role.js';
import { CircleRuleError } from '../domain/circle_rule_error.js';
import type { CircleRepository } from '../domain/ports/circle_repository.js';
import type { CircleEventPublisher } from '../domain/ports/circle_event_publisher.js';

export class ChangeMemberRole {
  constructor(
    private readonly circles: CircleRepository,
    private readonly events?: CircleEventPublisher,
  ) {}

  async execute(circleId: string, userId: string, role: TravelRole): Promise<CircleDetails> {
    const circle = await this.circles.findForUser(circleId, userId);
    if (!circle) throw new CircleRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    if (circle.state === 'ended') throw new CircleRuleError('CIRCLE_ENDED', 'This circle has ended.');
    if (role === 'anchor' && !circle.isPrivatePlace) {
      throw new CircleRuleError('ANCHOR_NOT_ALLOWED', 'Anchor is available only at a private place.');
    }
    const updated = await this.circles.changeRole(circleId, userId, role);
    if (!updated) throw new CircleRuleError('CIRCLE_CHANGED', 'Circle changed. Reload and try again.');
    this.events?.publish(updated.id, updated.revision);
    return updated;
  }
}
