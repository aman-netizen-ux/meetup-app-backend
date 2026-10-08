import type { CircleEventPublisher } from '../domain/ports/circle_event_publisher.js';
import type { CircleRepository } from '../domain/ports/circle_repository.js';

export class AdvanceCircleLifecycle {
  constructor(private readonly circles: CircleRepository, private readonly events: CircleEventPublisher) {}

  async execute(now = new Date()): Promise<void> {
    for (const circle of await this.circles.advanceLifecycle(now)) {
      this.events.publish(circle.id, circle.revision);
    }
  }
}
