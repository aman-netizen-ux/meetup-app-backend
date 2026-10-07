import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticateUser } from '../../auth/application/authenticate_user.js';
import type { AppUser } from '../../auth/domain/entities/app_user.js';
import { circleJson } from '../../circles/presentation/circle_json.js';
import type { AddContactMember } from '../application/add_contact_member.js';
import type { MatchContacts } from '../application/match_contacts.js';
import type { ContactCandidate } from '../domain/entities/contact_candidate.js';
import { ContactRuleError } from '../domain/contact_rule_error.js';

export interface ContactRouteActions {
  authenticate: AuthenticateUser;
  match: MatchContacts;
  addMember: AddContactMember;
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function candidatesFrom(body: unknown): ContactCandidate[] | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const contacts = (body as { contacts?: unknown }).contacts;
  if (!Array.isArray(contacts)) return null;
  const candidates: ContactCandidate[] = [];
  for (const contact of contacts) {
    if (!contact || typeof contact !== 'object' || Array.isArray(contact)) return null;
    const value = contact as Record<string, unknown>;
    if (Object.keys(value).some((key) => key !== 'localId' && key !== 'phoneE164') ||
        typeof value.localId !== 'string' || value.localId.length < 1 || value.localId.length > 64 ||
        typeof value.phoneE164 !== 'string' || !/^\+[1-9][0-9]{6,14}$/.test(value.phoneE164)) {
      return null;
    }
    candidates.push({ localId: value.localId, phoneE164: value.phoneE164 });
  }
  return candidates;
}

function statusFor(error: ContactRuleError): number {
  if (error.code === 'FORBIDDEN') return 403;
  if (error.code === 'CIRCLE_NOT_FOUND') return 404;
  if (error.code === 'CIRCLE_ENDED' || error.code === 'CONTACT_MATCH_EXPIRED') return 409;
  return 422;
}

export function registerContactRoutes(app: FastifyInstance, actions: ContactRouteActions): void {
  async function currentUser(request: FastifyRequest, reply: FastifyReply): Promise<AppUser | null> {
    const user = await actions.authenticate.execute(request.headers.authorization);
    if (!user) reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } });
    return user;
  }

  async function handle(reply: FastifyReply, work: () => Promise<unknown>): Promise<unknown> {
    try { return await work(); }
    catch (error) {
      if (error instanceof ContactRuleError) {
        return reply.code(statusFor(error)).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  }

  app.post<{ Params: { id: string } }>('/v1/circles/:id/contacts/match', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    if (!validUuid(request.params.id)) {
      return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
    }
    const candidates = candidatesFrom(request.body);
    if (!candidates) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Valid contacts are required.' } });
    }
    return handle(reply, async () => ({
      items: await actions.match.execute(request.params.id, user.id, candidates),
    }));
  });

  app.post<{ Params: { id: string } }>('/v1/circles/:id/contact-members', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    if (!validUuid(request.params.id)) {
      return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
    }
    const body = request.body as { matchId?: unknown } | null;
    if (typeof body?.matchId !== 'string' || !validUuid(body.matchId)) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'A valid contact match is required.' } });
    }
    return handle(reply, async () => circleJson(await actions.addMember.execute(
      request.params.id, user.id, body.matchId as string,
    )));
  });
}
