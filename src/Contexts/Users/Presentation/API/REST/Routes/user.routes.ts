import { FastifyInstance } from 'fastify';

import { FastifyUserController } from '@Contexts/Users/Presentation/API/REST/Controllers/FastifyUserController';
import { UsersModule } from '@Contexts/Users/Application';

import {
  GetUsersResSchema,
  CreateUserReqBody,
  CreateUserResSchema,
  CreateUserReqBodySchema,
} from '@Contexts/Users/Presentation/API/REST/Routes/user.routes.schema';

export const userRoutes = function (
  fastify: FastifyInstance,
  { usersModule }: { usersModule: UsersModule },
  done: () => void,
) {
  const userController = new FastifyUserController({
    queries: usersModule.queries,
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
