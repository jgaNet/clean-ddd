import { FastifyReply, FastifyRequest } from 'fastify';
import { CreateUserReqBody } from '@Contexts/UsersManager/Presentation/API/REST/Routes/user';
import { EventBus as CommandEventBus } from '@Primitives/EventBus';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvents';
import { UsersManagerModuleQueries } from '@Contexts/UsersManager/Application/DTOs';
import { GetUsersQuery } from '@Contexts/UsersManager/Application/Queries/GetUsers/GetUsersQuery';

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
      this.#commandEventBus.dispatch(CreateUserCommandEvent, {
        profile: {
          email: req.body.email,
          nickname: req.body.nickname,
        },
      });

      return true;
    } catch (e) {
      reply.code(400);
      return e;
    }
  }

  async getUsers(_: unknown, reply: FastifyReply) {
    try {
      return await this.#queries.find(q => q.name == GetUsersQuery.name)?.handler.execute();
    } catch (e) {
      reply.code(400);
      return e;
    }
  }
}
