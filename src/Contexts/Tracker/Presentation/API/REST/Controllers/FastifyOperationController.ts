import { FastifyReply, FastifyRequest } from 'fastify';

import { NotFoundException } from '@SharedKernel/Domain';
import { Module } from '@SharedKernel/Application';

import { GetOperationsHandler } from '@Contexts/Tracker/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/Tracker/Application/Queries/GetOperation';

export class FastifyOperationController {
  #module: Module;

  constructor({ module }: { module: Module }) {
    this.#module = module;
  }

  async getOperations(req: FastifyRequest<{ Querystring: { traceId?: string } }>, reply: FastifyReply) {
    try {
      const result = await this.#module.getQuery(GetOperationsHandler).handle(req.query, req.executionContext);

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
      const result = await this.#module.getQuery(GetOperationHandler).handle(req.params, req.executionContext);

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
