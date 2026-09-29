import { FastifyReply, FastifyRequest } from 'fastify';

import { Exception, NotAllowedException, NotFoundException } from '@SharedKernel/Domain';
import { Module } from '@SharedKernel/Application';

import { UnlockAccountCommandEvent, ValidateAccountCommandEvent } from '@Contexts/Security/Application/Commands';
import { GetAccountQueryHandler } from '@Contexts/Security/Application/Queries';

/** Accounts as an administrator (or their owner) sees them. Same shape as FastifyNoteController. */
export class FastifyAccountController {
  #securityModule: Module;

  constructor({ module }: { module: Module }) {
    this.#securityModule = module;
  }

  async getAccountById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const result = await this.#securityModule
      .getQuery(GetAccountQueryHandler)
      .handle(req.params.id, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  async validateAccountById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const context = req.executionContext;

    // Whether this caller may validate by id is the handler's decision, from the context.
    const operation = context.eventBus.publish(ValidateAccountCommandEvent.set({ accountId: req.params.id }), context);

    reply.code(202);
    return { operationId: operation.id };
  }

  async unlockAccountById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const context = req.executionContext;

    // Administrators only: the handler's guard decides, and a refusal is on the operation.
    const operation = context.eventBus.publish(UnlockAccountCommandEvent.set({ accountId: req.params.id }), context);

    reply.code(202);
    return { operationId: operation.id };
  }

  private refuse(reply: FastifyReply, error: Exception) {
    if (error instanceof NotAllowedException) reply.code(403);
    else if (error instanceof NotFoundException) reply.code(404);
    else reply.code(400);

    return { message: error.message };
  }
}
