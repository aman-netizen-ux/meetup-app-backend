import type { FastifyPluginAsync } from 'fastify';

/** HTTP adapter; it contains no database or business logic. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'meetup-app-backend',
  }));
};
