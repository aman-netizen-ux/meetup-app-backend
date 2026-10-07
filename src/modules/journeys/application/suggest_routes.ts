import type { CircleRepository } from '../../circles/domain/ports/circle_repository.js';
import { CircleRuleError } from '../../circles/domain/circle_rule_error.js';
import type { RouteOption } from '../domain/entities/route_option.js';
import type { JourneyRouteRepository } from '../domain/ports/journey_route_repository.js';
import type { RoutingProvider } from '../domain/ports/routing_provider.js';

export class SuggestRoutes {
  constructor(
    private readonly circles: CircleRepository,
    private readonly routes: JourneyRouteRepository,
    private readonly provider: RoutingProvider,
  ) {}

  async execute(circleId: string, userId: string): Promise<RouteOption[]> {
    const circle = await this.circles.findForUser(circleId, userId);
    if (!circle) throw new CircleRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    const member = circle.members.find((item) => item.userId === userId);
    if (circle.state !== 'active' || member?.travelRole !== 'mover' ||
        member.setupStatus !== 'ready' || !member.pin || member.arrivedAt) {
      throw new CircleRuleError('ROUTES_NOT_AVAILABLE', 'Start sharing before choosing a route.');
    }
    const candidates = await this.provider.suggest(member.pin, circle.destination);
    return this.routes.replaceOptions(
      circleId,
      userId,
      candidates,
      new Date(Date.now() + 15 * 60_000),
    );
  }
}
