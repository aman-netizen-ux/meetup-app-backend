import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppUser } from '../domain/entities/app_user.js';
import type { AuthenticateUser } from '../application/authenticate_user.js';
import type { RegisterDeviceToken } from '../application/register_device_token.js';
import type { UpdateProfile } from '../application/update_profile.js';

export interface AuthRouteActions {
  authenticate: AuthenticateUser;
  updateProfile: UpdateProfile;
  registerDeviceToken: RegisterDeviceToken;
}

export function registerAuthRoutes(app: FastifyInstance, actions: AuthRouteActions): void {
  async function currentUser(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AppUser | null> {
    const user = await actions.authenticate.execute(request.headers.authorization);
    if (!user) reply.code(401).send({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } });
    return user;
  }

  app.get('/v1/me', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    return { user };
  });

  app.patch('/v1/me', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    const body = request.body as { displayName?: unknown } | null;
    if (typeof body?.displayName !== 'string') {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Display name is required.' } });
    }
    try {
      return { user: await actions.updateProfile.execute(user.id, body.displayName) };
    } catch (error) {
      if (error instanceof RangeError) {
        return reply.code(422).send({ error: { code: 'INVALID_DISPLAY_NAME', message: error.message } });
      }
      throw error;
    }
  });

  app.post('/v1/me/device-tokens', async (request, reply) => {
    const user = await currentUser(request, reply);
    if (!user) return reply;
    const body = request.body as { platform?: unknown; token?: unknown } | null;
    if ((body?.platform !== 'android' && body?.platform !== 'ios') || typeof body.token !== 'string') {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'A platform and token are required.' } });
    }
    try {
      await actions.registerDeviceToken.execute(user.id, body.platform, body.token);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof RangeError) {
        return reply.code(422).send({ error: { code: 'INVALID_DEVICE_TOKEN', message: error.message } });
      }
      throw error;
    }
  });
}
