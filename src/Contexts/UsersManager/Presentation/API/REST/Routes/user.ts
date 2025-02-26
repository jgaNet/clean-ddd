import { FastifyInstance } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';

import { FastifyUserController } from '@Contexts/UsersManager/Presentation/API/REST/Controllers/FastifyUserController';
import { UsersManagerModule } from '@Contexts/UsersManager/Application';

import { OperationStatus } from '@Shared/Domain/Operation';

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
  202: {
    description: 'Accepted',
    type: 'object',
    properties: {
      operationId: { type: 'string' },
      status: { type: 'string', enum: Object.values(OperationStatus) },
      createdAt: { type: 'string' },
      finishedAt: { type: 'string' },
    },
  },
} as const;

export const GetUsersResSchema = {
  200: {
    description: 'Success',
    type: 'object',
    properties: {
      data: {
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
      error: { type: 'string' },
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
