import { FastifyReply, FastifyRequest } from 'fastify';
import { GetOperationsHandler } from '@Contexts/Tracker/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/Tracker/Application/Queries/GetOperation';
import { NotFoundException } from '@SharedKernel/Domain/Application';
import { TrackerModuleQueries } from '@Contexts/Tracker/Application/DTOs';

export class FastifyOperationController {
  #queries: TrackerModuleQueries;

  constructor({ queries: ModuleQueries }: { queries: TrackerModuleQueries }) {
    this.#queries = ModuleQueries;
  }

  async getOperations(req: FastifyRequest<{ Querystring: { traceId?: string } }>, reply: FastifyReply) {
    try {
      const query = this.#queries.find(q => q.name == GetOperationsHandler.name) as { handler: GetOperationsHandler };
      const result = await query?.handler.executeWithContext(req.query, req.executionContext);

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
      const result = await query?.handler.executeWithContext(req.params, req.executionContext);

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
