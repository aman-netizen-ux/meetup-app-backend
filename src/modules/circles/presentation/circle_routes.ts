import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticateUser } from '../../auth/application/authenticate_user.js';
import type { AppUser } from '../../auth/domain/entities/app_user.js';
import type { CreateCircle } from '../application/create_circle.js';
import type { EndCircle } from '../application/end_circle.js';
import type { ListCircles } from '../application/list_circles.js';
import type { UpdateCircle } from '../application/update_circle.js';
import type { ViewCircle } from '../application/view_circle.js';
import type { ChangeMemberRole } from '../application/change_member_role.js';
import type { WaitForCircleChange } from '../application/wait_for_circle_change.js';
import type { StartLocationSharing } from '../application/start_location_sharing.js';
import type { IngestLocation } from '../application/ingest_location.js';
import type { MarkArrived } from '../application/mark_arrived.js';
import type { LocationUpdate } from '../domain/entities/location_update.js';
import type { CreateCircleCommand, UpdateCircleCommand } from '../application/circle_commands.js';
import { CircleRuleError } from '../domain/circle_rule_error.js';
import { circleJson } from './circle_json.js';

export interface CircleRouteActions {
  authenticate: AuthenticateUser;
  create: CreateCircle;
  list: ListCircles;
  view: ViewCircle;
  update: UpdateCircle;
  end: EndCircle;
  changeRole: ChangeMemberRole;
  waitForChange?: WaitForCircleChange;
  startLocationSharing?: StartLocationSharing;
  ingestLocation?: IngestLocation;
  markArrived?: MarkArrived;
}

function invalidInput(): never {
  throw new CircleRuleError('INVALID_INPUT', 'Check the circle details and try again.');
}

function createInput(body: unknown): CreateCircleCommand {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalidInput();
  const value = body as Record<string, unknown>;
  const destination = value.destination;
  if (!destination || typeof destination !== 'object' || Array.isArray(destination)) invalidInput();
  const place = destination as Record<string, unknown>;
  if (typeof place.label !== 'string' || typeof place.latitude !== 'number' ||
      typeof place.longitude !== 'number' ||
      (place.placeId !== undefined && place.placeId !== null && typeof place.placeId !== 'string') ||
      typeof value.isPrivatePlace !== 'boolean' ||
      (value.meetupDate !== undefined && value.meetupDate !== null && typeof value.meetupDate !== 'string') ||
      (value.meetupTime !== undefined && value.meetupTime !== null && typeof value.meetupTime !== 'string') ||
      (value.timeZone !== undefined && typeof value.timeZone !== 'string')) invalidInput();
  return {
    destination: {
      label: place.label as string, latitude: place.latitude as number,
      longitude: place.longitude as number, placeId: (place.placeId as string | null) ?? null,
    },
    isPrivatePlace: value.isPrivatePlace as boolean,
    meetupDate: (value.meetupDate as string | null) ?? null,
    meetupTime: (value.meetupTime as string | null) ?? null,
    timeZone: value.timeZone as string | undefined,
  };
}

function updateInput(body: unknown): UpdateCircleCommand {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalidInput();
  const value = body as Record<string, unknown>;
  const allowed = ['meetupDate', 'meetupTime', 'isPrivatePlace'];
  if (Object.keys(value).length === 0 || Object.keys(value).some((key) => !allowed.includes(key)) ||
      (value.meetupDate !== undefined && value.meetupDate !== null && typeof value.meetupDate !== 'string') ||
      (value.meetupTime !== undefined && value.meetupTime !== null && typeof value.meetupTime !== 'string') ||
      (value.isPrivatePlace !== undefined && typeof value.isPrivatePlace !== 'boolean')) invalidInput();
  return value as UpdateCircleCommand;
}

function statusFor(error: CircleRuleError): number {
  if (error.code === 'INVALID_INPUT') return 400;
  if (error.code === 'FORBIDDEN') return 403;
  if (error.code === 'CIRCLE_NOT_FOUND') return 404;
  if (['CIRCLE_CHANGED', 'CIRCLE_ENDED', 'DATE_LOCKED', 'PRIVATE_PLACE_LOCKED'].includes(error.code)) return 409;
  return 422;
}

function validCircleId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function locationInput(body: unknown): { consentGranted: boolean; location: LocationUpdate } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalidInput();
  const value = body as Record<string, unknown>;
  const capturedAt = typeof value.capturedAt === 'string' ? new Date(value.capturedAt) : null;
  if (typeof value.consentGranted !== 'boolean' ||
      typeof value.latitude !== 'number' || typeof value.longitude !== 'number' ||
      typeof value.accuracyMeters !== 'number' || !capturedAt) invalidInput();
  return {
    consentGranted: value.consentGranted,
    location: {
      latitude: value.latitude as number,
      longitude: value.longitude as number,
      accuracyMeters: value.accuracyMeters as number,
      capturedAt,
    },
  };
}

