import { CircleRuleError } from '../../circles/domain/circle_rule_error.js';
import type { PrivateJourney } from '../domain/entities/private_journey.js';
import type { JourneyProgressRepository } from '../domain/ports/journey_progress_repository.js';

export class ViewPrivateJourney {
  constructor(private readonly progress: JourneyProgressRepository) {}

  async execute(circleId: string, userId: string): Promise<PrivateJourney> {
    const journey = await this.progress.findPrivate(circleId, userId);
    if (!journey) throw new CircleRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    return journey;
  }
}
