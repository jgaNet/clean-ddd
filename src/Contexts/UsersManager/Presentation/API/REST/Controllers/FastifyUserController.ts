import { FastifyReply, FastifyRequest } from 'fastify';
import { CreateUserReqBody } from '@Contexts/UsersManager/Presentation/API/REST/Routes/user';
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
      return operation.toJSON();
    } catch (e) {
      reply.code(400);
      return e;
    }
  }

  async getUsers(_: unknown, reply: FastifyReply) {
    try {
      const users = await this.#queries.find(q => q.name == GetUsersQueryHandler.name)?.handler.execute();
      return users;
    } catch (e) {
      reply.code(400);
      return e;
    }
  }
}
