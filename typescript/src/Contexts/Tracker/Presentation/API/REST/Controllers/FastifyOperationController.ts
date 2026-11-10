import { FastifyReply, FastifyRequest } from 'fastify';

import { Exception, NotAllowedException, NotFoundException } from '@Architecture/Domain';
import { ExecutionContext, Module } from '@Architecture/Application';
import { notAllowedStatus } from '@Architecture/Presentation/AcceptCommand';

import { GetOperationQueryHandler, GetOperationsQueryHandler } from '@Contexts/Tracker/Application/Queries';

/** Read-only: the Tracker has no commands. Same shape as FastifyNoteController. */
export class FastifyOperationController {
  #module: Module;

  constructor({ module }: { module: Module }) {
    this.#module = module;
  }

  async getOperations(req: FastifyRequest<{ Querystring: { traceId?: string } }>, reply: FastifyReply) {
    const result = await this.#module.getQuery(GetOperationsQueryHandler).handle(req.query, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error, req.executionContext) : result.data;
  }

  async getOperation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const result = await this.#module.getQuery(GetOperationQueryHandler).handle(req.params, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error, req.executionContext) : result.data;
  }

  private refuse(reply: FastifyReply, error: Exception, context: ExecutionContext) {
    if (error instanceof NotAllowedException) reply.code(notAllowedStatus(context));
    else if (error instanceof NotFoundException) reply.code(404);
    else reply.code(400);

    return { message: error.message };
  }
}
