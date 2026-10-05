import type { CircleRepository } from '../domain/ports/circle_repository.js';
import type { CircleDetails } from '../domain/entities/circle_details.js';

export class ViewCircle {
  constructor(private readonly circles: CircleRepository) {}
  execute(circleId: string, userId: string): Promise<CircleDetails | null> {
    return this.circles.findForUser(circleId, userId);
  }
}
