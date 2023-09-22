import { FastifyInstance } from 'fastify';
import { Config } from 'application.config';

export const GetHomeResSchema = {
  200: {
    description: 'Success',
    type: 'object',
    properties: {
      version: { type: 'string' },
      message: { type: 'string' },
    },
  },
} as const;

export const homeRoutes = function (fastify: FastifyInstance, _: unknown, done: Function) {
  fastify.get(
    '/',
    {
      schema: {
        response: GetHomeResSchema,
      },
    },
    req => {
      const username: string = (req as any).session.user.name;
      return { version: Config.version, message: `Hello ${username}` };
    },
  );

  done();
};
