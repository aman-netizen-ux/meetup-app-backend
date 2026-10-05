import type { CircleRepository } from '../domain/ports/circle_repository.js';
import type { CircleSummary } from '../domain/entities/circle_summary.js';

export class ListCircles {
  constructor(private readonly circles: CircleRepository) {}
  execute(userId: string): Promise<CircleSummary[]> {
    return this.circles.listForUser(userId);
  }
}
