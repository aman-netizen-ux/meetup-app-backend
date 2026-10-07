import { CircleRuleError } from '../../circles/domain/circle_rule_error.js';
import type { CircleRepository } from '../../circles/domain/ports/circle_repository.js';
import type { RouteOption } from '../domain/entities/route_option.js';
import type { JourneyRouteRepository } from '../domain/ports/journey_route_repository.js';

export class ViewSelectedRoute {
  constructor(
    private readonly circles: CircleRepository,
    private readonly routes: JourneyRouteRepository,
  ) {}

  async execute(circleId: string, userId: string): Promise<RouteOption | null> {
    if (!await this.circles.findForUser(circleId, userId)) {
      throw new CircleRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    }
    return this.routes.findSelected(circleId, userId);
  }
}
