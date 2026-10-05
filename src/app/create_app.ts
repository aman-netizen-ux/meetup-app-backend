import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from '../modules/health/presentation/health_routes.js';
import { registerAuthRoutes, type AuthRouteActions } from '../modules/auth/presentation/auth_routes.js';
import { registerCircleRoutes, type CircleRouteActions } from '../modules/circles/presentation/circle_routes.js';
import { registerPlacesRoutes } from '../modules/places/presentation/places_routes.js';
import type { SearchPlaces } from '../modules/places/application/search_places.js';

/** Composition root for HTTP modules. Infrastructure is injected here later. */
export function createApp(authActions?: AuthRouteActions, circleActions?: CircleRouteActions, placeSearch?: SearchPlaces | null): FastifyInstance {
  const app = Fastify({ logger: true });
  app.register(healthRoutes);
  if (authActions) registerAuthRoutes(app, authActions);
  if (circleActions) registerCircleRoutes(app, circleActions);
  if (authActions) registerPlacesRoutes(app, authActions.authenticate, placeSearch ?? null);
  return app;
}
