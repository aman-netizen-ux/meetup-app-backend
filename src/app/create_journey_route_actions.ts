import type { AuthRouteActions } from '../modules/auth/presentation/auth_routes.js';
import { SelectRoute } from '../modules/journeys/application/select_route.js';
import { SuggestRoutes } from '../modules/journeys/application/suggest_routes.js';
import { ViewSelectedRoute } from '../modules/journeys/application/view_selected_route.js';
import { GeoapifyRoutingProvider } from '../modules/journeys/infrastructure/geoapify_routing_provider.js';
import { PgJourneyRouteRepository } from '../modules/journeys/infrastructure/pg_journey_route_repository.js';
import type { JourneyRouteActions } from '../modules/journeys/presentation/journey_route_routes.js';
import { PgCircleRepository } from '../modules/circles/infrastructure/pg_circle_repository.js';
import type { CircleEventPublisher } from '../modules/circles/domain/ports/circle_event_publisher.js';
import type { PgPoolProvider } from '../shared/infrastructure/database/pg_pool.js';

export function createJourneyRouteActions(
  poolProvider: PgPoolProvider,
  auth: AuthRouteActions,
  events: CircleEventPublisher,
  geoapifyApiKey: string,
): JourneyRouteActions {
  const pool = poolProvider.getPool();
  const circles = new PgCircleRepository(pool);
  const routes = new PgJourneyRouteRepository(pool);
  return {
    authenticate: auth.authenticate,
    suggest: new SuggestRoutes(circles, routes, new GeoapifyRoutingProvider(geoapifyApiKey)),
    select: new SelectRoute(routes, events),
    viewSelected: new ViewSelectedRoute(circles, routes),
  };
}
