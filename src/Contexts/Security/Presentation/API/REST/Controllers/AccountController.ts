import { FastifyReply, FastifyRequest } from 'fastify';
import { Module } from '@SharedKernel/Application';
import { ValidateAccountCommandEvent } from '@Contexts/Security/Application/Commands/ValidateAccount/ValidateAccountCommandEvent';
import { GetAccountQueryHandler } from '@Contexts/Security/Application/Queries/GetAccount/GetAccountQueryHandler';
import { NotAllowedException } from '@SharedKernel/Domain';

export class FastifyAccountController {
  #securityModule: Module;

  constructor({ module }: { module: Module }) {
    this.#securityModule = module;
  }

  async getAccountById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const meResult = await this.#securityModule
        .getQuery(GetAccountQueryHandler)
        .handle(req.params.id, req.executionContext);

      if (meResult.isFailure()) {
        return reply.code(401).send({
          error: meResult.error?.message,
        });
      }

      return meResult.data;
    } catch (error) {
      if (error instanceof NotAllowedException) {
        return reply.code(401).send({
          error: error.message,
        });
      }
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'An error occurred during login',
      });
    }
  }

  async validateAccountById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const context = req.executionContext;

    // Whether this caller may validate by id is the handler's decision, from the context.
    const operation = context.eventBus.publish(ValidateAccountCommandEvent.set({ accountId: req.params.id }), context);

    return reply.code(202).send({ operationId: operation.id });
  }
}
