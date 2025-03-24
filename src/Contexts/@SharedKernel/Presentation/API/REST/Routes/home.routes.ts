import { FastifyInstance } from 'fastify';

export const GetHomeResSchema = {
  200: {
    description: 'Success',
    type: 'object',
    properties: {
      version: { type: 'string' },
    },
  },
} as const;

export const homeRoutes = function (
  fastify: FastifyInstance,
  { settings }: { settings: { version: string } },
  done: () => void,
) {
  fastify.get(
    '/',
    {
      schema: {
        response: GetHomeResSchema,
      },
    },
    _ => {
      return { version: settings.version };
    },
  );

  fastify.get('/health', _ => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  done();
};
