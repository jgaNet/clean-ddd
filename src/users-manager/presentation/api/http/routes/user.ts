import { FastifyInstance } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';

import { FastifyUserController } from '@users-manager/infrastructure/adapters/controllers/FastifyUserController';
import { UsersManagerModule } from '@users-manager/application';

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

export const GetUsersResSchema = {
  200: {
    description: 'Success',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        _id: { type: 'string' },
        profile: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            nickname: { type: 'string' },
          },
          required: ['email', 'nickname'],
        },
      },
    },
  },
} as const;

// eslint-disable-next-line
// @ts-ignore  NOTE:: Why I need of this to remove default in CreateUserResSchema?
export type CreateUserRes = FromSchema<typeof CreateUserResSchema>;
export type CreateUserReqBody = FromSchema<typeof CreateUserReqBodySchema>;

export const userRoutes = function (
  fastify: FastifyInstance,
  { usersManagementModule }: { usersManagementModule: UsersManagerModule },
  done: () => void,
) {
  const userController = new FastifyUserController({
    commandEventBus: usersManagementModule.eventBus,
    queries: usersManagementModule.queries,
  });

  fastify.post<{ Body: CreateUserReqBody }>(
    '/',
    {
      schema: {
        body: CreateUserReqBodySchema,
        response: CreateUserResSchema,
      },
    },
    userController.createUser.bind(userController),
  );

  fastify.get(
    '/',
    {
      schema: {
        response: GetUsersResSchema,
      },
    },
    userController.getUsers.bind(userController),
  );

  done();
};
