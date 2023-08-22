import { FastifyInstance } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';

import { userController } from '@core/presentation/controllers/userController.js';

export const CreateUserReqBodySchema = {
  type: 'object',
  properties: {
    email: { type: 'string' },
    nickname: { type: 'string' },
  },
  required: ['email'],
} as const;

export const CreateUserResSchema = {
  400: {
    description: 'Input Error',
    type: 'object',
    properties: {
      message: { type: 'string' },
    },
  },
  200: {
    description: 'Success',
    type: 'boolean',
  },
} as const;

// @ts-ignore  NOTE:: Why I need of this to remove default in CreateUserResSchema?
export type CreateUserRes = FromSchema<typeof CreateUserResSchema>;
export type CreateUserReqBody = FromSchema<typeof CreateUserReqBodySchema>;

export const userRoutes = function (fastify: FastifyInstance, _: unknown, done: Function) {
  fastify.post<{ Body: CreateUserReqBody }>(
    '/',
    {
      schema: {
        body: CreateUserReqBodySchema,
        response: CreateUserResSchema,
      },
    },
    userController.createUser,
  );
  done();
};
