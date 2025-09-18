import { FastifyInstance } from 'fastify';
import { HomeController } from '../Controllers/HomeController';

export const GetHomeResSchema = {
  200: {
    description: 'Success',
    type: 'object',
    properties: {
      version: { type: 'string' },
      name: { type: 'string' },
    },
  },
} as const;

export const homeRoutes = function (
  fastify: FastifyInstance,
  { settings }: { settings: { version: string; name: string } },
  done: () => void,
) {
  const homeController = new HomeController({ settings });

  fastify.get(
    '/',
    {
      schema: {
        response: GetHomeResSchema,
      },
    },
    homeController.getApiHome.bind(homeController),
  );

  fastify.get('/health', _ => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  done();
};
