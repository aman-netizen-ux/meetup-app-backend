import { CircleRuleError } from '../../circles/domain/circle_rule_error.js';
import type { CircleEventPublisher } from '../../circles/domain/ports/circle_event_publisher.js';
import type { RouteOption } from '../domain/entities/route_option.js';
import type { JourneyRouteRepository } from '../domain/ports/journey_route_repository.js';

export class SelectRoute {
  constructor(
    private readonly routes: JourneyRouteRepository,
    private readonly events?: CircleEventPublisher,
  ) {}

  async execute(circleId: string, userId: string, optionId: string): Promise<RouteOption> {
    const selected = await this.routes.selectOption(circleId, userId, optionId);
    if (!selected) {
      throw new CircleRuleError('ROUTE_OPTION_EXPIRED', 'Refresh route suggestions and choose again.');
    }
    this.events?.publish(circleId, selected.circleRevision);
    return selected.option;
  }
}
