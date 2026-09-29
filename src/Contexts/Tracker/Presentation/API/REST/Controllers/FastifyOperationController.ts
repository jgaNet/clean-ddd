import { FastifyReply, FastifyRequest } from 'fastify';

import { Exception, NotAllowedException, NotFoundException } from '@SharedKernel/Domain';
import { Module } from '@SharedKernel/Application';

import { OperationFilters } from '@Contexts/Tracker/Application/Ports/IOperationRecords';
import {
  GetMyOperationsQueryHandler,
  GetOperationQueryHandler,
  GetOperationsQueryHandler,
} from '@Contexts/Tracker/Application/Queries';

/** Read-only: the Tracker has no commands. Same shape as FastifyNoteController. */
export class FastifyOperationController {
  #module: Module;

  constructor({ module }: { module: Module }) {
    this.#module = module;
  }

  async getOperations(req: FastifyRequest<{ Querystring: { traceId?: string } }>, reply: FastifyReply) {
    const result = await this.#module.getQuery(GetOperationsQueryHandler).handle(req.query, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  async getMyOperations(req: FastifyRequest<{ Querystring: OperationFilters }>, reply: FastifyReply) {
    const result = await this.#module.getQuery(GetMyOperationsQueryHandler).handle(req.query, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  async getOperation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const result = await this.#module.getQuery(GetOperationQueryHandler).handle(req.params, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  private refuse(reply: FastifyReply, error: Exception) {
    if (error instanceof NotAllowedException) reply.code(403);
    else if (error instanceof NotFoundException) reply.code(404);
    else reply.code(400);

    return { message: error.message };
  }
}