export function registerCircleRoutes(app: FastifyInstance, actions: CircleRouteActions): void {
  async function currentUser(request: FastifyRequest, reply: FastifyReply): Promise<AppUser | null> {
    const user = await actions.authenticate.execute(request.headers.authorization);
    if (!user) reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } });
    return user;
  }

  async function handle(reply: FastifyReply, work: () => Promise<unknown>): Promise<unknown> {
    try { return await work(); }
    catch (error) {
      if (error instanceof CircleRuleError) {
        return reply.code(statusFor(error)).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  }

  app.get('/v1/circles', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    return { items: await actions.list.execute(user.id) };
  });

  app.post('/v1/circles', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    return handle(reply, async () => reply.code(201).send(circleJson(await actions.create.execute(user.id, createInput(request.body)))));
  });

  app.get<{ Params: { id: string } }>('/v1/circles/:id', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    if (!validCircleId(request.params.id)) {
      return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
    }
    const circle = await actions.view.execute(request.params.id, user.id);
    return circle ? circleJson(circle) : reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
  });

  if (actions.waitForChange) {
    app.get<{ Params: { id: string }; Querystring: { afterRevision?: string } }>(
      '/v1/circles/:id/events',
      async (request, reply) => {
        const user = await currentUser(request, reply);
        if (!user) return reply;
        if (!validCircleId(request.params.id)) {
          return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
        }
        const rawRevision = request.query.afterRevision;
        const afterRevision = rawRevision === undefined ? -1 : Number(rawRevision);
        if (!Number.isSafeInteger(afterRevision) || afterRevision < -1) {
          return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'A valid revision is required.' } });
        }
        return handle(reply, async () => {
          const circle = await actions.waitForChange!.execute(
            request.params.id,
            user.id,
            afterRevision,
          );
          return circle ? circleJson(circle) : reply.code(204).send();
        });
      },
    );
  }

  app.patch<{ Params: { id: string } }>('/v1/circles/:id', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    if (!validCircleId(request.params.id)) return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
    return handle(reply, async () => circleJson(await actions.update.execute(request.params.id, user.id, updateInput(request.body))));
  });

  app.post<{ Params: { id: string } }>('/v1/circles/:id/end', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    if (!validCircleId(request.params.id)) return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
    return handle(reply, async () => {
      const body = request.body as { reason?: unknown } | null;
      if (body?.reason !== 'organizer_ended' && body?.reason !== 'cancelled') invalidInput();
      return circleJson(await actions.end.execute(request.params.id, user.id, body.reason));
    });
  });

  app.patch<{ Params: { id: string } }>('/v1/circles/:id/me/role', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    if (!validCircleId(request.params.id)) {
      return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
    }
    const role = (request.body as { travelRole?: unknown } | null)?.travelRole;
    if (role !== 'mover' && role !== 'anchor') {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Choose a valid role.' } });
    }
    return handle(reply, async () => circleJson(await actions.changeRole.execute(request.params.id, user.id, role)));
  });

  if (actions.startLocationSharing) {
    app.post<{ Params: { id: string } }>('/v1/circles/:id/me/sharing/start', async (request, reply) => {
      const user = await currentUser(request, reply);
      if (!user) return reply;
      if (!validCircleId(request.params.id)) {
        return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
      }
      return handle(reply, async () => {
        const value = request.body as Record<string, unknown> | null;
        const trigger = value?.trigger;
        if (trigger !== 'departure' && trigger !== 'manual') invalidInput();
        const input = locationInput(request.body);
        return circleJson(await actions.startLocationSharing!.execute(
          request.params.id, user.id, trigger, input.consentGranted, input.location,
        ));
      });
    });
  }

  if (actions.ingestLocation) {
    app.post<{ Params: { id: string } }>('/v1/circles/:id/me/locations', async (request, reply) => {
      const user = await currentUser(request, reply);
      if (!user) return reply;
      if (!validCircleId(request.params.id)) {
        return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
      }
      return handle(reply, async () => {
        const input = locationInput(request.body);
        return circleJson(await actions.ingestLocation!.execute(
          request.params.id, user.id, input.consentGranted, input.location,
        ));
      });
    });
  }

  if (actions.markArrived) {
    app.post<{ Params: { id: string } }>('/v1/circles/:id/me/arrival', async (request, reply) => {
      const user = await currentUser(request, reply);
      if (!user) return reply;
      if (!validCircleId(request.params.id)) {
        return reply.code(404).send({ error: { code: 'CIRCLE_NOT_FOUND', message: 'Circle not found.' } });
      }
      return handle(reply, async () => circleJson(await actions.markArrived!.execute(request.params.id, user.id)));
    });
  }
}
