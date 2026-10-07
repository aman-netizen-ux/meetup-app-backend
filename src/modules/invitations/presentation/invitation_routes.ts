import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticateUser } from '../../auth/application/authenticate_user.js';
import type { AppUser } from '../../auth/domain/entities/app_user.js';
import type { TravelRole } from '../../circles/domain/entities/travel_role.js';
import { circleJson } from '../../circles/presentation/circle_json.js';
import type { AcceptInvitation } from '../application/accept_invitation.js';
import type { CreateInvitationLink } from '../application/create_invitation_link.js';
import type { PreviewInvitation } from '../application/preview_invitation.js';
import { InvitationRuleError } from '../domain/invitation_rule_error.js';
import { invitationPreviewJson } from './invitation_json.js';

export interface InvitationRouteActions {
  authenticate: AuthenticateUser;
  createLink: CreateInvitationLink;
  preview: PreviewInvitation;
  accept: AcceptInvitation;
}

function validToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(token);
}

function validCircleId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function statusFor(error: InvitationRuleError): number {
  if (error.code === 'FORBIDDEN') return 403;
  if (error.code === 'INVITATION_NOT_FOUND' || error.code === 'CIRCLE_NOT_FOUND') return 404;
  if (error.code === 'INVITATION_EXPIRED') return 410;
  if (error.code === 'CIRCLE_ENDED' || error.code === 'INVITATION_UNAVAILABLE') return 409;
  return 422;
}

export function registerInvitationRoutes(app: FastifyInstance, actions: InvitationRouteActions): void {
  async function currentUser(request: FastifyRequest, reply: FastifyReply): Promise<AppUser | null> {
    const user = await actions.authenticate.execute(request.headers.authorization);
    if (!user) reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } });
    return user;
  }

  async function handle(reply: FastifyReply, work: () => Promise<unknown>): Promise<unknown> {
    try { return await work(); }
    catch (error) {
      if (error instanceof InvitationRuleError) {
        return reply.code(statusFor(error)).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  }

  app.post<{ Params: { id: string } }>('/v1/circles/:id/invite-links', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    if (!validCircleId(request.params.id)) {
      return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
    }
    return handle(reply, async () => {
      const link = await actions.createLink.execute(request.params.id, user.id);
      return reply.code(201).send({ url: link.url, expiresAt: link.expiresAt.toISOString() });
    });
  });

  app.get<{ Params: { token: string } }>('/v1/invitations/:token/preview', async (request, reply) => {
    if (!validToken(request.params.token)) {
      return reply.code(404).send({ error: { code: 'INVITATION_NOT_FOUND', message: 'This invitation is not available.' } });
    }
    return handle(reply, async () => invitationPreviewJson(await actions.preview.execute(request.params.token)));
  });

  app.post<{ Params: { token: string } }>('/v1/invitations/:token/accept', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    if (!validToken(request.params.token)) {
      return reply.code(404).send({ error: { code: 'INVITATION_NOT_FOUND', message: 'This invitation is not available.' } });
    }
    const role = (request.body as { travelRole?: unknown } | null)?.travelRole;
    if (role !== 'mover' && role !== 'anchor') {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Choose a valid role.' } });
    }
    return handle(reply, async () => circleJson(await actions.accept.execute(request.params.token, user.id, role as TravelRole)));
  });
}
