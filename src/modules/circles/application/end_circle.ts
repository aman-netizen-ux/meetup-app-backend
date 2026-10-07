import { CircleRuleError } from '../domain/circle_rule_error.js';
import type { CircleRepository } from '../domain/ports/circle_repository.js';
import type { CircleDetails } from '../domain/entities/circle_details.js';
import type { CircleEventPublisher } from '../domain/ports/circle_event_publisher.js';

export class EndCircle {
  constructor(
    private readonly circles: CircleRepository,
    private readonly events?: CircleEventPublisher,
  ) {}

  async execute(circleId: string, userId: string, reason: 'organizer_ended' | 'cancelled'): Promise<CircleDetails> {
    const existing = await this.circles.findForUser(circleId, userId);
    if (!existing) throw new CircleRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    if (existing.organizerId !== userId) throw new CircleRuleError('FORBIDDEN', 'Only the organizer can end this circle.');
    const ended = await this.circles.end(circleId, userId, reason);
    if (!ended) throw new CircleRuleError('CIRCLE_CHANGED', 'Circle changed while ending. Reload and try again.');
    this.events?.publish(ended.id, ended.revision);
    return ended;
  }
}
