import type { CircleDetails } from '../domain/entities/circle_details.js';
import { CircleRuleError } from '../domain/circle_rule_error.js';
import type { CircleEventWaiter } from '../domain/ports/circle_event_waiter.js';
import type { CircleRepository } from '../domain/ports/circle_repository.js';

export class WaitForCircleChange {
  constructor(
    private readonly circles: CircleRepository,
    private readonly events: CircleEventWaiter,
  ) {}

  async execute(
    circleId: string,
    userId: string,
    afterRevision: number,
  ): Promise<CircleDetails | null> {
    const current = await this.circles.findForUser(circleId, userId);
    if (!current) throw new CircleRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    if (current.revision > afterRevision) return current;
    const changed = await this.events.waitForRevision(circleId, afterRevision, 25_000);
    if (!changed) return null;
    const updated = await this.circles.findForUser(circleId, userId);
    if (!updated) throw new CircleRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    return updated.revision > afterRevision ? updated : null;
  }
}
