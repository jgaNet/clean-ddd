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

export const homeRoutes = function (fastify: FastifyInstance, _: unknown, done: Function) {
  fastify.get(
    '/',
    {
      schema: {
        response: GetHomeResSchema,
      },
    },
    (_, reply) => {
      reply.send({ vervion: '0.0.1' });
    },
  );

  done();
};
