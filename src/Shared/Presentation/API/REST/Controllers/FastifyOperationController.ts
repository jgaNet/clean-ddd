import { FastifyReply, FastifyRequest } from 'fastify';
import { SharedModuleQueries } from '@Shared/Application/DTOs';
import { GetOperationsHandler } from '@Shared/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Shared/Application/Queries/GetOperation';

export class FastifyOperationController {
  #queries: SharedModuleQueries;

  constructor({ queries: ModuleQueries }: { queries: SharedModuleQueries }) {
    this.#queries = ModuleQueries;
  }

  async getOperations(_: unknown, reply: FastifyReply) {
    try {
      const query = this.#queries.find(q => q.name == GetOperationsHandler.name) as { handler: GetOperationsHandler };
      return query?.handler.execute();
    } catch (e) {
      reply.code(400);
      return e;
    }
  }

  async getOperation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const query = this.#queries.find(q => q.name == GetOperationHandler.name) as { handler: GetOperationHandler };
      const result = await query?.handler.execute({ id: req.params.id });

      if (result.isFailure()) {
        throw result;
      }

      return result;
    } catch (e) {
      reply.code(400);
      return e;
    }
  }
}
