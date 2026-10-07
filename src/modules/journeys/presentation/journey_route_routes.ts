import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticateUser } from '../../auth/application/authenticate_user.js';
import type { AppUser } from '../../auth/domain/entities/app_user.js';
import { CircleRuleError } from '../../circles/domain/circle_rule_error.js';
import type { SelectRoute } from '../application/select_route.js';
import type { SuggestRoutes } from '../application/suggest_routes.js';
import type { ViewSelectedRoute } from '../application/view_selected_route.js';
import { routeOptionJson } from './route_option_json.js';

export interface JourneyRouteActions {
  authenticate: AuthenticateUser;
  suggest: SuggestRoutes;
  select: SelectRoute;
  viewSelected: ViewSelectedRoute;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorStatus(error: CircleRuleError): number {
  if (error.code === 'CIRCLE_NOT_FOUND') return 404;
  if (error.code === 'ROUTE_OPTION_EXPIRED') return 409;
  return 422;
}

export function registerJourneyRouteRoutes(
  app: FastifyInstance,
  actions: JourneyRouteActions,
): void {
  async function currentUser(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AppUser | null> {
    const user = await actions.authenticate.execute(request.headers.authorization);
    if (!user) reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } });
    return user;
  }

  async function handle(reply: FastifyReply, work: () => Promise<unknown>): Promise<unknown> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof CircleRuleError) {
        return reply.code(errorStatus(error)).send({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }
  }

  app.get<{ Params: { id: string } }>(
    '/v1/circles/:id/me/route-options',
    async (request, reply) => {
      const user = await currentUser(request, reply);
      if (!user) return reply;
      if (!uuidPattern.test(request.params.id)) {
        return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
      }
      return handle(reply, async () => ({
        items: (await actions.suggest.execute(request.params.id, user.id)).map(routeOptionJson),
      }));
    },
  );

  app.put<{ Params: { id: string } }>(
    '/v1/circles/:id/me/selected-route',
    async (request, reply) => {
      const user = await currentUser(request, reply);
      if (!user) return reply;
      const optionId = (request.body as { routeOptionId?: unknown } | null)?.routeOptionId;
      if (!uuidPattern.test(request.params.id) || typeof optionId !== 'string' || !uuidPattern.test(optionId)) {
        return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Choose a valid route.' } });
      }
      return handle(reply, async () => routeOptionJson(
        await actions.select.execute(request.params.id, user.id, optionId),
      ));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/v1/circles/:id/me/selected-route',
    async (request, reply) => {
      const user = await currentUser(request, reply);
      if (!user) return reply;
      if (!uuidPattern.test(request.params.id)) {
        return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
      }
      return handle(reply, async () => {
        const option = await actions.viewSelected.execute(request.params.id, user.id);
        return option ? routeOptionJson(option) : reply.code(204).send();
      });
    },
  );
}
