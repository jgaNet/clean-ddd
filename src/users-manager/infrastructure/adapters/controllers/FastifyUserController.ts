import { FastifyReply, FastifyRequest } from 'fastify';
import { CreateUserReqBody } from '@users-manager/presentation/api/http/routes/user';
import { EventBus as CommandEventBus } from '@primitives/EventBus';
import { CreateUserCommandEvent } from '@users-manager/application/commands/CreateUser/CreateUserCommandEvents';
import { IApplicationQueries } from '@users-manager/application/dtos';

export class FastifyUserController {
  #commandEventBus: CommandEventBus;
  #queries: IApplicationQueries;
  constructor({
    commandEventBus,
    queries: IApplicationQueries,
  }: {
    commandEventBus: CommandEventBus;
    queries: IApplicationQueries;
  }) {
    this.#commandEventBus = commandEventBus;
    this.#queries = IApplicationQueries;
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
      return this.#queries.getUsers.execute();
    } catch (e) {
      reply.code(400);
      return e;
    }
  }
}
