import { FastifyReply, FastifyRequest } from 'fastify';

import { Exception, NotAllowedException, NotFoundException } from '@Architecture/Domain';
import { ExecutionContext, Module } from '@Architecture/Application';
import { acceptCommand, notAllowedStatus } from '@Architecture/Presentation/AcceptCommand';

import { ValidateAccountCommandEvent } from '@Contexts/Security/Application/Commands';
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

    return result.isFailure() ? this.refuse(reply, result.error, req.executionContext) : result.data;
  }

  /**
   * An administrator's: a caller who is not signed in is refused at once with 401; whether a
   * signed-in caller may validate by id is the handler's decision, on the operation.
   */
  async validateAccountById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    return acceptCommand(
      req,
      reply,
      this.#securityModule,
      ValidateAccountCommandEvent.set({ accountId: req.params.id }),
    );
  }

  private refuse(reply: FastifyReply, error: Exception, context: ExecutionContext) {
    if (error instanceof NotAllowedException) reply.code(notAllowedStatus(context));
    else if (error instanceof NotFoundException) reply.code(404);
    else reply.code(400);

    return { message: error.message };
  }
}
