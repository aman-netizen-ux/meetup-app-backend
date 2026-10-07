import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { healthRoutes } from '../modules/health/presentation/health_routes.js';
import { registerAuthRoutes, type AuthRouteActions } from '../modules/auth/presentation/auth_routes.js';
import { registerCircleRoutes, type CircleRouteActions } from '../modules/circles/presentation/circle_routes.js';
import { registerPlacesRoutes } from '../modules/places/presentation/places_routes.js';
import type { SearchPlaces } from '../modules/places/application/search_places.js';
import { registerInvitationRoutes, type InvitationRouteActions } from '../modules/invitations/presentation/invitation_routes.js';
import { registerContactRoutes, type ContactRouteActions } from '../modules/contacts/presentation/contact_routes.js';

/** Composition root for HTTP modules. Infrastructure is injected here later. */
export function createApp(authActions?: AuthRouteActions, circleActions?: CircleRouteActions, placeSearch?: SearchPlaces | null, invitationActions?: InvitationRouteActions, contactActions?: ContactRouteActions): FastifyInstance {
  const app = Fastify({
    logger: true,
    logController: new LogController({ disableRequestLogging: true }),
  });
  app.addHook('onResponse', async (request, reply) => {
    request.log.info({
      method: request.method,
      route: request.routeOptions.url,
      statusCode: reply.statusCode,
    }, 'request completed');
  });
  app.addHook('onError', async (request, _reply, error) => {
    request.log.error({
      err: error,
      method: request.method,
      route: request.routeOptions.url,
    }, 'request failed');
  });
  app.register(healthRoutes);
  if (authActions) registerAuthRoutes(app, authActions);
  if (circleActions) registerCircleRoutes(app, circleActions);
  if (authActions) registerPlacesRoutes(app, authActions.authenticate, placeSearch ?? null);
  if (invitationActions) registerInvitationRoutes(app, invitationActions);
  if (contactActions) registerContactRoutes(app, contactActions);
  return app;
}
