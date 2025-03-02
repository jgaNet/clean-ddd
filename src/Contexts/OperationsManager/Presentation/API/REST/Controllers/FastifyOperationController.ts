import { FastifyReply, FastifyRequest } from 'fastify';
import { GetOperationsHandler } from '@Contexts/OperationsManager/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/OperationsManager/Application/Queries/GetOperation';
import { NotFoundException } from '@Primitives/Exception';
import { OperationsManagerModuleQueries } from '@Contexts/OperationsManager/Application/DTOs';

export class FastifyOperationController {
  #queries: OperationsManagerModuleQueries;

  constructor({ queries: ModuleQueries }: { queries: OperationsManagerModuleQueries }) {
    this.#queries = ModuleQueries;
  }

  async getOperations(_: unknown, reply: FastifyReply) {
    try {
      const query = this.#queries.find(q => q.name == GetOperationsHandler.name) as { handler: GetOperationsHandler };
      const result = await query?.handler.execute();

      if (result.isFailure()) {
        throw result.error;
      }

      return result.data;
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
        throw result.error;
      }

      return result.data;
    } catch (e) {
      if (e instanceof NotFoundException) {
        reply.code(404);
        return e;
      }

      reply.code(400);
      return e;
    }
  }
}
