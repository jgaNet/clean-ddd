import { FastifyReply, FastifyRequest } from 'fastify';
import { CreateUserReqBody } from '@Contexts/UsersManager/Presentation/API/REST/Routes/userRoutes';
import { EventBus as CommandEventBus } from '@Primitives/EventBus';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvent';
import { UsersManagerModuleQueries } from '@Contexts/UsersManager/Application/DTOs';
import { GetUsersQueryHandler } from '@Contexts/UsersManager/Application/Queries/GetUsers/GetUsersQueryHandler';

export class FastifyUserController {
  #commandEventBus: CommandEventBus;
  #queries: UsersManagerModuleQueries;

  constructor({
    commandEventBus,
    queries: ModuleQueries,
  }: {
    commandEventBus: CommandEventBus;
    queries: UsersManagerModuleQueries;
  }) {
    this.#commandEventBus = commandEventBus;
    this.#queries = ModuleQueries;
  }

  async createUser(req: FastifyRequest<{ Body: CreateUserReqBody }>, reply: FastifyReply) {
    try {
      const operation = this.#commandEventBus.dispatch(
        new CreateUserCommandEvent({
          profile: {
            email: req.body.email,
            nickname: req.body.nickname,
          },
        }),
      );

      reply.code(202);
      return { currentOperation: operation };
    } catch (e) {
      reply.code(400);
      return e;
    }
  }

  async getUsers(_: unknown, reply: FastifyReply) {
    try {
      const query = this.#queries.find(q => q.name == GetUsersQueryHandler.name) as { handler: GetUsersQueryHandler };
      const result = await query?.handler.execute();

      if (result?.isFailure()) {
        throw result.error;
      }

      return result?.data;
    } catch (e) {
      reply.code(400);
      return e;
    }
  }
}
