import type { FastifyInstance } from 'fastify';
import type { AuthenticateUser } from '../../auth/application/authenticate_user.js';
import type { SearchPlaces } from '../application/search_places.js';

export function registerPlacesRoutes(
  app: FastifyInstance,
  authenticate: AuthenticateUser,
  search: SearchPlaces | null,
): void {
  app.post<{ Body: { query?: string } }>('/v1/places/search', async (request, reply) => {
    const user = await authenticate.execute(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } });
    if (!search) return reply.code(503).send({ error: { code: 'PLACE_SEARCH_UNAVAILABLE', message: 'Place search is not configured yet.' } });
    if (typeof request.body?.query !== 'string') return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Enter a place to search.' } });
    try {
      return { items: await search.execute(request.body?.query ?? '') };
    } catch {
      request.log.warn('Place search provider failed');
      return reply.code(502).send({ error: { code: 'PLACE_SEARCH_FAILED', message: 'Could not search places. Try again.' } });
    }
  });
}
