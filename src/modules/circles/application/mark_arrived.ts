import type { CircleDetails } from '../domain/entities/circle_details.js';
import { CircleRuleError } from '../domain/circle_rule_error.js';
import type { CircleEventPublisher } from '../domain/ports/circle_event_publisher.js';
import type { CircleRepository } from '../domain/ports/circle_repository.js';
import type { DispatchCircleNotifications } from '../../notifications/application/dispatch_circle_notifications.js';

export class MarkArrived {
  constructor(
    private readonly circles: CircleRepository,
    private readonly events?: CircleEventPublisher,
    private readonly notifications?: DispatchCircleNotifications,
  ) {}

  async execute(circleId: string, userId: string): Promise<CircleDetails> {
    const before = this.notifications ? await this.circles.findForUser(circleId, userId) : null;
    const updated = await this.circles.markArrived(circleId, userId);
    if (!updated) throw new CircleRuleError('ARRIVAL_NOT_ALLOWED', 'Arrival is not available for this membership.');
    this.events?.publish(updated.id, updated.revision);
    if (before) void this.notifications?.execute(before, updated);
    return updated;
  }
}
