import { FastifyReply, FastifyRequest } from 'fastify';
import { CreateUserReqBody } from '@users-manager/presentation/api/http/routes/user';
import { EventBus as CommandEventBus } from '@primitives/EventBus';
import { CreateUserCommandEvent } from '@users-manager/application/commands/CreateUser/CreateUserCommandEvents';
import { ModuleQueries } from '@users-manager/application/dtos';

export class FastifyUserController {
  #commandEventBus: CommandEventBus;
  #queries: ModuleQueries;

  constructor({
    commandEventBus,
    queries: ModuleQueries,
  }: {
    commandEventBus: CommandEventBus;
    queries: ModuleQueries;
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
      return this.#queries.find(q => q.name == 'getUsers')?.handler.execute();
    } catch (e) {
      reply.code(400);
      return e;
    }
  }
}
